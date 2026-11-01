/**
 * Resolver: which client a thread belongs to. One job, in a fixed order, strongest evidence first:
 *
 *   1. policy number   a number on file names the policyholder
 *   2. acts-for        the sender is on file as acting for a client (company_contacts), or works there
 *   3. UEN / signature the sender's own text carries a UEN, or signs with a client's name
 *   4. domain          a domain one client owns; within a group, a named member, else the group
 *   5. subject         the subject names one client
 *   6. a person        "Which client is <sender>?" — never a made-up client record
 *
 * Every step resolves to a client only. A sender at an insurer, a partner broker, a TPA or a
 * vendor is never filed as the client. Mail already filed under a partner broker is read in partner
 * mode, which files each case under the end client (src/lib/casework/run.ts).
 *
 * Steps 1–3 are exported as resolveKnown() so autofile can run them before its domain pass.
 */
import { sbTry, enc, isInternal, isAutomated, bareEmail, emailDomain, PUBLIC_EMAIL_DOMAINS } from '@/lib/crm/db'
import { getCompanyIndex, matchByName } from '@/lib/crm/resolve'
import { buildIdentityIndex, loadAliases, matchName } from '@/lib/crm/identity'
import { recordHousekeeping } from '@/lib/agent-activity'
import { askHuman, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import { readHistory } from './history'
import { isClaimLike, uensIn } from './signals'
import { referencesIn, companyOfReferences } from './references'

type Row = Record<string, any>

export type ResolveStep = 'policy_no' | 'acts_for' | 'employer' | 'uen' | 'signature' | 'domain' | 'group_member' | 'subject'
export type Resolution = { companyId: string; step: ResolveStep; evidence: string }

export type ThreadEvidence = {
  threadId: string
  subject: string | null
  companyId: string | null
  /** Outside addresses on the thread, sender first. */
  people: string[]
  /** Subject plus the latest bodies, for references. */
  text: string
  /** What outside senders wrote on top of their own messages (their signatures live here). */
  ownText: string
  signedOrg: string | null
}

export async function threadEvidence(threadId: string): Promise<ThreadEvidence | null> {
  const [t] = await sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,subject,company_id,contacts(email,company)`, [])
  if (!t) return null
  const msgs = await sbTry<Row[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=from_address,subject,body_text,sent_at&order=sent_at.desc&limit=4`, [])
  const parts = await sbTry<Row[]>(`email_participants?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=email,role`, [])
  const people: string[] = []
  const add = (e: string | null | undefined) => { const x = bareEmail(e); if (x && !isInternal(x) && !isAutomated(x) && !people.includes(x)) people.push(x) }
  for (const m of msgs) add(m.from_address)
  for (const p of parts) add(p.email)
  const own = msgs.filter(m => !isInternal(bareEmail(m.from_address))).map(m => readHistory(m.body_text ?? '', m.subject).top)
  return {
    threadId, subject: t.subject ?? null, companyId: t.company_id ?? null, people,
    text: [t.subject, ...msgs.map(m => `${m.subject ?? ''}\n${String(m.body_text ?? '').slice(0, 12000)}`)].join('\n'),
    ownText: own.join('\n').slice(0, 8000),
    signedOrg: t.contacts?.company?.trim() || null,
  }
}

async function clientIds(ids: string[]): Promise<Row[]> {
  if (!ids.length) return []
  return sbTry<Row[]>(`companies?id=in.(${Array.from(new Set(ids)).join(',')})&kind=eq.client&select=id,company_name`, [])
}

/** Steps 1–3. Null when none of them is conclusive. */
export async function resolveKnown(ev: ThreadEvidence): Promise<Resolution | null> {
  // 1. Policy number.
  const hits = await referencesIn(ev.text)
  const byRef = companyOfReferences(hits)
  if (byRef && (await clientIds([byRef])).length) return { companyId: byRef, step: 'policy_no', evidence: `reference ${hits[0].key} is on file for this client` }

  // 2. Acts-for, then employer.
  if (ev.people.length) {
    const contacts = await sbTry<Row[]>(`contacts?email=in.(${ev.people.slice(0, 20).map(p => `"${p}"`).join(',')})&select=id,email,company_id`, [])
    if (contacts.length) {
      const links = await sbTry<Row[]>(`company_contacts?contact_id=in.(${contacts.map(c => c.id).join(',')})&status=eq.active&select=company_id,contact_id,scope`, [])
      const claims = isClaimLike(ev.subject, ev.text)
      const fit = links.filter(l => { const s: string[] = l.scope ?? []; return !s.length || s.includes('all') || (claims ? s.includes('claims') : true) })
      const ok = await clientIds(fit.map(l => l.company_id))
      if (ok.length === 1) {
        const c = contacts.find(x => fit.some(l => l.contact_id === x.id && l.company_id === ok[0].id))
        return { companyId: ok[0].id, step: 'acts_for', evidence: `${c?.email ?? 'the sender'} acts for ${ok[0].company_name}` }
      }
      const employers = await clientIds(contacts.map(c => c.company_id).filter(Boolean))
      if (employers.length === 1) return { companyId: employers[0].id, step: 'employer', evidence: `${contacts.find(c => c.company_id === employers[0].id)?.email} works at ${employers[0].company_name}` }
    }
  }

  // 3. UEN in the sender's own text, then the organisation they sign with.
  const uens = uensIn(ev.ownText)
  if (uens.length) {
    const rows = await sbTry<Row[]>(`companies?uen=in.(${uens.map(u => `"${u}"`).join(',')})&kind=eq.client&select=id,company_name,uen`, [])
    if (rows.length === 1) return { companyId: rows[0].id, step: 'uen', evidence: `UEN ${rows[0].uen} in the sender's message` }
  }
  if (ev.signedOrg && ev.signedOrg.length >= 3) {
    const index = await getCompanyIndex()
    const m = matchName(ev.signedOrg, buildIdentityIndex(index.companies, await loadAliases()))
    const c = m && m.score >= 0.8 ? index.byId.get(m.companyId) : null
    if (c && c.kind === 'client') return { companyId: c.id, step: 'signature', evidence: `signed "${ev.signedOrg}"` }
  }
  return null
}

/** All five steps. Null means a person decides. */
export async function resolveEvidence(ev: ThreadEvidence): Promise<Resolution | null> {
  const known = await resolveKnown(ev)
  if (known) return known
  const index = await getCompanyIndex()

  // 4. Domain — and within a group, the member the subject names.
  for (const p of ev.people) {
    const owner = index.domains.get(emailDomain(p))
    if (!owner) continue
    const company = index.byId.get(owner)
    if (!company || company.kind !== 'client') continue
    // Members that are clients only: a group can also hold its own broker or vendor records.
    const members = await sbTry<Row[]>(`companies?parent_id=eq.${enc(owner)}&or=(kind.eq.client,kind.is.null)&select=id,company_name`, [])
    if (members.length) {
      const sub = matchByName(ev.subject, { ...index, keys: new Map(Array.from(index.keys).filter(([, id]) => members.some(m => m.id === id))) })
      if (sub) return { companyId: sub.companyId, step: 'group_member', evidence: `${emailDomain(p)} is ${company.name}'s; the subject names ${index.byId.get(sub.companyId)?.name}` }
    }
    return { companyId: owner, step: 'domain', evidence: `${emailDomain(p)} belongs to ${company.name}` }
  }

  // 5. Subject.
  const hit = matchByName(ev.subject, index)
  if (hit && index.byId.get(hit.companyId)?.kind === 'client') return { companyId: hit.companyId, step: 'subject', evidence: hit.evidence }
  return null
}

/** resolver · thread */
export async function resolveTask(task: AgentTask) {
  const threadId = String(task.payload.thread_id ?? task.thread_id ?? '')
  const ev = await threadEvidence(threadId)
  if (!ev) { await skip(task.id, 'thread not found'); return 'handled' as const }
  if (ev.companyId) { await skip(task.id, 'already filed'); return 'handled' as const }
  // A person answered "which client?": file it, and remember the sender as acting for that client
  // so the next email from them resolves at step 2.
  const human = task.payload.human as { company_id?: string; by?: string } | undefined
  if (human?.company_id) {
    await sbTry(`email_threads?id=eq.${enc(threadId)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: human.company_id }) })
    const sender = ev.people[0]
    const [contact] = sender ? await sbTry<Row[]>(`contacts?email=ilike.${enc(sender)}&select=id&limit=1`, []) : []
    if (contact) await sbTry('company_contacts?on_conflict=company_id,contact_id', null, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ company_id: human.company_id, contact_id: contact.id, source: 'staff', status: 'active', evidence: `answered by ${human.by ?? 'staff'} on thread ${threadId}` }) })
    recordHousekeeping({ action: 'thread.filed', subject: human.company_id, resourceType: 'thread', resourceId: threadId, basis: `resolver: answered by ${human.by ?? 'staff'}`, metadata: { thread_subject: ev.subject, company_id: human.company_id } })
    return { company_id: human.company_id, step: 'staff', by: human.by ?? null }
  }
  const r = await resolveEvidence(ev)
  if (r) {
    await sbTry(`email_threads?id=eq.${enc(threadId)}&company_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ company_id: r.companyId }) })
    recordHousekeeping({ action: 'thread.filed', subject: r.companyId, resourceType: 'thread', resourceId: threadId, basis: `resolver: ${r.step} — ${r.evidence}`, metadata: { thread_subject: ev.subject, company_id: r.companyId, step: r.step } })
    return { company_id: r.companyId, step: r.step, evidence: r.evidence }
  }
  const sender = ev.people[0] ?? (task.payload.sender as string | null) ?? 'this sender'
  const domain = emailDomain(sender)
  await askHuman(task.id, `Which client is ${sender}?`, {
    sender, domain: domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : null, subject: ev.subject,
    guess: task.payload.guess ?? null, people: ev.people.slice(0, 6),
  })
  return 'handled' as const
}
