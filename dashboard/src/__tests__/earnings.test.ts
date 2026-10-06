/** Earnings aggregation: credit notes subtract, lifetime ignores the date filter, VIP by the 80% rule. */
import { describe, it, expect } from 'vitest'
import { isCredit, totals, monthly, clients, groupBy, applyFilter, renewalsDue, type Note } from '@/lib/analytics/earnings'

const n = (no: string, date: string, co: string, premium: number, commission: number | null, extra: Partial<Note> = {}): Note =>
  ({ id: no, no, issueDate: date, companyId: co, companyName: co.toUpperCase(), insurer: 'QBE', className: 'WICA', policyId: `p-${no}`,
     eventType: 'new_business', premium, commission, currency: 'SGD', ...extra })

const notes = [
  n('DN1', '2026-01-10', 'a', 10_000, 1_000),
  n('DN2', '2026-03-05', 'a', 5_000, 500),
  n('DN3', '2026-03-20', 'b', 2_000, 200),
  n('DN4', '2025-06-01', 'c', 1_000, null),
  n('CN1', '2026-03-25', 'a', -1_000, -100),
  n('DN5', '2026-02-01', 'd', 900, 90, { currency: 'USD' }),
]

describe('earnings', () => {
  it('reads a credit note by number, sign or event', () => {
    expect(isCredit({ no: 'CN1', premium: 5, eventType: null })).toBe(true)
    expect(isCredit({ no: 'DN9', premium: -5, eventType: null })).toBe(true)
    expect(isCredit({ no: 'DN9', premium: 5, eventType: 'cancellation' })).toBe(true)
    expect(isCredit({ no: 'DN9', premium: 5, eventType: 'endorsement' })).toBe(false)
  })

  it('nets credit notes off income and leaves other currencies out', () => {
    const t = totals(applyFilter(notes, { from: null, to: null, insurer: null, className: null }))
    expect(t).toMatchObject({ commission: 1700, creditCommission: 100, netCommission: 1600, debitNotes: 4, creditNotes: 1, noCommission: 1, clients: 3 })
  })

  it('lists every month in range, empty ones included', () => {
    const m = monthly(applyFilter(notes, { from: '2026-01-01', to: '2026-03-31', insurer: null, className: null }), 'commission', '2026-01-01', '2026-03-31')
    expect(m).toEqual([
      { month: '2026-01', earned: 1000, credited: 0, net: 1000 },
      { month: '2026-02', earned: 0, credited: 0, net: 0 },
      { month: '2026-03', earned: 700, credited: -100, net: 600 },
    ])
  })

  it('ranks clients by lifetime value whatever the date filter, and marks VIP by the 80% rule', () => {
    const all = applyFilter(notes, { from: null, to: null, insurer: null, className: null })
    const period = applyFilter(notes, { from: '2026-03-01', to: '2026-03-31', insurer: null, className: null })
    const rows = clients(period, all, 'commission')
    expect(rows.map(r => [r.name, r.lifetimeValue, r.periodValue, r.vip])).toEqual([
      ['A', 1400, 400, true],     // 1400 / 1600 = 87.5%: crosses 80%, in
      ['B', 200, 200, false],
      ['C', 0, 0, false],
    ])
    expect(rows[0].tenureMonths).toBe(3)
  })

  it('gives each insurer its commission rate on notes that carry one', () => {
    const g = groupBy(applyFilter(notes, { from: null, to: null, insurer: null, className: null }), x => x.insurer)
    expect(g[0]).toMatchObject({ name: 'QBE', commission: 1600, premium: 17000, notes: 5 })
    expect(g[0].rate).toBeCloseTo(1600 / 16000)
  })
})

describe('renewalsDue', () => {
  it('lists policies ending within 90 days, soonest first, with last term income', () => {
    const xs = [
      n('DN10', '2025-11-01', 'a', 10_000, 1_500, { policyId: 'p1', policyNumber: 'P-1', policyEnd: '2026-11-15' }),
      n('DN11', '2026-01-01', 'a', 2_000, 300, { policyId: 'p1', policyNumber: 'P-1', policyEnd: '2026-11-15' }),
      n('DN12', '2025-10-01', 'b', 5_000, 700, { policyId: 'p2', policyEnd: '2027-06-30' }),
      n('DN13', '2025-09-01', 'c', 1_000, 100, { policyId: 'p3', policyEnd: '2026-09-20' }),
      n('DN14', '2025-08-01', 'd', 1_000, 100, { policyId: 'p4', policyEnd: '2026-07-01' }),
    ]
    const r = renewalsDue(xs, '2026-10-02')
    expect(r.map(x => [x.policyId, x.daysLeft, x.commission])).toEqual([['p3', -12, 100], ['p1', 44, 1800]])
  })
})

describe('fee rebates', () => {
  it('nets a fee rebate off the commission TRS keeps, never off a missing commission', () => {
    const xs = [
      n('DN20', '2026-04-21', 'a', 300.39, 101.25, { feeRebate: 67.5 }),
      n('DN21', '2026-04-22', 'b', 500, null, { feeRebate: 50 }),
    ]
    const t = totals(applyFilter(xs, { from: null, to: null, insurer: null, className: null }))
    expect(t.commission).toBe(33.75)
  })
})
