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
  if (/wica|work injury|workmen/.test(s)) return 'wica'
  if (/group (hospital|health|medical)|\bghs\b|\bgp\b|outpatient|dental|employee benefit|\bgtl\b|term life|\bgpa\b|personal accident|group accident/.test(s)) return 'employee_benefits'
  if (/travel/.test(s)) return 'group_travel'
  if (/motor|vehicle|fleet|commercial auto/.test(s)) return 'commercial_vehicle'
  if (/marine|cargo/.test(s)) return 'marine_cargo'
  if (/contractor|\bcar\b|erection|construction/.test(s)) return 'construction_car'
  if (/fire|industrial all risk|\biar\b|property|office|business pack|bizsupreme|shop/.test(s)) return 'iar_fire'
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
export const CHASE_AFTER_DAYS = 7
export const MAX_CHASES = 3
export function chaseDue(b: { status: BatchStatus; sent_at: string | null; next_chase_at: string | null; chase_count: number }, now: Date): boolean {
  if (b.status !== 'sent' || !b.sent_at || b.chase_count >= MAX_CHASES) return false
  const at = b.next_chase_at ?? new Date(Date.parse(b.sent_at) + CHASE_AFTER_DAYS * 86_400_000).toISOString()
  return Date.parse(at) <= now.getTime()
}
