/**
 * The comparison grid and the RFQ register, derived from the placement rows. Pure: no I/O, so
 * what a broker reads in a cell is testable.
 *
 *   Comparison: insurers across the top, the line's options under each (the line as asked, then
 *   every tier), one cell per insurer × option. A tier added later is a new column under every
 *   insurer; a price for a tier nobody asked for shows in its own column.
 *   Register: one row per open line across every client, with where it stands in words.
 */
import { quoteExpired } from './position'
import type { DispatchPosition, LinePosition, Placement, PlacementQuote, PlacementTier } from './types'

/** One option column: the line as asked (tier null) or a tier. */
export type GridOption = { key: string; label: string; tier: PlacementTier | null }

export type CellState = 'quoted' | 'expired' | 'declined' | 'asked' | 'chase' | 'drafted' | 'not_asked' | 'withdrawn' | 'none'
export const CELL_WORD: Record<CellState, string> = {
  quoted: 'Quoted', expired: 'Expired', declined: 'Declined', asked: 'Asked', chase: 'Chase due',
  drafted: 'Drafted', not_asked: 'Not asked', withdrawn: 'Withdrawn', none: '',
}

export type GridCell = { option: GridOption; state: CellState; quote: PlacementQuote | null }

/** One insurer group across the top: a dispatch, or a rate-table insurer with no dispatch. */
export type GridInsurer = {
  key: string
  insurer: string
  /** The insurer's product as named on the request, when known; else the plan label of a rate-table quote. */
  product: string | null
  dispatch: DispatchPosition | null
  cells: GridCell[]
}

export type LineGrid = { options: GridOption[]; insurers: GridInsurer[] }

/** The line as asked is labelled by its limit when one was given ("S$1M"), else "As asked". */
export function baseLabel(pos: LinePosition): string {
  const limit = (pos.round?.spec?.limit ?? pos.line.spec?.limit ?? '').trim()
  return limit ? (limit.length > 18 ? limit.slice(0, 17) + '…' : limit) : 'As asked'
}

/**
 * The columns: the line as asked, then every tier not dropped. The base column is left out when
 * the line has tiers and nobody priced the base, so a "500k · 1M · 2M" line reads as three
 * columns rather than four.
 */
export function gridOptions(pos: LinePosition): GridOption[] {
  const tiers = pos.tiers.map(t => ({ key: t.id, label: t.label, tier: t }))
  const basePriced = pos.dispatches.some(d => d.quotes.some(q => !q.tier_id)) || pos.engineQuotes.length > 0
  if (tiers.length && !basePriced) return tiers
  return [{ key: 'base', label: baseLabel(pos), tier: null }, ...tiers]
}

/** Where one insurer stands on one option. */
export function cellState(dp: DispatchPosition, option: GridOption, quote: PlacementQuote | null, now: Date): CellState {
  const s = dp.dispatch.status
  if (quote) return quoteExpired(quote, now) ? 'expired' : 'quoted'
  if (s === 'withdrawn') return 'withdrawn'
  if (s === 'declined') return 'declined'
  if (s === 'drafted') return 'drafted'
  // A tier is asked of every insurer on the line at once (and rides in every later round's request).
  if (option.tier?.status === 'proposed') return 'not_asked'
  // Offered by another insurer unprompted: nobody asked this one.
  if (option.tier?.status === 'offered') return 'none'
  return dp.chaseDue ? 'chase' : 'asked'
}

export function lineGrid(pos: LinePosition, now = new Date()): LineGrid {
  const options = gridOptions(pos)
  const insurers: GridInsurer[] = pos.dispatches.map(dp => ({
    key: dp.dispatch.id,
    insurer: dp.dispatch.insurer_name,
    product: dp.dispatch.insurer_product_name ?? null,
    dispatch: dp,
    cells: options.map(option => {
      const quote = dp.quotes.find(q => (q.tier_id ?? null) === (option.tier?.id ?? null)) ?? null
      return { option, quote, state: cellState(dp, option, quote, now) }
    }),
  }))
  // Rate-table prices (employment benefits) have no dispatch and price the line as asked only.
  for (const q of pos.engineQuotes) {
    insurers.push({
      key: q.id, insurer: q.insurer_name, product: q.plan_label ?? 'Rate table', dispatch: null,
      cells: options.map(option => option.tier
        ? { option, quote: null, state: 'none' as const }
        : { option, quote: q, state: quoteExpired(q, now) ? 'expired' as const : 'quoted' as const }),
    })
  }
  return { options, insurers }
}

/** Lowest current figure on the line per option, so the grid can mark it. Per head when every price has one. */
export function lowestByOption(grid: LineGrid): Map<string, string> {
  const out = new Map<string, string>()
  for (const o of grid.options) {
    const quotes = grid.insurers.map(i => i.cells.find(c => c.option.key === o.key)).filter((c): c is GridCell => !!c && c.state === 'quoted' && !!c.quote).map(c => c.quote!)
    const priced = quotes.filter(q => q.premium_amount != null)
    if (priced.length < 2) continue
    const best = priced.reduce((a, b) => (b.premium_amount! < a.premium_amount! ? b : a))
    out.set(o.key, best.id)
  }
  return out
}

// ── The register ────────────────────────────────────────────────────────────────────────────

export type RegisterStage =
  | 'not_asked' | 'drafted' | 'waiting' | 'chase' | 'quoting' | 'all_in'
  | 'shared' | 'client_chose' | 'confirming' | 'dn_due' | 'bound' | 'done' | 'dropped' | 'lost'
export const STAGE_WORD: Record<RegisterStage, string> = {
  not_asked: 'Not asked', drafted: 'Drafts to send', waiting: 'Waiting on insurers', chase: 'Chase due',
  quoting: 'Quotes coming in', all_in: 'All answered', shared: 'With client',
  client_chose: 'Client chose, confirm', confirming: 'Confirming with insurer', dn_due: 'Insurer confirmed, DN due', bound: 'Bound, DN to issue',
  done: 'Done', dropped: 'Dropped', lost: 'Lost',
}
/** Who the line waits on. */
export type WaitingOn = 'broker' | 'insurer' | 'client' | null

export function lineStage(pos: LinePosition, placement: Pick<Placement, 'status'>): { stage: RegisterStage; waitingOn: WaitingOn } {
  const s = pos.line.status
  if (s === 'done' || pos.line.done_at) return { stage: 'done', waitingOn: null }
  if (s === 'dropped' || s === 'closed') return { stage: 'dropped', waitingOn: null }
  // Every insurer declined: nothing left to place on this line.
  if (s === 'lost' || s === 'declined') return { stage: 'lost', waitingOn: null }
  const l = pos.line
  if (l.insurer_confirmed_at) return { stage: 'dn_due', waitingOn: 'broker' }
  if (l.confirm_sent_at) return { stage: 'confirming', waitingOn: 'insurer' }
  if (l.client_confirmed_at && s !== 'bound') return { stage: 'client_chose', waitingOn: 'broker' }
  if (s === 'bound' || placement.status === 'bound') return { stage: 'bound', waitingOn: 'broker' }
  if (s === 'presented' || placement.status === 'presented') return { stage: 'shared', waitingOn: 'client' }
  const live = pos.dispatches.filter(d => d.dispatch.status !== 'withdrawn')
  if (live.length === 0 && pos.engineQuotes.length === 0) return { stage: 'not_asked', waitingOn: 'broker' }
  if (live.length > 0 && live.every(d => d.dispatch.status === 'drafted')) return { stage: 'drafted', waitingOn: 'broker' }
  if (live.some(d => d.chaseDue)) return { stage: 'chase', waitingOn: 'broker' }
  if (pos.allAnswered) return { stage: 'all_in', waitingOn: 'broker' }
  if (pos.quotedCount > 0) return { stage: 'quoting', waitingOn: 'insurer' }
  return { stage: 'waiting', waitingOn: 'insurer' }
}

export type RegisterRowData = {
  line_id: string
  placement_id: string
  ref: string
  company_id: string
  company_name: string
  received: string
  line_label: string
  product_line: string
  options: string[]
  round: number
  asked: number
  quoted: number
  declined: number
  lowest: PlacementQuote | null
  inception: string | null
  stage: RegisterStage
  waiting_on: WaitingOn
  next_step: string | null
  /** Most recent of: the broker who sent a request, or who opened the placement. */
  last_by: string | null
  last_at: string | null
}

export function registerRow(pos: LinePosition, placement: Placement, companyName: string, lineLabel: string): RegisterRowData {
  const { stage, waitingOn } = lineStage(pos, placement)
  const sends = pos.dispatches.filter(d => d.dispatch.sent_at).sort((a, b) => (b.dispatch.sent_at ?? '').localeCompare(a.dispatch.sent_at ?? ''))
  const lastAt = [pos.line.updated_at, ...pos.dispatches.flatMap(d => [d.dispatch.last_inbound_at, d.dispatch.last_outbound_at])].filter((x): x is string => !!x).sort().pop() ?? null
  return {
    line_id: pos.line.id, placement_id: placement.id, ref: placement.ref, company_id: placement.company_id, company_name: companyName,
    received: placement.created_at, line_label: lineLabel, product_line: pos.line.product_line,
    options: pos.tiers.map(t => t.label), round: pos.roundNo,
    asked: pos.dispatches.filter(d => d.dispatch.status !== 'withdrawn').length + pos.engineQuotes.length,
    quoted: pos.quotedCount, declined: pos.declinedCount,
    // Same rule as the comparison grid: a lowest needs at least two prices to compare.
    lowest: pos.quotedCount >= 2 ? pos.best : null,
    inception: placement.inception_date, stage, waiting_on: waitingOn, next_step: pos.line.next_step,
    last_by: sends[0]?.dispatch.sent_by ?? placement.created_by ?? null, last_at: lastAt,
  }
}

/** The strip above the register: counts a broker scans first. */
export function registerCounts(rows: RegisterRowData[]) {
  const open = rows.filter(r => !['done', 'dropped', 'lost'].includes(r.stage))
  return {
    open: open.length,
    broker: open.filter(r => r.waiting_on === 'broker').length,
    insurer: open.filter(r => r.waiting_on === 'insurer').length,
    client: open.filter(r => r.waiting_on === 'client').length,
  }
}
