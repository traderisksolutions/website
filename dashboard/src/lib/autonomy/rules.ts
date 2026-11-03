/**
 * The autonomy ladder, pure rules. A draft class graduates to auto-send only after staff have
 * approved it unedited `min_unedited` times (20) AND a person switches it on. Classes that carry
 * money or a decision never climb. Everything here is deterministic and tested.
 */
import { isAutomated } from '@/lib/crm/db'

export type LadderStatus = 'manual' | 'candidate' | 'auto' | 'paused'
export type LadderRow = {
  draft_class: string; rung: number; status: LadderStatus
  approvals_unedited: number; approvals_total: number; min_unedited: number
  last_graduated_at: string | null; paused_by: string | null; paused_reason: string | null
}

/** Graduation order: an acknowledgement earns trust long before an answer about cover does. */
export const LADDER_ORDER = ['ack', 'status', 'request', 'forward', 'relay', 'answer'] as const
export const CLASS_LABEL: Record<string, string> = {
  ack: 'Acknowledgement', status: 'Status update', request: 'Request for information', forward: 'Forward to insurer', relay: 'Relay to client', answer: 'Answer about cover',
}

/** Draft kinds (context_used.kind) that carry money, terms or a chase: never auto, whatever the ladder says. */
export const NEVER_AUTO_KINDS = new Set(['trs_note', 'renewal_advice', 'renewal_notice', 'batch', 'amendment', 'reversal', 'request_missing', 'chase_insurer', 'chase_client', 'forward_to_insurer'])
/** Draft email types that are not case work. */
export const NEVER_AUTO_TYPES = new Set(['POLICY_MOVEMENT', 'CAMPAIGN'])

export const OPERATIONS = 'operations@trade-risksol.com'
export const DEFAULT_RUN_CAP = 20
export const DEFAULT_DAY_CAP = 100
export const BURST_WINDOW_MS = 10 * 60_000

/** What the daily count makes of a class. Only manual ↔ candidate move on their own. */
export function nextStatus(row: Pick<LadderRow, 'status' | 'min_unedited'>, unedited: number): LadderStatus {
  if (row.status === 'auto' || row.status === 'paused') return row.status
  return unedited >= row.min_unedited ? 'candidate' : 'manual'
}

/** A person may switch a class on only from candidate, or back on from paused when it still qualifies. */
export function canSwitchOn(row: Pick<LadderRow, 'status' | 'approvals_unedited' | 'min_unedited'>): boolean {
  return (row.status === 'candidate' || row.status === 'paused') && row.approvals_unedited >= row.min_unedited
}

export type DraftForSend = {
  id: string; status: string; channel: string | null; email_type: string | null; draft_class: string | null
  to_email: string | null; cc: string | null; thread_id: string | null; work_item_id: string | null
  context_used: { kind?: string; preapproved?: boolean } | null; sent_by_agent?: boolean | null
}
export type ItemForSend = { id: string; needs_human: string | null; closed_at: string | null; later_until: string | null; later_when: string | null } | null

export type Verdict = { ok: true; to: string[]; cc: string[] } | { ok: false; reason: string }

export const splitAddresses = (s: string | null | undefined) => String(s ?? '').split(/[,;]\s*/).map(x => x.trim().toLowerCase()).filter(Boolean)

const internal = (a: string) => a.endsWith('@trade-risksol.com') || a.endsWith('@traderisksol.com')

/**
 * Whether one pending draft may go out without a person. Every refusal names its reason, so the
 * ladder page can show why a class that is "auto" still waits.
 */
export function eligibility(d: DraftForSend, item: ItemForSend, ladder: Map<string, LadderRow>, departed: Set<string>, killSwitch: boolean): Verdict {
  if (killSwitch) return { ok: false, reason: 'auto-send is switched off' }
  if (!['pending', 'draft'].includes(d.status)) return { ok: false, reason: 'not pending' }
  if (d.channel && d.channel !== 'email') return { ok: false, reason: 'not an email' }
  if (d.sent_by_agent) return { ok: false, reason: 'already sent by an agent' }
  if (!d.draft_class) return { ok: false, reason: 'no draft class' }
  // A follow-up chase the sender approved together with the original email (Today, chase set to
  // send without asking): the person's approval stands in for the ladder. Every other check holds.
  const preapproved = d.draft_class === 'followup_chase' && d.context_used?.kind === 'followup_chase' && d.context_used?.preapproved === true
  const row = ladder.get(d.draft_class)
  if (!preapproved && (!row || row.status !== 'auto')) return { ok: false, reason: `class ${d.draft_class} is ${row?.status ?? 'unknown'}` }
  if (!preapproved && d.context_used?.kind && NEVER_AUTO_KINDS.has(d.context_used.kind)) return { ok: false, reason: `kind ${d.context_used.kind} never auto-sends` }
  if (d.email_type && NEVER_AUTO_TYPES.has(d.email_type)) return { ok: false, reason: `type ${d.email_type} never auto-sends` }
  if (!d.thread_id) return { ok: false, reason: 'no thread: a new conversation needs a person' }
  if (!d.work_item_id || !item) return { ok: false, reason: 'no case' }
  if (item.closed_at) return { ok: false, reason: 'case closed' }
  if (item.needs_human) return { ok: false, reason: 'case holds a decision' }
  if (item.later_until || item.later_when) return { ok: false, reason: 'case set aside' }
  const to = splitAddresses(d.to_email)
  if (!to.length || !to.every(a => a.includes('@'))) return { ok: false, reason: 'no valid recipient' }
  for (const a of to) {
    if (isAutomated(a)) return { ok: false, reason: `${a} is an automated address` }
    if (departed.has(a)) return { ok: false, reason: `${a} has left TRS` }
    if (internal(a)) return { ok: false, reason: `${a} is internal` }
  }
  const cc = splitAddresses(d.cc).filter(a => !departed.has(a) && !isAutomated(a) && a.includes('@'))
  if (!cc.includes(OPERATIONS)) cc.push(OPERATIONS)
  return { ok: true, to, cc }
}

/** The same recipient gets at most one auto-send per ten minutes; a burst waits for the next run. */
export function burstHeld(recent: { to: string; at: string }[], to: string, now: Date): boolean {
  const t = to.toLowerCase()
  return recent.some(r => r.to.toLowerCase() === t && now.getTime() - Date.parse(r.at) < BURST_WINDOW_MS)
}

export function capsAllow(sentToday: number, sentThisRun: number, caps: { run: number; day: number } = { run: DEFAULT_RUN_CAP, day: DEFAULT_DAY_CAP }): boolean {
  return sentThisRun < caps.run && sentToday < caps.day
}

/** Weekdays 08:00–18:30 Singapore time. `sgt` carries Singapore wall-clock components. */
export function inSendingHours(sgt: Date): boolean {
  const day = sgt.getDay(), h = sgt.getHours(), m = sgt.getMinutes()
  if (day === 0 || day === 6) return false
  return h >= 8 && (h < 18 || (h === 18 && m <= 30))
}

export type SentLine = { work_item_id: string | null; draft_class: string; to: string; subject: string; client: string | null; sent_at: string }

/** The day's digest: one line per send, with the case's path. */
export function digestText(sends: SentLine[]): string {
  if (!sends.length) return 'Nothing was auto-sent today.'
  return sends.map(s => `${s.sent_at.slice(11, 16)} · ${CLASS_LABEL[s.draft_class] ?? s.draft_class} · ${s.client ?? '—'} · to ${s.to} · "${s.subject}"${s.work_item_id ? ` · /today/${s.work_item_id}` : ''}`).join('\n')
}
