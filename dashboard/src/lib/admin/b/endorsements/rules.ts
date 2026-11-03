/**
 * Pure rules of the endorsement loop: which policy a change belongs to, the batch window, when
 * a batch closes, what each step may move to, and the words on the Today item. Tested on their
 * own (rules.test.ts).
 */
import type { Cadence, BatchStatus, MovementType } from './types'

/** Product lines whose mid-term changes are people joining or leaving. */
export const MEMBER_LINES = new Set(['employee_benefits', 'group_health', 'group_travel', 'foreign_worker_medical', 'foreign_worker_bond', 'wica', 'keyman'])

/** The product line a policy row reads as, from its slug or, failing that, its class wording. */
export function lineFor(p: { product_line?: string | null; class_of_insurance?: string | null; label?: string | null; description?: string | null }): string | null {
  if (p.product_line) return p.product_line
  const s = `${p.class_of_insurance ?? ''} ${p.label ?? ''} ${p.description ?? ''}`.toLowerCase()
  if (!s.trim()) return null
  if (/foreign worker|fwmi|\bhfw\b|work permit/.test(s)) return 'foreign_worker_medical'
  if (/wica|work(?:er|men)?'?s? injury|workmen|\bwic\b|\bwcodc\b/.test(s)) return 'wica'
  if (/group (hospital|health|medical)|\bghs\b|\bgp\b|outpatient|dental|employee benefit|\bgtl\b|term life|\bgpa\b|personal accident|group accident/.test(s)) return 'employee_benefits'
  if (/travel/.test(s)) return 'group_travel'
  if (/motor|vehicle|fleet|commercial auto/.test(s)) return 'commercial_vehicle'
  if (/marine|cargo/.test(s)) return 'marine_cargo'
  if (/contractor|\bcar\b|erection|construction/.test(s)) return 'construction_car'
  if (/electronic equipment/.test(s)) return 'electronic_equipment'
  if (/asset manag\w* liability/.test(s)) return 'professional_indemnity'
  if (/fire|industrial all risk|\biar\b|property|office|business (pack|insurance|supreme)|bizsupreme|shop|commercial all risk|clinic ?care|cafe ?care|food stall/.test(s)) return 'iar_fire'
  if (/event liability|employer'?s'? liability/.test(s)) return 'general_liability'
  if (/public liability|general liability|\bpl\b|third party/.test(s)) return 'general_liability'
  if (/professional indemnity|\bpi\b|errors/.test(s)) return 'professional_indemnity'
  if (/directors|d&o|\bd ?& ?o\b/.test(s)) return 'do'
  if (/cyber/.test(s)) return 'cyber'
  if (/bond|guarantee|surety/.test(s)) return 'surety_bonds'
  if (/credit/.test(s)) return 'trade_credit'
  return null
}

/** The movement type a policy's changes take. */
export function movementTypeFor(line: string | null): MovementType {
  if (!line) return 'other'
  if (MEMBER_LINES.has(line)) return 'member'
  if (line === 'commercial_vehicle') return 'vehicle'
  return 'other'
}

const SGT = 8 * 3_600_000
const day = (t: number) => new Date(t + SGT).toISOString().slice(0, 10)
const dayAt = (iso: string) => Date.parse(`${iso}T00:00:00+08:00`)

/**
 * The window a change reported at `now` falls in: a weekly batch runs Monday to Sunday (SGT),
 * a daily one is the day itself, an immediate one is the moment, so it closes at once.
 */
export function batchWindow(cadence: Cadence, now: Date): { window_start: string; window_end: string } {
  const today = day(now.getTime())
  if (cadence !== 'weekly') return { window_start: today, window_end: today }
  const dow = new Date(now.getTime() + SGT).getUTCDay()          // 0 Sunday … 6 Saturday
  const back = (dow + 6) % 7                                        // days since Monday
  const monday = day(now.getTime() - back * 86_400_000)
  const sunday = day(dayAt(monday) + 6 * 86_400_000)
  return { window_start: monday, window_end: sunday }
}

/** A batch closes once its window has ended and the morning hour (09:00 SGT) has passed. An immediate batch closes at once. */
export function batchDue(b: { cadence: Cadence; window_end: string }, now: Date): boolean {
  if (b.cadence === 'immediate') return true
  return now.getTime() >= dayAt(b.window_end) + 86_400_000 + 9 * 3_600_000
}

const NEXT: Record<BatchStatus, BatchStatus[]> = {
  open: ['ready', 'cancelled'], ready: ['sent', 'open', 'cancelled'], sent: ['noted', 'cancelled'],
  noted: ['billed', 'cancelled'], billed: ['settled'], settled: [], cancelled: [],
}
export const canMove = (from: BatchStatus, to: BatchStatus) => NEXT[from].includes(to)

export type Counts = { joins: number; leaves: number; changes: number }
export const countOf = (ms: { kind: string }[]): Counts => ({
  joins: ms.filter(m => m.kind === 'join').length, leaves: ms.filter(m => m.kind === 'leave').length, changes: ms.filter(m => m.kind === 'change').length,
})

/** The sum of the estimates on file, or null when any movement has none (a partial sum misleads). */
export function estimateTotal(ms: { estimate_amount: number | null; kind: string }[]): number | null {
  const priced = ms.filter(m => m.kind !== 'change')
  if (!priced.length || priced.some(m => m.estimate_amount == null)) return null
  return Math.round(priced.reduce((s, m) => s + Number(m.estimate_amount), 0) * 100) / 100
}

const money = (n: number) => `${n < 0 ? '-' : ''}S$${Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The Today item's title: "Approve batch: 2 joins, 1 leave, est. S$312.40 · QBE N0018606". */
export function batchTitle(c: Counts, estimate: number | null, insurer: string | null, policyNumber: string | null, type: MovementType): string {
  const parts = [c.joins ? plural(c.joins, type === 'vehicle' ? 'vehicle added' : 'join') : '', c.leaves ? plural(c.leaves, type === 'vehicle' ? 'vehicle deleted' : 'leave') : '', c.changes ? plural(c.changes, 'change') : ''].filter(Boolean)
  const est = estimate != null ? `, est. ${money(estimate)}` : ''
  const tail = [insurer, policyNumber].filter(Boolean).join(' ')
  return `Approve batch: ${parts.join(', ') || 'no movements'}${est}${tail ? ` · ${tail}` : ''}`.slice(0, 140)
}

/** The Today item's title for an amendment: "Approve amendment: cancel 1, change 1, est. -S$104.20 · QBE N0018606 (rev. 2)". */
export function amendmentTitle(ops: { cancel: number; replace: number; reverse: number; add: number }, estimate: number | null, insurer: string | null, policyNumber: string | null, revision: number): string {
  const parts = [ops.cancel ? `cancel ${ops.cancel}` : '', ops.replace ? `change ${ops.replace}` : '', ops.reverse ? `reverse ${ops.reverse}` : '', ops.add ? `add ${ops.add}` : ''].filter(Boolean)
  const est = estimate != null ? `, est. ${money(estimate)}` : ''
  const tail = [insurer, policyNumber].filter(Boolean).join(' ')
  return `Approve amendment: ${parts.join(', ') || 'no changes'}${est}${tail ? ` · ${tail}` : ''} (rev. ${revision})`.slice(0, 140)
}

/** What an amendment batch asks the insurer, counted by operation. */
export function amendmentOps(ms: { detail?: Record<string, unknown> | null; supersedes_id?: string | null }[]): { cancel: number; replace: number; reverse: number; add: number } {
  const ops = { cancel: 0, replace: 0, reverse: 0, add: 0 }
  for (const m of ms) {
    const a = (m.detail ?? {}).amendment
    if (a === 'cancel') ops.cancel++; else if (a === 'reverse') ops.reverse++; else if (a === 'replace' || m.supersedes_id) ops.replace++; else ops.add++
  }
  return ops
}

/** The Today item's title for the TRS note to the client. */
export function noteTitle(kind: 'debit' | 'credit', amount: number, noteNo: string | null, insurer: string | null): string {
  return `Approve ${kind === 'credit' ? 'credit' : 'debit'} note to client: ${money(Math.abs(amount))}${noteNo ? ` for ${insurer ?? 'insurer'} ${noteNo}` : insurer ? ` (${insurer})` : ''}`.slice(0, 140)
}

/** After the insurer's note: reads within tolerance bill at once; anything else is a decision. */
export function noteDecision(i: { variance: number | null; withinTolerance: boolean | null; needsReview: boolean; matched: number }): { bill: boolean; question: string | null } {
  if (i.needsReview) return { bill: false, question: 'The figure on the insurer note could not be read with certainty. Check the note before the TRS note goes out.' }
  if (i.matched === 0) return { bill: false, question: 'The insurer note does not name a movement on file. Say which change it bills before the TRS note goes out.' }
  if (i.withinTolerance === false) return { bill: false, question: `The insurer billed ${money(Math.abs(i.variance ?? 0))} ${(i.variance ?? 0) > 0 ? 'more' : 'less'} than the estimate. Accept the insurer figure, or query it.` }
  return { bill: true, question: null }
}

/** GST applies to general lines; life and personal accident covers are exempt. */
export const gstRateFor = (line: string | null, className: string | null) => (/term life|\bgtl\b|critical|\bgci\b|\blife\b/i.test(`${line ?? ''} ${className ?? ''}`) ? 0 : 0.09)

/** Chase an unbilled batch 5 working days after sending, then every 5 working days, up to three times. */
import { INSURER_CHASE_CALENDAR_DAYS, MAX_CHASES as CADENCE_MAX } from '../cadence'
/** The one cadence table (admin/b/cadence.ts): five working days as a calendar week. */
export const CHASE_AFTER_DAYS = INSURER_CHASE_CALENDAR_DAYS
export const MAX_CHASES = CADENCE_MAX
export function chaseDue(b: { status: BatchStatus; sent_at: string | null; next_chase_at: string | null; chase_count: number; sub_state?: string | null }, now: Date): boolean {
  if (b.status !== 'sent' || !b.sent_at || b.chase_count >= MAX_CHASES) return false
  // The insurer's question is with the client: the clock is paused until the client answers.
  if (b.sub_state === 'awaiting_client') return false
  const at = b.next_chase_at ?? new Date(Date.parse(b.sent_at) + CHASE_AFTER_DAYS * 86_400_000).toISOString()
  return Date.parse(at) <= now.getTime()
}
