/**
 * Renewal rules (docs/renewals.md). Pure and browser-safe; tested in __tests__/rules.test.ts.
 *
 *   opensOn(policy)          the day a renewal record opens: 120 days before expiry, 180 for Employment Benefits
 *   tasksFor(expiry)         the four tasks on a record: 90, 60, 30 and 15 days before expiry
 *   expiringFrom(notes)      the expiring premium and commission: the latest placing debit note, net of its reversals
 *   suggestEndDate(p, notes) a policy's suggested end date: start + 1 year − 1 day, else the last placing note's issue + 1 year − 1 day
 *   bucketOf(days)           0-30, 31-60, 61-90, 91-120, 121+ (overdue counts as 0-30)
 *   checkChange(r, change)   whether a stage, owner or outcome change may be written, and what to write
 */
import { isEbLine, type LinePolicy } from './lines'

export const OPEN_DAYS = 120
export const EB_OPEN_DAYS = 180
/** A record may still open for a policy that ended this many days ago. */
export const GRACE_DAYS = 30
export const TASK_KINDS = ['-90', '-60', '-30', '-15'] as const
export type TaskKind = typeof TASK_KINDS[number]

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)
export const addDays = (day: string, n: number): string => iso(new Date(at(day).getTime() + n * DAY))
export const daysBetween = (from: string, to: string): number => Math.round((at(to).getTime() - at(from).getTime()) / DAY)
/** One calendar year on, less a day: 2026-01-01 → 2026-12-31; 29 February rolls to 28 February. */
export function yearTerm(start: string): string {
  const d = at(start)
  const next = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()))
  if (next.getUTCDate() !== d.getUTCDate()) next.setUTCDate(0)
  return addDays(iso(next), -1)
}

export type RenewalPolicy = LinePolicy & { end_date: string | null; line_code?: string | null }

export function opensOn(p: RenewalPolicy): string | null {
  if (!p.end_date) return null
  return addDays(p.end_date, -(isEbLine(p) ? EB_OPEN_DAYS : OPEN_DAYS))
}

export const tasksFor = (expiry: string): { kind: TaskKind; due_on: string }[] =>
  TASK_KINDS.map(kind => ({ kind, due_on: addDays(expiry, Number(kind)) }))

// ── Debit notes ──────────────────────────────────────────────────────────────────────────────────

export type NoteLike = {
  id: string; issue_date: string | null; event_type: string | null; gross_amount: number | string | null
  commission: number | string | null; currency?: string | null; reverses_debit_note_id?: string | null; created_at?: string | null
}
export type Expiring = { debit_note_id: string; issue_date: string | null; premium: number; commission: number; currency: string }

const PLACING = new Set(['new_business', 'renewal'])
const n = (v: number | string | null | undefined) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0 }
const r2 = (x: number) => Math.round(x * 100) / 100
const newest = (a: NoteLike, b: NoteLike) => (b.issue_date ?? '').localeCompare(a.issue_date ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? '')

/** A placing note is a new business or renewal note that is not itself a reversal. */
export const isPlacing = (d: NoteLike): boolean => PLACING.has(d.event_type ?? '') && !d.reverses_debit_note_id

/**
 * The latest placing note with the notes that reverse or correct it added (they carry signed amounts).
 * A note reversed to nothing is skipped and the one before it is used.
 */
export function expiringFrom(notes: readonly NoteLike[]): Expiring | null {
  for (const d of notes.filter(isPlacing).sort(newest)) {
    const against = notes.filter(x => x.reverses_debit_note_id === d.id)
    const premium = r2(n(d.gross_amount) + against.reduce((s, x) => s + n(x.gross_amount), 0))
    const commission = r2(n(d.commission) + against.reduce((s, x) => s + n(x.commission), 0))
    if (against.length && premium === 0) continue
    return { debit_note_id: d.id, issue_date: d.issue_date, premium, commission, currency: d.currency || 'SGD' }
  }
  return null
}

export type EndSuggestion = { end_date: string; basis: 'start' | 'debit_note' }

export function suggestEndDate(p: { start_date: string | null }, notes: readonly NoteLike[]): EndSuggestion | null {
  if (p.start_date) return { end_date: yearTerm(p.start_date), basis: 'start' }
  const last = notes.filter(isPlacing).filter(d => d.issue_date).sort(newest)[0]
  return last?.issue_date ? { end_date: yearTerm(last.issue_date), basis: 'debit_note' } : null
}

// ── Buckets ──────────────────────────────────────────────────────────────────────────────────────

export const BUCKETS = ['0-30', '31-60', '61-90', '91-120', '121+'] as const
export type Bucket = typeof BUCKETS[number]
export const isBucket = (v: unknown): v is Bucket => (BUCKETS as readonly unknown[]).includes(v)
export function bucketOf(days: number): Bucket {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  if (days <= 120) return '91-120'
  return '121+'
}

// ── Stages ───────────────────────────────────────────────────────────────────────────────────────

export const OPEN_STAGES = ['open', 'data_asked', 'marketing', 'quotes_in', 'proposed', 'instructed'] as const
export type OpenStage = typeof OPEN_STAGES[number]
export type Stage = OpenStage | 'renewed' | 'lost'
export const STAGE_NAME: Record<Stage, string> = {
  open: 'Open', data_asked: 'Data asked', marketing: 'Marketing', quotes_in: 'Quotes in', proposed: 'Proposed',
  instructed: 'Instructed', renewed: 'Renewed', lost: 'Lost',
}
export const isOpenStage = (v: unknown): v is OpenStage => (OPEN_STAGES as readonly unknown[]).includes(v)

export const LOSS_REASONS = ['price', 'service', 'no_contact', 'client_closed', 'other'] as const
export type LossReason = typeof LOSS_REASONS[number]
export const LOSS_NAME: Record<LossReason, string> = { price: 'Price', service: 'Service', no_contact: 'No contact', client_closed: 'Client closed', other: 'Other' }

export type RenewalState = { policy_id: string; stage: string; outcome: string | null }
export type Change = {
  stage?: unknown; owner?: unknown; outcome?: unknown; loss_reason?: unknown; loss_note?: unknown; renewed_policy_id?: unknown
}
export type Patch = Partial<{ stage: Stage; owner: string | null; outcome: 'renewed' | 'lost'; loss_reason: LossReason; loss_note: string | null; renewed_policy_id: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE_MAX = 500

/** What may be written for a change to one record, or why not. A closed record does not change. */
export function checkChange(r: RenewalState, c: Change): { patch: Patch } | { error: string } {
  if (r.outcome) return { error: 'This renewal is closed.' }
  const patch: Patch = {}
  if (c.owner !== undefined) {
    const owner = c.owner === null || c.owner === '' ? null : String(c.owner).trim().toLowerCase()
    if (owner !== null && !EMAIL.test(owner)) return { error: 'Choose the owner by email.' }
    patch.owner = owner
  }
  if (c.outcome !== undefined && c.outcome !== null) {
    if (c.outcome === 'renewed') {
      if (typeof c.renewed_policy_id !== 'string' || !UUID.test(c.renewed_policy_id)) return { error: 'Link the new policy to close as Renewed.' }
      if (c.renewed_policy_id === r.policy_id) return { error: 'Link the new term, not the expiring policy.' }
      return { patch: { ...patch, outcome: 'renewed', stage: 'renewed', renewed_policy_id: c.renewed_policy_id } }
    }
    if (c.outcome === 'lost') {
      if (!(LOSS_REASONS as readonly unknown[]).includes(c.loss_reason)) return { error: 'Choose why the renewal was lost.' }
      const note = typeof c.loss_note === 'string' ? c.loss_note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : ''
      if (c.loss_reason === 'other' && !note) return { error: 'Add a note for Other.' }
      return { patch: { ...patch, outcome: 'lost', stage: 'lost', loss_reason: c.loss_reason as LossReason, loss_note: note || null } }
    }
    return { error: 'Close as Renewed or Lost.' }
  }
  if (c.stage !== undefined) {
    if (c.stage === 'renewed' || c.stage === 'lost') return { error: c.stage === 'renewed' ? 'Link the new policy to close as Renewed.' : 'Choose why the renewal was lost.' }
    if (!isOpenStage(c.stage)) return { error: 'Unknown stage.' }
    patch.stage = c.stage
  }
  if (!Object.keys(patch).length) return { error: 'Nothing to change.' }
  return { patch }
}
