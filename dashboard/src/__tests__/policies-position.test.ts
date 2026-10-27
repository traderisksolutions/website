/**
 * weekSnapshot is the one place the weekly line on an EB policy is computed; the cron, the
 * Members tab and the register all read its rows. The week boundary (Monday, Singapore time),
 * who counts as covered at the Sunday, and the sign convention on the insurer's notes are
 * pinned here.
 */
import { describe, it, expect } from 'vitest'
import { mondayOf, weekSnapshot } from '@/lib/policies/position'
import { matchMovement, signedAmount } from '@/lib/policies/transactions'
import type { PolicyMovement } from '@/lib/policies/types'

type M = { status: 'active' | 'left'; joined_on: string | null; left_on: string | null }
type V = { kind: 'join' | 'leave' | 'change'; effective_on: string | null; pax: number; status: PolicyMovement['status'] }
type T = { kind: 'debit' | 'credit'; amount: number; issued_on: string | null; created_at: string }

const member = (o: Partial<M> = {}): M => ({ status: 'active', joined_on: null, left_on: null, ...o })
const move = (o: Partial<V> & Pick<V, 'kind'>): V => ({ effective_on: null, pax: 1, status: 'reported', ...o })
const tx = (o: Partial<T> & Pick<T, 'kind' | 'amount'>): T => ({ issued_on: null, created_at: '2026-01-01T00:00:00Z', ...o })

describe('mondayOf (SGT)', () => {
  it('reads the week on the Singapore calendar, not UTC', () => {
    // Sunday 25 Oct 2026 23:30 SGT = 15:30Z: still the week of Mon 19 Oct.
    expect(mondayOf('2026-10-25T15:30:00Z')).toBe('2026-10-19')
    // Monday 26 Oct 00:30 SGT = Sunday 25 Oct 16:30Z: the new week.
    expect(mondayOf('2026-10-25T16:30:00Z')).toBe('2026-10-26')
    // Monday 26 Oct 23:30 SGT.
    expect(mondayOf('2026-10-26T15:30:00Z')).toBe('2026-10-26')
  })
  it('returns the day itself on a Monday and the previous Monday otherwise', () => {
    expect(mondayOf('2026-10-26T02:00:00Z')).toBe('2026-10-26')
    expect(mondayOf('2026-10-29T02:00:00Z')).toBe('2026-10-26')
    expect(mondayOf('2026-11-01T02:00:00Z')).toBe('2026-10-26')
  })
  it('accepts a Date or epoch millis', () => {
    expect(mondayOf(new Date('2026-10-28T00:00:00Z'))).toBe('2026-10-26')
    expect(mondayOf(Date.parse('2026-10-28T00:00:00Z'))).toBe('2026-10-26')
  })
})

describe('weekSnapshot', () => {
  const WEEK = '2026-10-19'   // Mon 19 – Sun 25 Oct 2026

  it('counts pax at the Sunday: census members, joiners up to the Sunday, leavers only after it', () => {
    const members: M[] = [
      member(),                                                     // census, no join date → covered
      member({ joined_on: '2026-10-25' }),                          // joined on the Sunday → covered
      member({ joined_on: '2026-10-26' }),                          // joined next Monday → not yet
      member({ status: 'left', left_on: '2026-10-25' }),            // left on the Sunday → gone
      member({ status: 'left', left_on: '2026-10-30' }),            // leaves next week → still covered this week
      member({ status: 'left', left_on: null }),                    // left, date unknown → not counted
    ]
    expect(weekSnapshot(members, [], [], WEEK).pax_active).toBe(3)
  })

  it('sums join and leave pax effective in the week and ignores cancelled movements', () => {
    const movements: V[] = [
      move({ kind: 'join', effective_on: '2026-10-19', pax: 2 }),
      move({ kind: 'join', effective_on: '2026-10-18' }),           // Sunday before → last week
      move({ kind: 'leave', effective_on: '2026-10-25' }),
      move({ kind: 'leave', effective_on: '2026-10-26' }),          // next Monday
      move({ kind: 'leave', effective_on: '2026-10-21', status: 'cancelled' }),
      move({ kind: 'change', effective_on: '2026-10-21' }),
    ]
    const s = weekSnapshot([], movements, [], WEEK)
    expect(s.joins).toBe(2)
    expect(s.leaves).toBe(1)
  })

  it('reports credits as a positive number in credited and negative in the net', () => {
    const transactions: T[] = [
      tx({ kind: 'debit', amount: 1000, issued_on: '2026-10-20' }),
      tx({ kind: 'credit', amount: -240, issued_on: '2026-10-22' }),
      tx({ kind: 'credit', amount: -60, issued_on: '2026-10-26' }),  // next week
    ]
    const s = weekSnapshot([], [], transactions, WEEK)
    expect(s.billed).toBe(1000)
    expect(s.credited).toBe(240)
    expect(s.net_week).toBe(760)
  })

  it('runs net_to_date from inception to the Sunday, signed', () => {
    const transactions: T[] = [
      tx({ kind: 'debit', amount: 5000, issued_on: '2026-07-01' }),
      tx({ kind: 'credit', amount: -500, issued_on: '2026-09-15' }),
      tx({ kind: 'debit', amount: 300, issued_on: '2026-10-19' }),
      tx({ kind: 'debit', amount: 999, issued_on: '2026-10-27' }),   // after the week → not yet
    ]
    const s = weekSnapshot([], [], transactions, WEEK)
    expect(s.net_week).toBe(300)
    expect(s.net_to_date).toBe(4800)
    expect(weekSnapshot([], [], transactions, '2026-10-26').net_to_date).toBe(5799)
  })

  it('uses created_at when a note has no issue date', () => {
    const transactions: T[] = [tx({ kind: 'debit', amount: 80, created_at: '2026-10-23T09:00:00Z' })]
    expect(weekSnapshot([], [], transactions, WEEK).billed).toBe(80)
    expect(weekSnapshot([], [], transactions, '2026-10-12').billed).toBe(0)
  })

  it('returns the week it was asked for', () => {
    expect(weekSnapshot([], [], [], WEEK).week_start).toBe(WEEK)
  })
})

describe('signedAmount', () => {
  it('stores credits negative and debits positive whatever sign came in', () => {
    expect(signedAmount('credit', 1240)).toBe(-1240)
    expect(signedAmount('credit', -1240)).toBe(-1240)
    expect(signedAmount('debit', -300)).toBe(300)
  })
})

describe('matchMovement', () => {
  const mv = (o: Partial<PolicyMovement> & Pick<PolicyMovement, 'id' | 'kind' | 'member_name'>): PolicyMovement => ({
    policy_id: 'p', company_id: 'c', member_id: null, relationship: null, effective_on: null, pax: 1, detail: {},
    reported_thread_id: null, reported_message_id: null, sent_draft_id: null, sent_at: null, transaction_id: null,
    status: 'sent', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o,
  })
  const movements = [
    mv({ id: 'a', kind: 'leave', member_name: 'Tan Ah Kow', effective_on: '2026-10-01' }),
    mv({ id: 'b', kind: 'leave', member_name: 'Lim Bee Hoon', effective_on: '2026-10-15' }),
    mv({ id: 'c', kind: 'join', member_name: 'Ng Wei Ming', effective_on: '2026-10-10' }),
    mv({ id: 'd', kind: 'leave', member_name: 'Settled One', effective_on: '2026-10-14', status: 'noted', transaction_id: 't0' }),
  ]
  it('matches by member name first, ignoring case and punctuation', () => {
    const hit = matchMovement({ kind: 'credit', pax: 1, issued_on: '2026-10-20', period_start: null, member_names: ['TAN, AH KOW'] }, movements)
    expect(hit.map(m => m.id)).toEqual(['a'])
  })
  it('falls back to pax and the nearest effective date, within the matching kind', () => {
    const hit = matchMovement({ kind: 'credit', pax: 1, issued_on: '2026-10-20', period_start: '2026-10-16', member_names: [] }, movements)
    expect(hit.map(m => m.id)).toEqual(['b'])
    const join = matchMovement({ kind: 'debit', pax: 1, issued_on: '2026-10-20', period_start: null, member_names: [] }, movements)
    expect(join.map(m => m.id)).toEqual(['c'])
  })
  it('never re-matches a movement already noted, and matches nothing without name or pax', () => {
    expect(matchMovement({ kind: 'credit', pax: 1, issued_on: null, period_start: null, member_names: ['Settled One'] }, movements).map(m => m.id)).not.toContain('d')
    expect(matchMovement({ kind: 'credit', pax: null, issued_on: null, period_start: null, member_names: [] }, movements)).toEqual([])
  })
})
