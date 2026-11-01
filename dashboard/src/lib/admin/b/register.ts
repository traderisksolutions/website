/**
 * The claims register and one claim's detail, for /claims. A claim is a work item of type claim;
 * its register row (claims) adds what the claims agent read. An item the agent has not read yet
 * still lists, with the item's own fields.
 */
import { sbTry, enc } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import { claimClass, documentState, type DocState } from './claim-read'
import { loadCaseData } from './data'
import { daysBetween } from './dates'

type Row = Record<string, any>

export { bucketOf, waitingLabel, type RegisterRow, type Bucket } from './register-view'
import { waitingLabel, type RegisterRow } from './register-view'

export async function listClaims(today: string): Promise<RegisterRow[]> {
  const items = await sbTry<Row[]>('work_items?case_type=eq.claim&select=id,title,client_name,company_id,status,waiting_since,last_activity_at,insurer_name,policy_number,owner_email,closed_at,draft_id,updated_at,companies(company_name),work_item_threads(thread_id)&order=updated_at.desc&limit=500', [])
  const ids = items.map(i => i.id)
  const claims = ids.length ? await sbTry<Row[]>(`claims?work_item_id=in.(${ids.join(',')})&select=*`, []) : []
  const by = new Map(claims.map(c => [c.work_item_id, c]))
  return items.map(i => {
    const c = by.get(i.id)
    const waiting = waitingLabel(c?.waiting_on, i.status)
    const since = i.waiting_since ?? c?.last_mail_at ?? i.last_activity_at
    return {
      id: i.id, title: i.title, client: i.companies?.company_name ?? i.client_name ?? null, company_id: i.company_id,
      class: c?.class ?? claimClass(null, i.title), insurer: c?.insurer_name ?? i.insurer_name ?? null,
      policy_number: c?.policy_number ?? i.policy_number ?? null, insurer_ref: c?.insurer_ref ?? null,
      loss_date: c?.loss_date ?? null, stage: c?.stage ?? null, status: i.status, waiting_on: waiting,
      waiting_days: waiting && since ? Math.max(0, daysBetween(String(since), today)) : null,
      amount_claimed: c?.amount_claimed != null ? Number(c.amount_claimed) : null, amount_settled: c?.amount_settled != null ? Number(c.amount_settled) : null,
      last_mail_at: c?.last_mail_at ?? i.last_activity_at ?? null, threads: (i.work_item_threads ?? []).length,
      owner_email: i.owner_email, opened_mode: c?.opened_mode ?? 'normal', gaps: Array.isArray(c?.gaps) ? c.gaps.length : 0,
      closed: !!i.closed_at || !!c?.closed_at, has_draft: !!i.draft_id,
    }
  }).sort((a, b) => String(b.last_mail_at ?? '').localeCompare(String(a.last_mail_at ?? '')))
}

export type TimelineEvent = { at: string | null; side: 'client' | 'trs' | 'insurer'; from: string; line: string; rebuilt: false | 'forward' | 'quoted'; thread_id: string }
export type ClaimDetail = {
  row: RegisterRow
  summary: string | null; next_action: string | null; needs_human: string | null
  timeline: TimelineEvent[]
  documents: DocState[]; files: { filename: string; received_at: string | null }[]
  gaps: { item: string; basis: string }[]
  drafts: { id: string; to: string; cc: string | null; subject: string; body: string; current: boolean }[]
  threads: { id: string; subject: string | null; side: string; joined_by: string | null; joined_evidence: string | null; messages: number; last: string | null; rebuilt: number }[]
}

/** Pure. One line for the timeline: the first sentence of the newest text, without the greeting. */
export function firstLine(text: string): string {
  const lines = latestText(text, 2000).split('\n').map(l => l.trim()).filter(Boolean)
  const body = lines.filter(l => !/^(hi|hello|dear|good (morning|afternoon|evening))\b/i.test(l) && !/^(thanks|thank you|regards|best|cheers)[,.!]?$/i.test(l))
  const s = (body[0] ?? lines[0] ?? '').replace(/\s+/g, ' ')
  return s.length > 160 ? s.slice(0, 157) + '…' : s
}

export async function claimDetail(workItemId: string, today: string): Promise<ClaimDetail | null> {
  const d = await loadCaseData(workItemId)
  if (!d || d.item.case_type !== 'claim') return null
  const [row] = (await listClaims(today)).filter(r => r.id === workItemId)
  if (!row) return null
  const [c] = await sbTry<Row[]>(`claims?work_item_id=eq.${enc(workItemId)}&select=gaps,documents,class&limit=1`, [])
  const drafts = await sbTry<Row[]>(`ai_drafts?work_item_id=eq.${enc(workItemId)}&status=in.(pending,draft)&select=id,to_email,cc,subject,body&order=created_at.desc`, [])
  const cls = (c?.class ?? row.class) as Parameters<typeof documentState>[0]
  return {
    row,
    summary: d.item.summary ?? null, next_action: d.item.next_action ?? null, needs_human: d.item.needs_human ?? null,
    timeline: d.messages.map(m => ({ at: m.sent_at, side: m.side, from: m.from, line: firstLine(m.text), rebuilt: m.rebuilt, thread_id: m.thread_id })),
    documents: documentState(cls, d.files.map(f => f.filename)),
    files: d.files.map(f => ({ filename: f.filename, received_at: f.received_at })),
    gaps: Array.isArray(c?.gaps) ? c.gaps : [],
    drafts: drafts.map(x => ({ id: x.id, to: x.to_email ?? '', cc: x.cc, subject: x.subject ?? '', body: x.body ?? '', current: x.id === d.item.draft_id })),
    threads: d.threads.map(t => ({ id: t.id, subject: t.subject, side: t.side, joined_by: t.joined_by, joined_evidence: t.joined_evidence, messages: t.message_count, last: t.last_message_at, rebuilt: d.messages.filter(m => m.rebuilt && m.thread_id === t.id).length })),
  }
}
