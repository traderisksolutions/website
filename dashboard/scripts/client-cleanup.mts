/**
 * Apply a client-records cleanup plan (see src/lib/crm/cleanup.ts). The plan file holds client
 * data, so it lives outside this public repository and is passed by path.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/client-cleanup.mts dry   <plan.json> [A|B]
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/client-cleanup.mts apply <plan.json> A <log.jsonl>
 *
 * dry    checks every action against the live records and prints what would change. Writes nothing.
 * apply  runs the tier in order. Each action is appended to the log with the values it replaced;
 *        a re-run skips actions the log already holds as done. Merges are also in record_merges.
 * Needs migration 20261031_client_structure.sql.
 */
import fs from 'node:fs'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { mergeCompanies } from '@/lib/crm/domains'
import { recordAlias, aliasKey } from '@/lib/crm/identity'
import { orderPlan, scopeOf, kindOf, actionKey, contactFields, type CleanupAction } from '@/lib/crm/cleanup'

const [cmd, planPath, tierArg = 'A', logPath] = process.argv.slice(2)
if (!['dry', 'apply'].includes(cmd ?? '') || !planPath) { console.log('usage: dry|apply <plan.json> [A|B] [log.jsonl]'); process.exit(1) }
if (cmd === 'apply' && !logPath) { console.log('apply needs a log path'); process.exit(1) }
const tier = tierArg === 'B' ? 'B' : 'A'
const ACTOR = 'client-cleanup-2026-10-31'
const plan = orderPlan(JSON.parse(fs.readFileSync(planPath, 'utf8')) as CleanupAction[], tier)

const done = new Set<string>()
const created = new Map<string, string>()   // new:<name> → id
if (logPath && fs.existsSync(logPath)) {
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line)
    if (r.ok) done.add(r.key)
    if (r.created) created.set(r.created.key, r.created.id)
  }
}
const log = (row: Record<string, unknown>) => { if (logPath) fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n') }

type Row = Record<string, any>
const DRY = 'dry-run-new-entity'
const one = async (table: string, id: string, select = '*'): Promise<Row | null> => (await sbTry<Row[]>(`${table}?id=eq.${enc(id)}&select=${select}&limit=1`, []))[0] ?? null
const patch = (table: string, id: string, body: Row) => sb(`${table}?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
const resolveId = (id: string | null | undefined) => (id?.startsWith('new:') ? created.get(id) ?? null : id ?? null)
const TABLE: Record<string, string> = { company: 'companies', contact: 'contacts', thread: 'email_threads', policy: 'policies', debit_note: 'debit_notes' }

/** Returns what it would change (dry) or changed (apply), or throws with the reason it cannot. */
async function run(a: CleanupAction, write: boolean): Promise<{ change: string; before?: Row; created?: { key: string; id: string } }> {
  const id = resolveId(a.id)
  const target = resolveId(a.target_id)
  const table = TABLE[a.record_type]
  // In a dry run the entities this plan creates do not exist yet.
  if (id === DRY || target === DRY) return { change: `${a.action} on an entity this run creates` }
  if (a.action !== 'create_entity' && !id) throw new Error('record is created earlier in this run')
  const rec = a.action === 'create_entity' ? null : await one(table, id!)
  if (a.action !== 'create_entity' && !rec) throw new Error('record no longer exists')

  switch (a.action) {
    case 'merge': {
      if (!target || !(await one(table, target, 'id'))) throw new Error('survivor no longer exists')
      if (!write) return { change: `merge into ${target}` }
      if (a.record_type === 'company') { const r = await mergeCompanies(id!, target, ACTOR, a.reason); return { change: `merged: ${JSON.stringify(r.moved)}`, before: rec! } }
      const r = await sb('rpc/merge_contacts', { method: 'POST', body: JSON.stringify({ p_keep: target, p_drop: id, p_actor: ACTOR, p_reason: a.reason ?? null }) })
      return { change: `merged: ${JSON.stringify(r)}`, before: rec! }
    }
    case 'fix_email': {
      const email = (a.value ?? '').trim().toLowerCase()
      if (!/^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/.test(email)) throw new Error('no valid address in the plan')
      const clash = await sbTry<Row[]>(`contacts?email=ilike.${enc(email)}&id=neq.${enc(id!)}&select=id&limit=1`, [])
      if (clash.length) throw new Error(`another contact already has ${email}: merge instead`)
      if (write) await patch('contacts', id!, { email })
      return { change: `email ${rec!.email} → ${email}`, before: { email: rec!.email } }
    }
    case 'set_contact': {
      // Fills empty fields only: a name someone typed is never replaced by one read from mail.
      const want = contactFields(a.value)
      const body: Row = {}
      for (const [k, v] of Object.entries(want)) if (v && !rec![k]) body[k] = v
      if (!Object.keys(body).length) return { change: 'already set' }
      if (write) await patch('contacts', id!, body)
      return { change: Object.entries(body).map(([k, v]) => `${k} ${v}`).join(', '), before: Object.fromEntries(Object.keys(body).map(k => [k, rec![k] ?? null])) }
    }
    case 'set_kind': {
      const kind = kindOf(a.value)
      if (rec!.kind === kind) return { change: 'already set' }
      if (write) await patch('companies', id!, { kind })
      return { change: `kind ${rec!.kind} → ${kind}`, before: { kind: rec!.kind } }
    }
    case 'rename': {
      const field = a.record_type === 'company' ? 'company_name' : null
      if (!field || !a.value) throw new Error('only company renames run unattended')
      if (rec![field] === a.value) return { change: 'already set' }
      if (write) { await patch('companies', id!, { company_name: a.value }); await recordAlias(id!, rec![field], 'manual', ACTOR) }
      return { change: `name ${rec![field]} → ${a.value} (old name kept as alias)`, before: { company_name: rec![field] } }
    }
    case 'add_alias': case 'remove_alias': {
      const norm = aliasKey(a.value ?? '')
      if (!norm) throw new Error('empty alias')
      const owner = (await sbTry<Row[]>(`company_aliases?alias_norm=eq.${enc(norm)}&select=id,company_id`, []))[0]
      if (a.action === 'add_alias') {
        if (owner && owner.company_id !== id) throw new Error(`alias already points at ${owner.company_id}`)
        if (owner) return { change: 'already set' }
        if (write) await recordAlias(id!, a.value!, 'manual', ACTOR)
        return { change: `alias + ${a.value}` }
      }
      if (!owner || owner.company_id !== id) return { change: 'already gone' }
      if (write) await sb(`company_aliases?id=eq.${enc(owner.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      return { change: `alias − ${a.value}`, before: owner }
    }
    case 'add_domain': case 'remove_domain': {
      const d = (a.value ?? '').trim().toLowerCase()
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error('not a domain')
      const domains: string[] = rec!.domains ?? []
      if (a.action === 'add_domain') {
        if (domains.includes(d)) return { change: 'already set' }
        const others = await sbTry<Row[]>(`companies?domains=cs.{${enc(d)}}&id=neq.${enc(id!)}&select=id,company_name`, [])
        if (others.length) throw new Error(`domain owned by ${others.map(o => o.company_name).join(', ')}`)
        if (write) await patch('companies', id!, { domains: [...domains, d], domain: rec!.domain ?? d })
        return { change: `domain + ${d}`, before: { domains, domain: rec!.domain } }
      }
      if (!domains.includes(d)) return { change: 'already gone' }
      const left = domains.filter(x => x !== d)
      if (write) await patch('companies', id!, { domains: left, domain: rec!.domain === d ? left[0] ?? null : rec!.domain })
      return { change: `domain − ${d}`, before: { domains, domain: rec!.domain } }
    }
    case 'set_uen': {
      const uen = (a.value ?? '').trim().toUpperCase()
      if (rec!.uen === uen) return { change: 'already set' }
      if (rec!.uen) throw new Error(`already has UEN ${rec!.uen}`)
      const other = await sbTry<Row[]>(`companies?uen=ilike.${enc(uen)}&select=company_name`, [])
      if (other.length) throw new Error(`UEN held by ${other[0].company_name}`)
      if (write) await patch('companies', id!, { uen })
      return { change: `uen ${uen}`, before: { uen: null } }
    }
    case 'create_entity': {
      const name = a.id.slice(4)
      const existing = await sbTry<Row[]>(`companies?company_name=ilike.${enc(name)}&select=id&limit=1`, [])
      if (existing.length) { created.set(a.id, existing[0].id); return { change: 'already on file', created: { key: a.id, id: existing[0].id } } }
      if (!write) { created.set(a.id, DRY); return { change: `create ${name} under ${target ?? '(no parent)'}` } }
      const [row] = await sb<Row[]>('companies', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ company_name: name, kind: 'client', parent_id: target, relation: a.value ?? null, auto_created: false, source: 'review', domains: [], identity_note: a.reason ?? null, identity_at: new Date().toISOString() }),
      })
      created.set(a.id, row.id)
      return { change: `created ${name}`, created: { key: a.id, id: row.id } }
    }
    case 'set_parent': {
      if (!target) throw new Error('parent is created earlier in this run')
      if (rec!.parent_id === target) return { change: 'already set' }
      if (rec!.parent_id) throw new Error(`already has parent ${rec!.parent_id}`)
      // Never a loop: walk up from the parent.
      for (let p: string | null = target, i = 0; p && i < 10; i++) {
        if (p === id) throw new Error('would make a loop')
        p = (await one('companies', p, 'parent_id'))?.parent_id ?? null
      }
      if (write) await patch('companies', id!, { parent_id: target, relation: a.value ?? 'subsidiary' })
      return { change: `parent → ${target} (${a.value})`, before: { parent_id: null, relation: rec!.relation } }
    }
    case 'relink_thread': case 'relink_contact': case 'relink_policy': case 'relink_debit_note': {
      if (!target || !(await one('companies', target, 'id'))) throw new Error('target company not on file')
      if (rec!.company_id === target) return { change: 'already set' }
      if (write) await patch(table, id!, { company_id: target })
      return { change: `company ${rec!.company_id} → ${target}`, before: { company_id: rec!.company_id } }
    }
    case 'handles': {
      if (!target) throw new Error('entity is created earlier in this run')
      const scope = scopeOf(a.value)
      const have = await sbTry<Row[]>(`company_contacts?company_id=eq.${enc(target)}&contact_id=eq.${enc(id!)}&select=id,scope`, [])
      if (have.length) {
        const merged = Array.from(new Set([...(have[0].scope ?? []), ...scope])).sort()
        if (merged.length === (have[0].scope ?? []).length) return { change: 'already set' }
        if (write) await patch('company_contacts', have[0].id, { scope: merged, updated_at: new Date().toISOString() })
        return { change: `scope ${merged.join(',')}`, before: have[0] }
      }
      if (write) await sb('company_contacts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: target, contact_id: id, scope, source: 'review', evidence: [a.value, a.reason].filter(Boolean).join(' — ').slice(0, 500), is_primary: false }) })
      return { change: `handles ${target} [${scope.join(',') || 'unspecified'}]` }
    }
    case 'insures': {
      if (!target) throw new Error('entity is created earlier in this run')
      const have = await sbTry<Row[]>(`policy_insureds?policy_id=eq.${enc(id!)}&company_id=eq.${enc(target)}&select=role`, [])
      if (have.length) return { change: 'already set' }
      if (write) await sb('policy_insureds', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ policy_id: id, company_id: target, role: a.value === 'policyholder' ? 'policyholder' : 'named_insured', source: 'review', evidence: a.reason ?? null }) })
      return { change: `insures ${target} (${a.value})` }
    }
    case 'delete_record': {
      // Only an empty record goes: anything that points at it means it is not junk after all.
      const refs = await sbTry<{ tbl: string; col: string }[]>('rpc/merge_reference_columns', [], { method: 'POST', body: JSON.stringify({ p_table: 'public.companies', p_cols: ['company_id', 'client_company_id', 'insurer_company_id', 'suggested_company_id', 'chosen_insurer_company_id'] }) })
      for (const r of refs) {
        const n = await sbTry<Row[]>(`${r.tbl.replace(/^public\./, '')}?${r.col}=eq.${enc(id!)}&select=${r.col}&limit=1`, [])
        if (n.length) throw new Error(`still referenced by ${r.tbl}.${r.col}`)
      }
      if (write) await sb(`companies?id=eq.${enc(id!)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      return { change: `deleted ${rec!.company_name}`, before: rec! }
    }
    default:
      throw new Error(`${a.action} needs a person`)
  }
}

const migrated = await sb<Row[]>('companies?select=parent_id,uen&limit=1').then(() => true, () => false)
if (!migrated) {
  console.log('Migration 20261031_client_structure.sql is not applied: companies.parent_id is missing.')
  if (cmd === 'apply') process.exit(1)
  console.log('Dry run continues; delete checks and new columns are not verified.\n')
}

const tally: Record<string, number> = {}
for (const a of plan) {
  const key = actionKey(a)
  if (done.has(key)) { tally.skipped = (tally.skipped ?? 0) + 1; continue }
  try {
    const r = await run(a, cmd === 'apply')
    if (r.created) created.set(r.created.key, r.created.id)
    tally[`${a.action}:ok`] = (tally[`${a.action}:ok`] ?? 0) + 1
    console.log(`ok    ${a.action.padEnd(15)} ${a.id.slice(0, 40).padEnd(40)} ${r.change}`)
    if (cmd === 'apply') log({ key, ok: true, action: a.action, id: a.id, target_id: a.target_id ?? null, change: r.change, before: r.before ?? null, created: r.created ?? null })
  } catch (e) {
    tally[`${a.action}:refused`] = (tally[`${a.action}:refused`] ?? 0) + 1
    console.log(`skip  ${a.action.padEnd(15)} ${a.id.slice(0, 40).padEnd(40)} ${String((e as Error).message ?? e)}`)
    if (cmd === 'apply') log({ key, ok: false, action: a.action, id: a.id, error: String((e as Error).message ?? e) })
  }
}
console.log('\n' + Object.entries(tally).sort().map(([k, v]) => `${k} ${v}`).join('\n'))
