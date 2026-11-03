/**
 * The work queue: open items with their draft, ranked so the next thing to do is first, and the
 * few actions a person takes on them. Approving a draft fills the signature with the approver's
 * name; the send itself goes through /api/email/send like every other reply.
 */
import { fillVoice } from '@/lib/admin/b/voice'
import { ensureDraftContact } from '@/lib/today/data'
import { sb, sbTry, enc, emailDomain } from '@/lib/crm/db'
import { queueRank, type CaseStatus } from './clean'
import { laterActive, setLater, clearLater, type LaterWhen } from '@/lib/admin/b/later'

type Row = Record<string, any>

export type WorkDraft = { id: string; to: string; cc: string | null; subject: string; body: string; attachments: { filename: string }[]; thread_id: string | null; party: 'client' | 'insurer' | null; pair_id: string | null }
export type WorkItem = {
  id: string; company_id: string | null; company_name: string | null; client_name: string | null
  case_type: string; title: string; status: CaseStatus; summary: string | null; next_action: string | null
  deadline: string | null; deadline_basis: string | null; waiting_since: string | null; last_activity_at: string | null
  insurer_name: string | null; policy_number: string | null; owner_email: string | null; owner_left: boolean
  suggested_owner: string | null; needs_human: string | null; confidence: string | null
  snoozed_until: string | null; draft: WorkDraft | null
  /** The other party's draft on the same matter, sent with `draft` (insurer chase + client update). */
  pair: WorkDraft | null
  /** "Come back later": until a time, or until the client or insurer replies. */
  later: { until: string | null; when: string | null } | null
  threads: { id: string; subject: string | null; side: string }[]
  evidence: { thread: string; quote: string }[]; rank: number; lane: Lane
}

/** The four places an item can sit on the queue. */
export type Lane = 'decide' | 'send' | 'act' | 'waiting'

/** Pure. A decision outranks a draft; a draft outranks work with nothing prepared; waits last. */
export function laneOf(i: { status: string; needs_human: string | null; draft: unknown }): Lane {
  if (i.needs_human) return 'decide'
  if (i.draft && i.status !== 'done') return 'send'
  if (i.status === 'trs_to_act' || i.status === 'stalled') return 'act'
  return 'waiting'
}

/** Pure. The signature placeholder the case worker writes, filled with the person approving. */
export function signAs(body: string, name: string): string {
  return body.replace(/\{owner_name\}/g, name.trim() || 'Trade Risk Solutions')
}

/** Pure. Who the case waits on once a reply goes out: the insurer if any recipient is one. */
export function waitingAfterSend(to: string[], insurerDomains: Set<string>): CaseStatus {
  return to.some(a => insurerDomains.has(emailDomain(a))) ? 'waiting_insurer' : 'waiting_client'
}

export async function listWork(opts: { today: string; includeDone?: boolean; includeLater?: boolean }): Promise<WorkItem[]> {
  const rows = await sbTry<Row[]>(
    `work_items?${opts.includeDone ? '' : 'closed_at=is.null&'}select=*,companies(company_name),work_item_threads(side,email_threads(id,subject))&order=updated_at.desc&limit=500`, [])
  const draftIds = rows.map(r => r.draft_id).filter(Boolean)
  const drafts = draftIds.length ? await sbTry<Row[]>(`ai_drafts?id=in.(${draftIds.join(',')})&status=in.(pending,draft)&select=id,to_email,cc,subject,body,attachments,thread_id,party,pair_id`, []) : []
  const pairIds = drafts.map(d => d.pair_id).filter(Boolean)
  const pairs = pairIds.length ? await sbTry<Row[]>(`ai_drafts?pair_id=in.(${pairIds.join(',')})&status=in.(pending,draft)&select=id,to_email,cc,subject,body,attachments,thread_id,party,pair_id`, []) : []
  const toDraft = (d: Row): WorkDraft => ({ id: d.id, to: d.to_email ?? '', cc: d.cc, subject: d.subject ?? '', body: d.body ?? '', attachments: (d.attachments ?? []).map((a: Row) => ({ filename: a.filename })), thread_id: d.thread_id, party: d.party ?? null, pair_id: d.pair_id ?? null })
  const now = new Date().toISOString()
  const gone = new Set((await sbTry<Row[]>('staff_departures?select=email', [])).map(r => String(r.email).toLowerCase()))
  return rows
    .filter(r => !r.snoozed_until || r.snoozed_until <= opts.today)
    .filter(r => opts.includeLater || !laterActive(r, now))
    .map(r => {
      const d = drafts.find(x => x.id === r.draft_id)
      const draft: WorkDraft | null = d ? toDraft(d) : null
      const p = d?.pair_id ? pairs.find(x => x.pair_id === d.pair_id && x.id !== d.id) : null
      const item = {
        id: r.id, company_id: r.company_id, company_name: r.companies?.company_name ?? null, client_name: r.client_name,
        case_type: r.case_type, title: r.title, status: r.status, summary: r.summary, next_action: r.next_action,
        deadline: r.deadline, deadline_basis: r.deadline_basis, waiting_since: r.waiting_since, last_activity_at: r.last_activity_at,
        insurer_name: r.insurer_name, policy_number: r.policy_number,
        owner_email: r.owner_email, owner_left: !!r.owner_email && gone.has(String(r.owner_email).toLowerCase()),
        suggested_owner: r.suggested_owner, needs_human: r.needs_human, confidence: r.confidence, snoozed_until: r.snoozed_until,
        draft, pair: p ? toDraft(p) : null, evidence: r.evidence ?? [],
        later: r.later_until || r.later_when ? { until: r.later_until ?? null, when: r.later_when ?? null } : null,
        threads: (r.work_item_threads ?? []).map((t: Row) => ({ id: t.email_threads?.id, subject: t.email_threads?.subject ?? null, side: t.side })).filter((t: Row) => t.id),
      }
      return { ...item, rank: queueRank(item, opts.today), lane: laneOf(item) }
    })
    .sort((a, b) => a.rank - b.rank)
}

/** Current staff, for the owner menu: employees who have not left. */
export async function currentStaff(): Promise<{ email: string; name: string }[]> {
  const gone = new Set((await sbTry<Row[]>('staff_departures?select=email', [])).map(r => String(r.email).toLowerCase()))
  const rows = await sbTry<Row[]>('contacts?is_employee=eq.true&select=email,first_name,last_name&order=first_name.asc', [])
  return rows.map(r => ({ email: String(r.email).toLowerCase(), name: [r.first_name, r.last_name].filter(Boolean).join(' ') || String(r.email) }))
    .filter(r => !gone.has(r.email) && !/^(operations|developer|road-plus|manager\.mis)@/.test(r.email))
}

const event = (id: string, kind: string, actor: string, detail: Row = {}) =>
  sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: id, kind, actor, detail }) })
const patch = (id: string, body: Row) =>
  sb(`work_items?id=eq.${enc(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) })

export type WorkAction =
  | { action: 'assign'; owner: string }
  | { action: 'snooze'; until: string }
  | { action: 'close' }
  | { action: 'reopen' }
  | { action: 'edit_draft'; to: string; cc: string | null; subject: string; body: string }
  | { action: 'prepare_send' }
  | { action: 'sent' }
  | { action: 'discard_draft' }
  | { action: 'later'; until?: string | null; when?: LaterWhen | null }
  | { action: 'clear_later' }

/** One action on one item. prepare_send returns the draft to send, and its pair when there is one. */
export async function act(id: string, a: WorkAction, actor: string): Promise<{ draftId?: string; pairDraftId?: string }> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=id,draft_id,status&limit=1`)
  if (!item) throw new Error('This item no longer exists.')
  switch (a.action) {
    case 'assign': {
      const owner = a.owner.trim().toLowerCase()
      const [staff] = await sbTry<Row[]>(`contacts?email=eq.${enc(owner)}&is_employee=eq.true&select=email&limit=1`, [])
      const [left] = await sbTry<Row[]>(`staff_departures?email=eq.${enc(owner)}&select=email&limit=1`, [])
      if (!staff || left) throw new Error(`${owner} is not current TRS staff.`)
      await patch(id, { owner_email: owner }); await event(id, 'owner', actor, { owner }); return {}
    }
    case 'later':
      await setLater(id, { until: a.until ?? null, when: a.when ?? null }, actor); return {}
    case 'clear_later':
      await clearLater(id, 'cleared by a person', actor); return {}
    case 'snooze':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.until)) throw new Error('Snooze needs a date.')
      await patch(id, { snoozed_until: a.until }); await event(id, 'snoozed', actor, { until: a.until }); return {}
    case 'close':
      await patch(id, { closed_at: new Date().toISOString(), closed_by: actor, status: 'done' }); await event(id, 'closed', actor); return {}
    case 'reopen':
      await patch(id, { closed_at: null, closed_by: null, status: 'trs_to_act' }); await event(id, 'reopened', actor); return {}
    case 'discard_draft':
      if (item.draft_id) {
        const [d] = await sbTry<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=pair_id&limit=1`, [])
        // Discarding a paired draft discards its pair: the two were written as one move.
        const target = d?.pair_id ? `ai_drafts?pair_id=eq.${enc(d.pair_id)}&status=in.(pending,draft)` : `ai_drafts?id=eq.${enc(item.draft_id)}`
        await sb(target, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', rejection_note: `discarded by ${actor}` }) })
      }
      await patch(id, { draft_id: null }); await event(id, 'draft', actor, { discarded: true }); return {}
    case 'edit_draft': {
      if (!item.draft_id) throw new Error('There is no draft to edit.')
      if (!a.to.trim() || !a.body.trim()) throw new Error('A draft needs a recipient and a message.')
      await sb(`ai_drafts?id=eq.${enc(item.draft_id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ to_email: a.to.trim(), cc: a.cc?.trim() || null, subject: a.subject, body: a.body }) })
      await event(id, 'draft', actor, { edited: true }); return {}
    }
    case 'prepare_send': {
      if (!item.draft_id) throw new Error('There is no draft to send.')
      const [d] = await sb<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=id,body,status,pair_id,thread_id&limit=1`)
      if (!d || !['pending', 'draft'].includes(d.status)) throw new Error('This draft was already sent or discarded.')
      await ensureDraftContact(d.id)
      // The approver's own voice: greeting word, close, name, phone (src/lib/admin/b/voice.ts).
      await sb(`ai_drafts?id=eq.${enc(d.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: await fillVoice(d.body ?? '', actor, d.thread_id) }) })
      // The pair is signed by the same person and sent in the same step.
      const [p] = d.pair_id ? await sbTry<Row[]>(`ai_drafts?pair_id=eq.${enc(d.pair_id)}&id=neq.${enc(d.id)}&status=in.(pending,draft)&select=id,body,thread_id&limit=1`, []) : []
      if (p) await ensureDraftContact(p.id)
      if (p) await sb(`ai_drafts?id=eq.${enc(p.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ body: await fillVoice(p.body ?? '', actor, p.thread_id) }) })
      return { draftId: d.id, ...(p ? { pairDraftId: p.id as string } : {}) }
    }
    case 'sent': {
      const [d] = item.draft_id ? await sbTry<Row[]>(`ai_drafts?id=eq.${enc(item.draft_id)}&select=to_email,status&limit=1`, []) : []
      const insurers = await sbTry<Row[]>('companies?kind=eq.insurer&select=domains', [])
      const domains = new Set<string>(insurers.flatMap(r => (r.domains ?? []) as string[]).map(x => x.toLowerCase()))
      const to = String(d?.to_email ?? '').split(/[,;]\s*/).filter(Boolean)
      const status = waitingAfterSend(to, domains)
      await patch(id, { status, waiting_since: new Date().toISOString().slice(0, 10), draft_id: null, next_action: status === 'waiting_insurer' ? 'Wait for the insurer' : 'Wait for the client', owner_email: actor })
      await event(id, 'sent', actor, { to, status }); return {}
    }
  }
}
