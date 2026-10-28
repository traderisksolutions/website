import type { DispatchPosition, LinePosition, PlacementBundle, PlacementDispatch, PlacementQuote } from './types'

export const DAY = 86_400_000

/** First chase after 3 working days, then every 2 working days, up to the cap the caller sets. */
export function nextChaseAt(from: Date, chaseCount: number): Date {
  const days = chaseCount === 0 ? 3 : 2
  return addWorkingDays(from, days)
}

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from.getTime())
  let left = days
  while (left > 0) {
    d.setTime(d.getTime() + DAY)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return d
}

/** A dispatch owes a chase when it has been sent, nothing has come back, and the date has passed. */
export function chaseDue(d: PlacementDispatch, now: Date): boolean {
  if (d.status !== 'sent' && d.status !== 'acknowledged') return false
  if (!d.next_chase_at) return false
  return new Date(d.next_chase_at).getTime() <= now.getTime()
}

export function quoteExpired(q: PlacementQuote | null, now: Date): boolean {
  if (!q?.valid_until) return false
  return new Date(`${q.valid_until}T23:59:59+08:00`).getTime() < now.getTime()
}

export const threadHref = (threadId: string | null) => threadId ? `/engagement?lead=${threadId}` : null

/** The current quotes of a dispatch, one per tier (null tier = the line's own spec): the latest not superseded. */
export function currentQuotes(dispatchId: string, quotes: PlacementQuote[]): PlacementQuote[] {
  const seen = new Set<string>()
  return quotes.filter(q => q.dispatch_id === dispatchId && q.status !== 'superseded')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(q => { const k = q.tier_id ?? ''; if (seen.has(k)) return false; seen.add(k); return true })
}

/** The one quote that stands for the dispatch: its price on the line's own spec, else its first tier priced. */
export function currentQuote(dispatchId: string, quotes: PlacementQuote[]): PlacementQuote | null {
  const own = currentQuotes(dispatchId, quotes)
  return own.find(q => !q.tier_id) ?? own[own.length - 1] ?? null
}

/** Where every line stands, from the raw rows. Pure, so it is testable and the tab needs no second read. */
export function derivePositions(b: PlacementBundle, now = new Date()): LinePosition[] {
  const out: LinePosition[] = []
  const linesSorted = [...b.lines].sort((x, y) => x.sort - y.sort || x.created_at.localeCompare(y.created_at))
  for (const line of linesSorted) {
    const round = (line.current_round_id ? b.rounds.find(r => r.id === line.current_round_id) : null)
      ?? [...b.rounds].filter(r => r.line_id === line.id).sort((x, y) => y.round_no - x.round_no)[0] ?? null
    const dispatches: DispatchPosition[] = b.dispatches
      .filter(d => round && d.round_id === round.id)
      .sort((x, y) => x.insurer_name.localeCompare(y.insurer_name))
      .map(dispatch => {
        const quote = currentQuote(dispatch.id, b.quotes)
        return { dispatch, quote, quotes: currentQuotes(dispatch.id, b.quotes), chaseDue: chaseDue(dispatch, now), expired: quoteExpired(quote, now), threadHref: threadHref(dispatch.thread_id) }
      })
    const tiers = (b.tiers ?? []).filter(t => t.line_id === line.id && t.status !== 'dropped')
      .sort((x, y) => x.sort - y.sort || x.created_at.localeCompare(y.created_at))
    const live = dispatches.filter(d => d.dispatch.status !== 'withdrawn')
    // Engine quotes: no dispatch behind them; one current quote per insurer.
    const seenInsurer = new Set<string>()
    const engineQuotes = b.quotes
      .filter(q => q.line_id === line.id && !q.dispatch_id && q.status !== 'superseded')
      .sort((x, y) => y.created_at.localeCompare(x.created_at))
      .filter(q => { const k = q.insurer_name.toLowerCase(); if (seenInsurer.has(k)) return false; seenInsurer.add(k); return true })
      .sort((x, y) => (x.premium_amount ?? Infinity) - (y.premium_amount ?? Infinity))
    const quotedCount   = live.filter(d => d.quote && !d.expired).length + engineQuotes.filter(q => !quoteExpired(q, now)).length
    const declinedCount = live.filter(d => d.dispatch.status === 'declined').length
    const awaitingCount = live.length - live.filter(d => d.quote && !d.expired).length - declinedCount
    const priced = [...live.map(d => d.quote), ...engineQuotes].filter((q): q is PlacementQuote => !!q && q.premium_amount != null && !quoteExpired(q, now))
    const best = priced.sort((x, y) => (x.premium_amount ?? 0) - (y.premium_amount ?? 0))[0] ?? null
    const pendingChange = b.log
      .filter(e => e.kind === 'change' && e.line_id === line.id && e.detail?.acted !== true && e.actor === 'agent')
      .sort((x, y) => y.created_at.localeCompare(x.created_at))[0] ?? null
    out.push({
      line, round, roundNo: round?.round_no ?? 0, tiers, dispatches, engineQuotes, quotedCount, declinedCount, awaitingCount,
      allAnswered: (live.length + engineQuotes.length) > 0 && awaitingCount === 0, best, pendingChange,
    })
  }
  return out
}
