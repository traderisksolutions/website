/**
 * The follow-up monitor, run by the hourly sweep:
 *   1. register  every email TRS sent in the last 3 days (dashboard or Gmail, every mailbox) that
 *                waits on a reply, with the default schedule for its type unless a person set one
 *   2. replies   a reply from the other side closes the follow-up; a newer TRS email on the
 *                thread supersedes it (that email has its own)
 *   3. chases    a due follow-up gets a chase drafted on the same thread, on its case (opened if
 *                the thread has none). Pre-approved chases are left for the auto-sender; the rest
 *                wait on Today. After the last chase the case asks a person to call.
 * Nothing here sends.
 */
import { sbTry, enc, isInternal, isAutomated, bareEmail } from '@/lib/crm/db'
import { addDays, chaseText, classify, defaultSchedule, expectsReply, type Party } from './rules'

type Row = Record<string, any>
const LOOKBACK_MS = 3 * 86_400_000

let insurerDomains: { at: number; set: Set<string> } | null = null
async function insurerSet(): Promise<Set<string>> {
  if (insurerDomains && Date.now() - insurerDomains.at < 600_000) return insurerDomains.set
  const rows = await sbTry<Row[]>('companies?kind=in.(insurer,tpa)&select=domain,domains&limit=1000', [])
  insurerDomains = { at: Date.now(), set: new Set(rows.flatMap(r => [r.domain, ...(r.domains ?? [])]).filter(Boolean).map((d: string) => d.toLowerCase())) }
  return insurerDomains.set
}
const partyOf = (emails: string[], ins: Set<string>): Party => emails.some(e => { const d = e.split('@')[1] ?? ''; return ins.has(d) || [...ins].some(x => d.endsWith('.' + x)) }) ? 'insurer' : emails.length ? 'client' : 'other'

/** 1. Every recent outbound email waiting on a reply gets a follow-up row (once). */
export async function registerSent(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString()
  const all = await sbTry<Row[]>(`email_messages?sent_at=gte.${enc(since)}&from_address=ilike.*trade-risksol.com*&deleted_at=is.null&select=id,thread_id,from_address,subject,body_text,sent_at,rfc822_message_id&order=sent_at.asc&limit=2000`, [])
  if (!all.length) return 0
  // One email is stored once per mailbox that holds it (the sender's, operations@, a colleague in
  // copy): it is one follow-up. The copies share the RFC 822 Message-ID.
  const key = (m: Row) => m.rfc822_message_id ? String(m.rfc822_message_id) : `${m.from_address}|${m.subject}|${String(m.sent_at).slice(0, 16)}`
  const copies = new Map<string, Row[]>()
  for (const m of all) copies.set(key(m), [...(copies.get(key(m)) ?? []), m])
  const tracked = new Set((await sbTry<Row[]>(`email_followups?message_id=in.(${all.map(m => m.id).join(',')})&select=message_id`, [])).map(r => r.message_id))
  const msgs = Array.from(copies.values()).filter(g => !g.some(m => tracked.has(m.id))).map(g => g[0])
  const todo = msgs
  if (!todo.length) return 0
  const ins = await insurerSet()
  const people = await sbTry<Row[]>(`email_participants?message_id=in.(${todo.map(m => m.id).join(',')})&role=in.(to,cc)&select=message_id,email,role`, [])
  const links = await sbTry<Row[]>(`work_item_threads?thread_id=in.(${Array.from(new Set(todo.map(m => m.thread_id))).join(',')})&select=thread_id,work_item_id`, [])
  const rows: Row[] = []
  for (const m of todo) {
    const to = people.filter(p => p.message_id === m.id && p.role === 'to').map(p => String(p.email).toLowerCase()).filter(e => !isInternal(e) && !isAutomated(e))
    const cc = people.filter(p => p.message_id === m.id && p.role === 'cc').map(p => String(p.email).toLowerCase())
    if (!to.length) continue                                   // internal-only or to nobody: nothing to chase
    const party = partyOf(to, ins)
    const type = classify({ subject: m.subject, body: m.body_text, party })
    // A chase on a thread whose follow-up is open is that follow-up working, not a new one.
    const chasing = type === 'chase' && (await sbTry<Row[]>(`email_followups?thread_id=eq.${enc(m.thread_id)}&status=eq.waiting&select=id&limit=1`, [])).length > 0
    const wants = !chasing && expectsReply(type, m.body_text)
    const s = defaultSchedule(party, type)
    rows.push({
      message_id: m.id, thread_id: m.thread_id, work_item_id: links.find(l => l.thread_id === m.thread_id)?.work_item_id ?? null,
      sent_at: m.sent_at, sent_by: bareEmail(m.from_address), to_party: party, to_email: to.join(', '), cc: cc.join(', ') || null, subject: m.subject,
      email_type: type, expects_reply: wants, first_after_days: s.firstAfterDays, every_days: s.everyDays, working_days: s.workingDays, max_chases: s.maxChases,
      next_chase_at: wants ? addDays(m.sent_at, s.firstAfterDays, s.workingDays) : null, set_by: 'rule', status: wants ? 'waiting' : 'not_needed',
    })
  }
  if (rows.length) await sbTry('email_followups?on_conflict=message_id', null, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) })
  return rows.length
}

/** 2. Replies close follow-ups; a newer TRS email on the thread supersedes the older one. */
export async function markReplies(): Promise<{ replied: number; superseded: number }> {
  const open = await sbTry<Row[]>('email_followups?status=eq.waiting&select=id,thread_id,sent_at,message_id&limit=2000', [])
  let replied = 0, superseded = 0
  const threads = Array.from(new Set(open.map(o => o.thread_id).filter(Boolean)))
  for (let i = 0; i < threads.length; i += 40) {
    const chunk = threads.slice(i, i + 40)
    const msgs = await sbTry<Row[]>(`email_messages?thread_id=in.(${chunk.join(',')})&deleted_at=is.null&select=id,thread_id,from_address,sent_at,subject,body_text&order=sent_at.asc&limit=5000`, [])
    for (const f of open.filter(o => chunk.includes(o.thread_id))) {
      const later = msgs.filter(m => m.thread_id === f.thread_id && m.id !== f.message_id && String(m.sent_at) > String(f.sent_at))
      const reply = later.find(m => !isInternal(bareEmail(m.from_address)))
      if (reply) { await patch(f.id, { status: 'replied', replied_at: reply.sent_at, next_chase_at: null }); replied++; continue }
      // A chase TRS sent on the thread is this follow-up working, not a new email to track.
      const ours = later.filter(m => isInternal(bareEmail(m.from_address)))
      if (ours.some(m => classify({ subject: m.subject, body: m.body_text, party: 'other' }) !== 'chase')) { await patch(f.id, { status: 'superseded', next_chase_at: null }); superseded++ }
    }
  }
  return { replied, superseded }
}
const patch = (id: string, body: Row) => sbTry(`email_followups?id=eq.${enc(id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) })

/** The case a chase sits on: the thread's, else a new one so the chase shows on Today. */
async function caseFor(f: Row): Promise<string | null> {
  if (f.work_item_id) return f.work_item_id
  const [l] = await sbTry<Row[]>(`work_item_threads?thread_id=eq.${enc(f.thread_id)}&select=work_item_id,work_items(closed_at)`, [])
  if (l && !l.work_items?.closed_at) return l.work_item_id
  const [t] = await sbTry<Row[]>(`email_threads?id=eq.${enc(f.thread_id)}&select=company_id,subject`, [])
  const [made] = await sbTry<Row[]>('work_items', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    company_id: t?.company_id ?? null, case_type: 'other', title: `Follow-up: ${String(f.subject ?? t?.subject ?? 'email').replace(/^((re|fw|fwd)\s*:\s*)+/i, '').slice(0, 120)}`,
    status: f.to_party === 'insurer' ? 'waiting_insurer' : 'waiting_client', waiting_since: String(f.sent_at).slice(0, 10), source: 'followups', confidence: 'high',
    owner_email: f.sent_by && !/^operations@/.test(f.sent_by) ? f.sent_by : null, next_action: 'Send the follow-up',
  }) })
  if (!made) return null
  await sbTry('work_item_threads?on_conflict=work_item_id,thread_id', null, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ work_item_id: made.id, thread_id: f.thread_id, side: f.to_party === 'insurer' ? 'insurer' : 'client', joined_by: 'followups', joined_evidence: 'email waiting on a reply' }) })
  return made.id
}

/** 3. Due follow-ups: a chase drafted, or after the last chase, a call. */
export async function draftDueChases(now = new Date()): Promise<{ drafted: number; chasedOut: number; waitingOnDraft: number }> {
  const due = await sbTry<Row[]>(`email_followups?status=eq.waiting&expects_reply=eq.true&next_chase_at=lte.${enc(now.toISOString())}&select=*&order=next_chase_at.asc&limit=200`, [])
  let drafted = 0, chasedOut = 0, waitingOnDraft = 0
  for (const f of due) {
    // The last chase still unsent: do not stack another on top of it.
    if (f.last_draft_id) { const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(f.last_draft_id)}&select=status`, []); if (d && ['pending', 'draft'].includes(d.status)) { waitingOnDraft++; continue } }
    const item = await caseFor(f)
    if (f.chases >= f.max_chases) {
      await patch(f.id, { status: 'chased_out', next_chase_at: null })
      if (item) await sbTry(`work_items?id=eq.${enc(item)}&needs_human=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ needs_human: `No reply to "${String(f.subject ?? '').slice(0, 80)}" after ${f.max_chases} chases. Call them.`, updated_at: now.toISOString() }) })
      chasedOut++; continue
    }
    const first = String(f.to_email ?? '').split(',')[0].trim()
    const [p] = first ? await sbTry<Row[]>(`email_participants?email=eq.${enc(first)}&name=not.is.null&select=name&limit=1`, []) : []
    const greeting = p?.name ? String(p.name).replace(/[,(].*$/, '').trim().split(/\s+/)[0] : null
    const { subject, body } = chaseText({ party: f.to_party, round: f.chases + 1, subject: f.subject, sentAt: f.sent_at, greeting })
    const [d] = await sbTry<Row[]>('ai_drafts', [], { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      thread_id: f.thread_id, channel: 'email', email_type: 'CASE_WORK', status: 'pending', generated_by: 'template', to_email: f.to_email, cc: f.cc,
      subject, body, attachments: [], work_item_id: item, party: f.to_party === 'insurer' ? 'insurer' : 'client', draft_class: 'followup_chase',
      context_used: { agent: 'followups', kind: 'followup_chase', followup_id: f.id, round: f.chases + 1, preapproved: !!f.preapproved },
    }) })
    if (!d) continue
    if (item) await sbTry(`work_items?id=eq.${enc(item)}&draft_id=is.null`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ draft_id: d.id, updated_at: now.toISOString() }) })
    await patch(f.id, { chases: f.chases + 1, last_draft_id: d.id, work_item_id: item, next_chase_at: addDays(now.toISOString(), f.every_days, f.working_days) })
    drafted++
  }
  return { drafted, chasedOut, waitingOnDraft }
}

export async function runFollowups(now = new Date()) {
  const registered = await registerSent(now)
  const r = await markReplies()
  const c = await draftDueChases(now)
  return { registered, ...r, ...c }
}
