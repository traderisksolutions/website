/**
 * derivePositions is the one place that turns the raw placement rows into "where each line
 * stands". The tab, the chase run and the client summary all read it, so the counting rules
 * (what is quoted, what is awaiting, what is best, what is still owed) are pinned here.
 */
import { describe, it, expect } from 'vitest'
import { addWorkingDays, nextChaseAt, chaseDue, quoteExpired, currentQuote, derivePositions, threadHref, DAY } from '@/lib/placement/position'
import type { PlacementBundle, PlacementDispatch, PlacementLine, PlacementLogEntry, PlacementQuote, PlacementRound, DispatchStatus } from '@/lib/placement/types'

// Tuesday 27 Oct 2026, 12:00 SGT.
const NOW = new Date('2026-10-27T04:00:00Z')
const iso = (d: Date) => d.toISOString()

const dispatch = (over: Partial<PlacementDispatch> & Pick<PlacementDispatch, 'id' | 'line_id' | 'round_id' | 'insurer_name' | 'status'>): PlacementDispatch => ({
  placement_id: 'p1', company_id: 'c1', insurer_company_id: null, insurer_contact_id: null, to_email: 'uw@example.com',
  ai_draft_id: null, thread_id: null, gmail_thread_id: null, sent_at: null, last_outbound_at: null, last_inbound_at: null,
  next_chase_at: null, chase_count: 0, created_at: iso(NOW), updated_at: iso(NOW), ...over,
})
const quote = (over: Partial<PlacementQuote> & Pick<PlacementQuote, 'id' | 'dispatch_id'>): PlacementQuote => ({
  placement_id: 'p1', line_id: 'A', round_id: 'A2', insurer_name: 'X', premium_text: null, premium_amount: null, currency: 'SGD',
  limit_text: null, limit_amount: null, excess_text: null, validity_text: null, valid_until: null, key_terms: [], exclusions: [],
  subjectivities: [], summary: null, evidence: {}, source_message_id: null, thread_id: null, status: 'received', needs_review: false,
  extracted_by: 'agent', created_at: iso(NOW), ...over,
})
const line = (over: Partial<PlacementLine> & Pick<PlacementLine, 'id' | 'sort'>): PlacementLine => ({
  placement_id: 'p1', product_line: 'public-liability', label: null, spec: {}, status: 'quoting', current_round_id: null,
  next_step: null, created_at: iso(NOW), updated_at: iso(NOW), ...over,
})
const round = (over: Partial<PlacementRound> & Pick<PlacementRound, 'id' | 'line_id' | 'round_no'>): PlacementRound => ({
  placement_id: 'p1', spec: {}, change_summary: null, reason: 'initial', source_message_id: null, opened_by: null,
  opened_at: iso(NOW), closed_at: null, ...over,
})
const log = (over: Partial<PlacementLogEntry> & Pick<PlacementLogEntry, 'id' | 'created_at'>): PlacementLogEntry => ({
  company_id: 'c1', placement_id: 'p1', line_id: 'A', round_id: null, dispatch_id: null, kind: 'change', actor: 'agent',
  text: 'Client changed the limit', thread_id: null, message_id: null, detail: {}, ...over,
})

describe('addWorkingDays / nextChaseAt', () => {
  const friday = new Date('2026-10-23T09:00:00Z')
  it('skips the weekend: Friday + 3 working days is Wednesday', () => {
    const d = addWorkingDays(friday, 3)
    expect(d.getUTCDay()).toBe(3)
    expect(d.toISOString().slice(0, 10)).toBe('2026-10-28')
  })
  it('does not move for zero days', () => { expect(addWorkingDays(friday, 0).getTime()).toBe(friday.getTime()) })
  it('chases first after 3 working days, then every 2', () => {
    expect(nextChaseAt(friday, 0).getTime()).toBe(addWorkingDays(friday, 3).getTime())
    expect(nextChaseAt(friday, 2).getTime()).toBe(addWorkingDays(friday, 2).getTime())
    expect(nextChaseAt(friday, 2).toISOString().slice(0, 10)).toBe('2026-10-27')
  })
})

describe('chaseDue', () => {
  const past = iso(new Date(NOW.getTime() - DAY)), future = iso(new Date(NOW.getTime() + DAY))
  const d = (status: DispatchStatus, next_chase_at: string | null) => dispatch({ id: 'd', line_id: 'A', round_id: 'A2', insurer_name: 'X', status, next_chase_at })
  it('is due for a sent or acknowledged dispatch whose chase date has passed', () => {
    expect(chaseDue(d('sent', past), NOW)).toBe(true)
    expect(chaseDue(d('acknowledged', past), NOW)).toBe(true)
    expect(chaseDue(d('sent', iso(NOW)), NOW)).toBe(true)
  })
  it('is not due once the insurer has answered, before sending, or before the date', () => {
    for (const s of ['quoted', 'declined', 'drafted', 'info_requested', 'withdrawn'] as DispatchStatus[]) expect(chaseDue(d(s, past), NOW)).toBe(false)
    expect(chaseDue(d('sent', future), NOW)).toBe(false)
    expect(chaseDue(d('sent', null), NOW)).toBe(false)
  })
})

describe('quoteExpired', () => {
  const q = (valid_until: string | null) => quote({ id: 'q', dispatch_id: 'd', valid_until })
  it('is false with no quote or no validity date', () => {
    expect(quoteExpired(null, NOW)).toBe(false)
    expect(quoteExpired(q(null), NOW)).toBe(false)
  })
  it('expires at the end of the day in Singapore time', () => {
    expect(quoteExpired(q('2026-10-26'), NOW)).toBe(true)
    expect(quoteExpired(q('2026-10-27'), NOW)).toBe(false)
    // 23:59:59 SGT on the 26th is 15:59:59Z; one second later it is expired.
    expect(quoteExpired(q('2026-10-26'), new Date('2026-10-26T15:59:59Z'))).toBe(false)
    expect(quoteExpired(q('2026-10-26'), new Date('2026-10-26T16:00:00Z'))).toBe(true)
  })
})

describe('currentQuote', () => {
  it('returns the latest non-superseded quote for the dispatch only', () => {
    const quotes = [
      quote({ id: 'old', dispatch_id: 'd1', status: 'superseded', created_at: '2026-10-20T00:00:00Z' }),
      quote({ id: 'mid', dispatch_id: 'd1', created_at: '2026-10-21T00:00:00Z' }),
      quote({ id: 'new', dispatch_id: 'd1', created_at: '2026-10-22T00:00:00Z' }),
      quote({ id: 'other', dispatch_id: 'd2', created_at: '2026-10-23T00:00:00Z' }),
    ]
    expect(currentQuote('d1', quotes)?.id).toBe('new')
    expect(currentQuote('d2', quotes)?.id).toBe('other')
    expect(currentQuote('d3', quotes)).toBeNull()
  })
  it('ignores a newer superseded quote', () => {
    const quotes = [
      quote({ id: 'kept', dispatch_id: 'd1', created_at: '2026-10-21T00:00:00Z' }),
      quote({ id: 'dropped', dispatch_id: 'd1', status: 'superseded', created_at: '2026-10-22T00:00:00Z' }),
    ]
    expect(currentQuote('d1', quotes)?.id).toBe('kept')
  })
})

describe('threadHref', () => {
  it('links to the engagement thread', () => {
    expect(threadHref('t1')).toBe('/engagement?lead=t1')
    expect(threadHref(null)).toBeNull()
  })
})

describe('derivePositions', () => {
  const past = iso(new Date(NOW.getTime() - DAY))
  const bundle: PlacementBundle = {
    placements: [{ id: 'p1', company_id: 'c1', title: 'Acme 2026 renewal', client_thread_id: 't0', client_contact_id: null, status: 'open', inception_date: null, notes: null, created_by: null, created_at: iso(NOW), updated_at: iso(NOW) }],
    // Line C has no round at all. Line B leans on the highest round_no fallback (no current_round_id).
    lines: [line({ id: 'B', sort: 2 }), line({ id: 'A', sort: 1, current_round_id: 'A2' }), line({ id: 'C', sort: 3 })],
    rounds: [round({ id: 'A1', line_id: 'A', round_no: 1 }), round({ id: 'A2', line_id: 'A', round_no: 2, reason: 'client_change' }), round({ id: 'B1', line_id: 'B', round_no: 1 })],
    dispatches: [
      // Line A, round 2: quoted, declined, sent with chase due, withdrawn.
      dispatch({ id: 'a-q', line_id: 'A', round_id: 'A2', insurer_name: 'Zeta', status: 'quoted', thread_id: 't-zeta' }),
      dispatch({ id: 'a-d', line_id: 'A', round_id: 'A2', insurer_name: 'Mu', status: 'declined' }),
      dispatch({ id: 'a-s', line_id: 'A', round_id: 'A2', insurer_name: 'Alpha', status: 'sent', next_chase_at: past }),
      dispatch({ id: 'a-w', line_id: 'A', round_id: 'A2', insurer_name: 'Omega', status: 'withdrawn' }),
      // Line A, round 1: a stale dispatch that must not count against round 2.
      dispatch({ id: 'a-old', line_id: 'A', round_id: 'A1', insurer_name: 'Zeta', status: 'quoted' }),
      // Line B, round 1: both quoted, one expired.
      dispatch({ id: 'b-1', line_id: 'B', round_id: 'B1', insurer_name: 'Beta', status: 'quoted' }),
      dispatch({ id: 'b-2', line_id: 'B', round_id: 'B1', insurer_name: 'Gamma', status: 'quoted' }),
    ],
    quotes: [
      quote({ id: 'q-a', dispatch_id: 'a-q', premium_amount: 2000, premium_text: 'S$2,000' }),
      quote({ id: 'q-a-old', dispatch_id: 'a-old', round_id: 'A1', premium_amount: 1500 }),
      quote({ id: 'q-b1', dispatch_id: 'b-1', line_id: 'B', round_id: 'B1', premium_amount: 1800, valid_until: '2026-12-31' }),
      quote({ id: 'q-b2', dispatch_id: 'b-2', line_id: 'B', round_id: 'B1', premium_amount: 1200, valid_until: '2026-10-26' }),
    ],
    log: [
      log({ id: 'l-acted', created_at: '2026-10-27T03:00:00Z', detail: { acted: true } }),
      log({ id: 'l-staff', created_at: '2026-10-27T03:30:00Z', actor: 'jane@trs' }),
      log({ id: 'l-open-new', created_at: '2026-10-27T02:00:00Z', detail: { acted: false } }),
      log({ id: 'l-open-old', created_at: '2026-10-27T01:00:00Z' }),
      log({ id: 'l-note', created_at: '2026-10-27T03:45:00Z', kind: 'note' }),
      log({ id: 'l-other-line', created_at: '2026-10-27T03:50:00Z', line_id: 'B', detail: { acted: true } }),
    ],
  }
  const pos = derivePositions(bundle, NOW)
  const A = pos[0], B = pos[1], C = pos[2]

  it('orders lines by sort', () => { expect(pos.map(p => p.line.id)).toEqual(['A', 'B', 'C']) })

  it('uses the current round and counts only its dispatches', () => {
    expect(A.roundNo).toBe(2)
    expect(A.round?.id).toBe('A2')
    expect(A.dispatches.map(d => d.dispatch.id)).toEqual(['a-s', 'a-d', 'a-w', 'a-q'])  // by insurer name
  })

  it('counts quoted, declined and awaiting on line A, excluding the withdrawn dispatch', () => {
    expect(A.quotedCount).toBe(1)
    expect(A.declinedCount).toBe(1)
    expect(A.awaitingCount).toBe(1)
    expect(A.allAnswered).toBe(false)
    expect(A.best?.id).toBe('q-a')
  })

  it('marks the chase, the quote and the thread per dispatch', () => {
    const byId = Object.fromEntries(A.dispatches.map(d => [d.dispatch.id, d]))
    expect(byId['a-s'].chaseDue).toBe(true)
    expect(byId['a-q'].chaseDue).toBe(false)
    expect(byId['a-q'].quote?.id).toBe('q-a')
    expect(byId['a-q'].threadHref).toBe('/engagement?lead=t-zeta')
    expect(byId['a-d'].threadHref).toBeNull()
    expect(byId['a-d'].quote).toBeNull()
  })

  it('falls back to the highest round when the line has no current_round_id', () => {
    expect(B.roundNo).toBe(1)
    expect(B.round?.id).toBe('B1')
  })

  it('treats an expired quote as not quoted, so the line is still awaiting', () => {
    // Rule: quotedCount counts live dispatches holding a current, unexpired quote. An expired
    // quote is neither quoted nor declined, so it falls into awaitingCount and allAnswered stays
    // false until the insurer re-quotes or the dispatch is withdrawn.
    expect(B.quotedCount).toBe(1)
    expect(B.declinedCount).toBe(0)
    expect(B.awaitingCount).toBe(1)
    expect(B.allAnswered).toBe(false)
    expect(B.dispatches.find(d => d.dispatch.id === 'b-2')?.expired).toBe(true)
  })

  it('picks the lowest premium among unexpired quotes as best', () => {
    // q-b2 is cheaper (1,200) but expired; q-b1 (1,800) is the best live price.
    expect(B.best?.id).toBe('q-b1')
  })

  it('surfaces the newest unacted agent change and ignores acted or staff entries', () => {
    expect(A.pendingChange?.id).toBe('l-open-new')
    expect(B.pendingChange).toBeNull()
  })

  it('gives a line with no round roundNo 0 and no dispatches', () => {
    expect(C.roundNo).toBe(0)
    expect(C.round).toBeNull()
    expect(C.dispatches).toEqual([])
    expect(C.quotedCount + C.declinedCount + C.awaitingCount).toBe(0)
    expect(C.allAnswered).toBe(false)
    expect(C.best).toBeNull()
  })

  it('reports allAnswered once every live dispatch has quoted or declined', () => {
    const b2: PlacementBundle = { ...bundle, quotes: bundle.quotes.map(q => q.id === 'q-b2' ? { ...q, valid_until: null } : q) }
    const B2 = derivePositions(b2, NOW)[1]
    expect(B2.quotedCount).toBe(2)
    expect(B2.allAnswered).toBe(true)
    expect(B2.best?.id).toBe('q-b2')
  })
})
