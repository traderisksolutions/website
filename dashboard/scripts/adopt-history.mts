/**
 * Track record: every quotation request already in the mailbox becomes a placement, so each client
 * shows what was asked, of whom, and what came back — including requests that never finished.
 *
 *   plan   reads every unplaced client request thread and every loose insurer quote thread with the
 *          placement agent, groups them, and writes the plan to a JSON file. Writes nothing.
 *   apply  creates the placements from that plan: lines, one round, one dispatch per insurer thread
 *          (status sent, dated from the mailbox), then replays each insurer reply through the
 *          normal reply reader so quotes land in the grid. No draft is created; no chase is set.
 *   undo   deletes every row created by apply (created_by = 'history').
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/adopt-history.mts plan  <plan.json>
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/adopt-history.mts apply <plan.json>
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/adopt-history.mts undo
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fetchAllRows as raw } from '@/lib/postgrest-all'
import * as store from '@/lib/placement/store'
import { readRequest } from '@/lib/placement/agent'
import { handleInbound } from '@/lib/placement/workflow'
import { isInternal } from '@/lib/placement/match'
import { normaliseSpec } from '@/lib/placement/spec'
import { normCompany } from '@/lib/gb/intake'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { clientsForThreads } from '@/lib/nexus/company-view'
import type { Spec } from '@/lib/placement/types'

const KEY = process.env.SUPABASE_SERVICE_KEY!, BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const all = <T,>(q: string) => raw<T>(BASE + q, HDR)
const ACTOR = 'history'
const REQUEST_CATS = ['rfq', 'renewal', 'group_benefits']
/** Threads further apart than this are separate requests, even for the same client and line. */
const WINDOW_DAYS = 150
/** A request with no mail for longer than this is closed in the record. */
const OPEN_DAYS = 45
const day = 86_400_000

type Line = { product_line: string; label: string; spec: Spec; confidence: number }
type InsurerThread = {
  thread_id: string; gmail_thread_id: string | null; insurer_company_id: string; insurer_name: string
  to_email: string | null; first_at: string; last_at: string; last_inbound_at: string | null; replies: string[]; line: Line | null
}
type Group = {
  client_id: string; client_name: string; title: string; client_thread_id: string | null; inception_date: string | null
  lines: Line[]; insurers: (InsurerThread & { line_index: number })[]; first_at: string; last_at: string; status: 'open' | 'closed'
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let next = 0
  await Promise.all(Array.from({ length: n }, async () => { while (next < xs.length) { const i = next++; out[i] = await fn(xs[i], i) } }))
  return out
}

async function readLines(threadId: string, companyName: string | null): Promise<{ title: string; inception_date: string | null; lines: Line[] } | null> {
  const msgs = await store.threadMessages(threadId)
  if (!msgs.length) return null
  const atts = (await Promise.all(msgs.filter(m => m.has_attachments).map(m => store.attachmentsFor(m.id, true, 20_000)))).flat()
  const r = await readRequest(msgs, atts, companyName)
  return r ? { title: r.title, inception_date: r.inception_date, lines: r.lines.filter(l => l.confidence >= 0.5) as Line[] } : null
}

async function plan(out: string) {
  const [threads, ti, placements, dispatches, companies] = await Promise.all([
    all<any>('email_threads?select=id,subject,gmail_thread_id,company_id,category,last_message_at,created_at'),
    all<any>('thread_insurers?select=thread_id,insurer_company_id,client_company_id'),
    all<any>('placements?select=client_thread_id'),
    all<any>('placement_dispatches?select=thread_id'),
    all<any>('companies?select=id,company_name,kind'),
  ])
  const co = new Map(companies.map((c: any) => [c.id, c]))
  const clients = companies.filter((c: any) => c.kind === 'client' && c.company_name)
  const byNorm = new Map(clients.map((c: any) => [normCompany(c.company_name), c]))
  const th = new Map(threads.map((t: any) => [t.id, t]))
  const placed = new Set(placements.map((p: any) => p.client_thread_id).filter(Boolean))
  const dispatched = new Set(dispatches.map((d: any) => d.thread_id).filter(Boolean))

  // A client named in an insurer thread's subject, when the thread was filed without one.
  const clientFromSubject = (subject: string): any => {
    const s = normCompany(subject)
    let best: any = null
    for (const [k, c] of byNorm) if (k.length >= 4 && s.includes(k) && (!best || k.length > normCompany(best.company_name).length)) best = c
    if (best) return best
    // "JGC Asia" in a subject, "JGC ASIA PACIFIC PTE. LTD." on file: the first word of the name, when only one client has it.
    const words = subject.toLowerCase().match(/[a-z0-9&]{3,}/g) ?? []
    const hits = clients.filter((c: any) => { const w = String(c.company_name).toLowerCase().match(/[a-z0-9&]{3,}/)?.[0]; return w && w.length >= 3 && !['the', 'pte', 'trs'].includes(w) && words.includes(w) })
    return hits.length === 1 ? hits[0] : null
  }

  const clientThreads = threads.filter((t: any) => REQUEST_CATS.includes(t.category) && co.get(t.company_id)?.kind === 'client' && !placed.has(t.id))
  const insurerRows = ti.filter((r: any) => REQUEST_CATS.includes(th.get(r.thread_id)?.category) && !dispatched.has(r.thread_id))
  console.log(`client request threads ${clientThreads.length}, insurer threads ${insurerRows.length}`)

  const clientReads = await pool(clientThreads, 4, async (t: any, i) => {
    const r = await readLines(t.id, co.get(t.company_id)?.company_name ?? null).catch(() => null)
    if (i % 10 === 0) console.log(`client ${i + 1}/${clientThreads.length}`)
    return { t, r }
  })

  const insurerReads = await pool(insurerRows, 4, async (row: any, i) => {
    const t = th.get(row.thread_id)
    const client = row.client_company_id ? co.get(row.client_company_id) : clientFromSubject(t.subject ?? '')
    const msgs = await store.threadMessages(row.thread_id, 60)
    const inbound = msgs.filter(m => m.direction === 'inbound' && !isInternal(m.from_address))
    const r = await readLines(row.thread_id, client?.company_name ?? null).catch(() => null)
    if (i % 10 === 0) console.log(`insurer ${i + 1}/${insurerRows.length}`)
    const ins = co.get(row.insurer_company_id)
    const it: InsurerThread = {
      thread_id: row.thread_id, gmail_thread_id: t.gmail_thread_id, insurer_company_id: row.insurer_company_id,
      insurer_name: shortInsurer(ins?.company_name) || ins?.company_name || 'Insurer',
      to_email: inbound.at(-1)?.from_address?.toLowerCase() ?? null,
      first_at: msgs[0]?.sent_at ?? t.created_at, last_at: msgs.at(-1)?.sent_at ?? t.last_message_at,
      last_inbound_at: inbound.at(-1)?.sent_at ?? null, replies: inbound.map(m => m.id), line: r?.lines[0] ?? null,
    }
    return { client, it, title: r?.title ?? t.subject }
  })

  const groups: Group[] = []
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= WINDOW_DAYS * day
  for (const { t, r } of clientReads) {
    if (!r || r.lines.length === 0) continue
    const c = co.get(t.company_id)
    groups.push({ client_id: c.id, client_name: c.company_name, title: r.title, client_thread_id: t.id, inception_date: r.inception_date,
      lines: r.lines, insurers: [], first_at: t.created_at, last_at: t.last_message_at ?? t.created_at, status: 'open' })
  }
  const unattached: typeof insurerReads = []
  for (const x of insurerReads) {
    if (!x.client || !x.it.line) { unattached.push(x); continue }
    const g = groups.find(g => g.client_id === x.client.id && g.lines.some(l => l.product_line === x.it.line!.product_line) && near(g.first_at, x.it.first_at))
    if (g) { g.insurers.push({ ...x.it, line_index: g.lines.findIndex(l => l.product_line === x.it.line!.product_line) }); continue }
    // No client request thread: the insurer threads for one client and line make their own record.
    const own = groups.find(g => !g.client_thread_id && g.client_id === x.client.id && g.lines[0].product_line === x.it.line!.product_line && near(g.first_at, x.it.first_at))
    if (own) own.insurers.push({ ...x.it, line_index: 0 })
    else groups.push({ client_id: x.client.id, client_name: x.client.company_name, title: x.title ?? x.it.line.label, client_thread_id: null, inception_date: null,
      lines: [x.it.line], insurers: [{ ...x.it, line_index: 0 }], first_at: x.it.first_at, last_at: x.it.last_at, status: 'open' })
  }
  const now = Date.now()
  for (const g of groups) {
    const lastAt = [g.last_at, ...g.insurers.map(i => i.last_at)].filter(Boolean).sort().at(-1)!
    g.last_at = lastAt
    g.status = now - Date.parse(lastAt) > OPEN_DAYS * day ? 'closed' : 'open'
  }
  writeFileSync(out, JSON.stringify({ made_at: new Date().toISOString(), groups, unattached: unattached.map(x => ({ thread_id: x.it.thread_id, insurer: x.it.insurer_name, client: x.client?.company_name ?? null, line: x.it.line?.product_line ?? null, subject: th.get(x.it.thread_id)?.subject })) }, null, 2))
  const skippedClient = clientReads.filter(x => !x.r || x.r.lines.length === 0).length
  console.log(`groups ${groups.length} (open ${groups.filter(g => g.status === 'open').length}), lines ${groups.reduce((n, g) => n + g.lines.length, 0)}, insurer threads attached ${groups.reduce((n, g) => n + g.insurers.length, 0)}, insurer replies ${groups.reduce((n, g) => n + g.insurers.reduce((m, i) => m + i.replies.length, 0), 0)}`)
  console.log(`client threads with no line read ${skippedClient}; insurer threads left out ${unattached.length} (no client ${unattached.filter(x => !x.client).length}, no line ${unattached.filter(x => x.client && !x.it.line).length})`)
}

/**
 * Re-files insurer-only records whose "client" is an insurer (thread_insurers rows filed from the
 * insurer's side) under the client the thread names. No model call.
 */
async function regroup(file: string) {
  const plan = JSON.parse(readFileSync(file, 'utf8')) as { groups: Group[]; unattached: unknown[] }
  const kinds = new Map((await all<any>('companies?select=id,kind')).map((c: any) => [c.id, c.kind]))
  const bad = plan.groups.filter(g => kinds.get(g.client_id) !== 'client')
  const keep = plan.groups.filter(g => kinds.get(g.client_id) === 'client')
  const clients = await clientsForThreads(bad.flatMap(g => g.insurers.map(i => i.thread_id)))
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= WINDOW_DAYS * day
  let moved = 0, dropped = 0
  for (const g of bad) for (const it of g.insurers) {
    const c = clients.get(it.thread_id)
    const line = it.line ?? g.lines[it.line_index] ?? g.lines[0]
    if (!c || kinds.get(c.id) !== 'client') { plan.unattached.push({ thread_id: it.thread_id, insurer: it.insurer_name, client: null, line: line?.product_line ?? null }); dropped++; continue }
    const target = keep.find(k => k.client_id === c.id && k.lines.some(l => l.product_line === line.product_line) && near(k.first_at, it.first_at))
    if (target) target.insurers.push({ ...it, line_index: target.lines.findIndex(l => l.product_line === line.product_line) })
    else keep.push({ ...g, client_id: c.id, client_name: c.name, client_thread_id: null, lines: [line], insurers: [{ ...it, line_index: 0 }], first_at: it.first_at, last_at: it.last_at })
    moved++
  }
  plan.groups = keep
  writeFileSync(file, JSON.stringify(plan, null, 2))
  console.log(`re-filed ${moved} insurer threads under their client, ${dropped} left out; records now ${keep.length}`)
}

async function apply(file: string) {
  const { groups } = JSON.parse(readFileSync(file, 'utf8')) as { groups: Group[] }
  const placedNow = new Set((await all<any>('placements?select=client_thread_id')).map((p: any) => p.client_thread_id).filter(Boolean))
  const dispatchedNow = new Set((await all<any>('placement_dispatches?select=thread_id')).map((d: any) => d.thread_id).filter(Boolean))
  let made = 0, dispatches = 0, replays = 0
  for (const [gi, g] of groups.entries()) {
    if (g.client_thread_id && placedNow.has(g.client_thread_id)) continue
    const fresh = g.insurers.filter(i => !dispatchedNow.has(i.thread_id))
    const thread = g.client_thread_id ? await store.thread(g.client_thread_id) : null
    const [p] = await store.insert<any>('placements', {
      company_id: g.client_id, title: g.title.slice(0, 160), client_thread_id: g.client_thread_id, client_contact_id: thread?.contact_id ?? null,
      inception_date: g.inception_date, created_by: ACTOR, created_at: g.first_at, notes: 'Recorded from the mailbox (history sweep).',
    })
    const lines = await store.insert<any>('placement_lines', g.lines.map((l, i) => ({
      placement_id: p.id, product_line: l.product_line, label: l.label, spec: normaliseSpec(l.spec), sort: i, status: 'quoting',
    })))
    const rounds = await store.insert<any>('placement_rounds', lines.map((l: any) => ({
      placement_id: p.id, line_id: l.id, round_no: 1, spec: l.spec, reason: 'initial', opened_by: ACTOR, opened_at: g.first_at,
    })))
    for (const [i, l] of lines.entries()) await store.patch('placement_lines', `id=eq.${l.id}`, { current_round_id: rounds[i].id })
    for (const it of fresh) {
      const l = lines[it.line_index] ?? lines[0], r = rounds[it.line_index] ?? rounds[0]
      await store.insert('placement_dispatches', {
        placement_id: p.id, line_id: l.id, round_id: r.id, company_id: g.client_id, insurer_company_id: it.insurer_company_id,
        insurer_name: it.insurer_name, to_email: it.to_email ?? '', thread_id: it.thread_id, gmail_thread_id: it.gmail_thread_id,
        status: 'sent', sent_at: it.first_at, last_outbound_at: it.first_at, last_inbound_at: it.last_inbound_at, sent_by: ACTOR,
      })
      dispatches++
      for (const mid of it.replies) {
        await handleInbound({ message_id: mid, thread_id: it.thread_id, gmail_thread_id: it.gmail_thread_id, direction: 'inbound' }).catch(e => console.log(`  reply ${mid}: ${e instanceof Error ? e.message : e}`))
        replays++
      }
    }
    // A record of the past: nothing to chase. Old requests close; their lines say how far they got.
    await store.patch('placement_dispatches', `placement_id=eq.${p.id}`, { next_chase_at: null })
    if (g.status === 'closed') {
      await store.patch('placements', `id=eq.${p.id}`, { status: 'closed' })
      await store.patch('placement_lines', `placement_id=eq.${p.id}&status=in.(open,quoting,quoted)`, { status: 'closed' })
    }
    await store.log({ company_id: g.client_id, placement_id: p.id, kind: 'opened', actor: ACTOR, thread_id: g.client_thread_id,
      text: `Recorded from the mailbox: ${g.lines.map(l => l.label).join(', ')} — ${fresh.length} insurer thread${fresh.length === 1 ? '' : 's'}${g.status === 'closed' ? '; closed, no mail for 45 days' : ''}` })
    made++
    console.log(`${gi + 1}/${groups.length} ${g.client_name} · ${g.lines.map(l => l.label).join(', ')} · ${fresh.length} insurers · ${g.status}`)
  }
  console.log(`placements ${made}, dispatches ${dispatches}, replies read ${replays}`)
}

async function undo() {
  const ps = await all<any>(`placements?created_by=eq.${ACTOR}&select=id`)
  const ids = ps.map((p: any) => p.id)
  for (let i = 0; i < ids.length; i += 50) {
    const f = `placement_id=in.(${ids.slice(i, i + 50).join(',')})`
    for (const t of ['placement_log', 'placement_quotes', 'placement_tiers', 'placement_dispatches', 'placement_rounds', 'placement_lines'])
      await fetch(`${BASE}${t}?${f}`, { method: 'DELETE', headers: HDR })
    await fetch(`${BASE}placements?id=in.(${ids.slice(i, i + 50).join(',')})`, { method: 'DELETE', headers: HDR })
  }
  console.log(`removed ${ids.length} placements`)
}

const [cmd, file] = process.argv.slice(2)
if (cmd === 'plan') await plan(file ?? 'adopt-plan.json')
else if (cmd === 'regroup') await regroup(file ?? 'adopt-plan.json')
else if (cmd === 'apply') await apply(file ?? 'adopt-plan.json')
else if (cmd === 'undo') await undo()
else console.log('usage: plan <file> | apply <file> | undo')
