/**
 * Renewals › Pipeline, release 2 (docs/renewals.md). Pure and browser-safe; tested in
 * __tests__/pipeline.test.ts.
 *
 *   pipeBucketOf(r)        0-30, 31-60, 61-90, 91-120, 121+ for an open record; Lost or Renewed for a closed one
 *   nextTask(tasks)        the earliest task not done
 *   riskFlags(r, today)    no client contact, quote above expiring by more than 10%, still Open under 30 days
 *   lowestPlacementQuote / ebQuoteTotal / quotedPremium   the quote a risk flag compares against
 *   crossSell(held)        the fixed lines a client holds and the ones it does not
 *   pipelineMeta(rows)     open records expiring in the next 120 days and their gross premium
 */
import { LINES, isLineCode, lineOfPolicy, type LineCode } from './lines'
import { BUCKETS, bucketOf, daysBetween, type Bucket } from './rules'

export const PIPE_BUCKETS = [...BUCKETS, 'lost', 'renewed'] as const
export type PipeBucket = typeof PIPE_BUCKETS[number]
export const PIPE_BUCKET_NAME: Record<PipeBucket, string> = {
  '0-30': '0–30 days', '31-60': '31–60', '61-90': '61–90', '91-120': '91–120', '121+': '121+', lost: 'Lost', renewed: 'Renewed',
}
/** Shown until a person picks Lost or Renewed. */
export const DEFAULT_BUCKETS: readonly PipeBucket[] = BUCKETS

export function pipeBucketOf(r: { outcome: string | null; days: number }): PipeBucket {
  if (r.outcome === 'renewed') return 'renewed'
  if (r.outcome === 'lost') return 'lost'
  return bucketOf(r.days) as Bucket
}

// ── Tasks ────────────────────────────────────────────────────────────────────────────────────────

export type TaskRow = { kind: string; due_on: string; done_at: string | null; done_by?: string | null }
const KIND_ORDER = ['-90', '-60', '-30', '-15']
export const taskName = (kind: string): string => `${kind.replace(/^-/, '')} days before expiry`
export const sortTasks = <T extends TaskRow>(tasks: readonly T[]): T[] =>
  [...tasks].sort((a, b) => a.due_on.localeCompare(b.due_on) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
export const nextTask = <T extends TaskRow>(tasks: readonly T[]): T | null => sortTasks(tasks).find(t => !t.done_at) ?? null
/** Due today or before, not done. */
export const isTaskDue = (t: TaskRow, today: string): boolean => !t.done_at && t.due_on <= today

// ── At risk ──────────────────────────────────────────────────────────────────────────────────────

export const CONTACT_DAYS = 30
export const PRICE_RISE = 0.1
export const RISK_FLAGS = ['no_contact', 'price_up', 'still_open'] as const
export type RiskFlag = typeof RISK_FLAGS[number]
export const RISK_NAME: Record<RiskFlag, string> = {
  no_contact: 'No contact 30 days', price_up: 'Quote over +10%', still_open: 'Still Open',
}

export type RiskInput = {
  outcome: string | null; stage: string; days: number
  /** The latest message on the client's threads, either way. */
  lastContact: string | null
  premium: number | null
  /** The lowest premium quoted this term, when one exists. */
  quoted: number | null
}

/**
 * Open records only.
 *  no_contact   expiry within 30 days and no message on the client's threads in the last 30 days
 *  price_up     the lowest quote this term is more than 10% above the expiring premium
 *  still_open   stage Open with under 30 days to expiry (overdue included)
 */
export function riskFlags(r: RiskInput, today: string): RiskFlag[] {
  if (r.outcome) return []
  const out: RiskFlag[] = []
  if (r.days <= CONTACT_DAYS && (!r.lastContact || daysBetween(r.lastContact.slice(0, 10), today) > CONTACT_DAYS)) out.push('no_contact')
  if (r.premium != null && r.premium > 0 && r.quoted != null && r.quoted > r.premium * (1 + PRICE_RISE)) out.push('price_up')
  if (r.stage === 'open' && r.days < 30) out.push('still_open')
  return out
}

type Num = number | string | null | undefined
const num = (v: Num): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }

export type PlacementQuoteLike = { company_id: string | null; product_line: string | null; premium_amount: Num; created_at: string; status?: string | null }

/** The lowest positive quote for the client and line made on or after the record opened. Declined or withdrawn quotes do not count. */
export function lowestPlacementQuote(quotes: readonly PlacementQuoteLike[], r: { company_id: string | null; line_code: string | null; opens_on: string }): number | null {
  if (!r.company_id || !r.line_code) return null
  let best: number | null = null
  for (const q of quotes) {
    if (q.company_id !== r.company_id || q.created_at.slice(0, 10) < r.opens_on || /declin|withdraw/i.test(q.status ?? '')) continue
    if (lineOfPolicy({ product_line: q.product_line }) !== r.line_code) continue
    const p = num(q.premium_amount)
    if (p != null && p > 0 && (best == null || p < best)) best = p
  }
  return best
}

/**
 * An Employment Benefits quotation's lowest product total: each product's premiums summed over
 * every category and cover (snapshot.categories[].covers[cover][product].premium). A product with
 * nothing priced is skipped.
 */
export function ebQuoteTotal(categories: unknown): number | null {
  if (!Array.isArray(categories)) return null
  const totals = new Map<string, number>()
  for (const c of categories) {
    const covers = (c as { covers?: unknown })?.covers
    if (!covers || typeof covers !== 'object') continue
    for (const byProduct of Object.values(covers as Record<string, unknown>)) {
      if (!byProduct || typeof byProduct !== 'object') continue
      for (const [product, cell] of Object.entries(byProduct as Record<string, unknown>)) {
        const p = num((cell as { premium?: Num })?.premium)
        if (p != null && p > 0) totals.set(product, (totals.get(product) ?? 0) + p)
      }
    }
  }
  const all = [...totals.values()]
  return all.length ? Math.round(Math.min(...all) * 100) / 100 : null
}

export type EbQuoteLike = { company_id: string | null; created_at: string; categories: unknown }

/** The quote a record compares against: placement quotes for the line; for Employment Benefits also the client's quotations this term. */
export function quotedPremium(r: { company_id: string | null; line_code: string | null; opens_on: string }, placement: readonly PlacementQuoteLike[], eb: readonly EbQuoteLike[]): number | null {
  const fromPlacement = lowestPlacementQuote(placement, r)
  if (r.line_code !== 'eb' || !r.company_id) return fromPlacement
  const fromEb = eb.filter(q => q.company_id === r.company_id && q.created_at.slice(0, 10) >= r.opens_on).map(q => ebQuoteTotal(q.categories)).filter((x): x is number => x != null)
  const all = [...fromEb, ...(fromPlacement == null ? [] : [fromPlacement])]
  return all.length ? Math.min(...all) : null
}

// ── Cross-sell ───────────────────────────────────────────────────────────────────────────────────

/** The fixed lines a client holds (from its live policies' lines) and the ones it does not. Other is never listed as missing. */
export function crossSell(held: readonly (string | null | undefined)[]): { held: LineCode[]; missing: LineCode[] } {
  const set = new Set(held.filter(isLineCode))
  return {
    held: LINES.filter(l => set.has(l.code)).map(l => l.code),
    missing: LINES.filter(l => l.code !== 'other' && !set.has(l.code)).map(l => l.code),
  }
}

// ── Header ───────────────────────────────────────────────────────────────────────────────────────

export function pipelineMeta(rows: readonly { outcome: string | null; days: number; premium: number | null }[]): { open: number; gross: number } {
  const due = rows.filter(r => !r.outcome && r.days <= 120)
  return { open: due.length, gross: Math.round(due.reduce((s, r) => s + (r.premium ?? 0), 0) * 100) / 100 }
}
