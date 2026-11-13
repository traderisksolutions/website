import { describe, it, expect } from 'vitest'
import { buildPortfolio, requestType, type PortfolioInput } from '@/lib/clients/portfolio'

const base = (over: Partial<PortfolioInput> = {}): PortfolioInput => ({
  today: '2026-11-13', window: '12m',
  businesses: ['A', 'B', 'C', 'D', 'E', 'F'].map(id => ({ id, name: `Co ${id}`, kind: 'client' })),
  groupOf: id => id === 'A2' ? 'A' : id,
  debitNotes: [
    { company_id: 'A', issue_date: '2026-08-01', gross_amount: 100_000, commission: 15_000, currency: 'SGD' },
    { company_id: 'A2', issue_date: '2026-03-01', gross_amount: 20_000, commission: 3_000, currency: 'SGD' },
    { company_id: 'B', issue_date: '2026-06-01', gross_amount: 10_000, commission: 1_000, currency: 'SGD' },
    { company_id: 'C', issue_date: '2026-06-01', gross_amount: 5_000, commission: 500, currency: 'SGD' },
    { company_id: 'D', issue_date: '2026-06-01', gross_amount: 2_000, commission: 300, currency: 'SGD' },
    { company_id: 'E', issue_date: '2026-06-01', gross_amount: 1_000, commission: 200, currency: 'SGD' },
    { company_id: 'F', issue_date: '2025-01-01', gross_amount: 9_000, commission: 900, currency: 'SGD' },
    { company_id: 'B', issue_date: '2026-06-01', gross_amount: 9_000, commission: 900, currency: 'USD' },
  ],
  claims: [{ company_id: 'A', amount_claimed: 30_000, amount_settled: 24_000 }, { company_id: 'A', amount_claimed: 5_000, amount_settled: null }],
  policies: [{ company_id: 'A', end_date: '2027-03-31', lifecycle: 'live' }, { company_id: 'A', end_date: '2026-01-31', lifecycle: 'expired' }],
  emails: [{ group_id: 'A', kind: 'email_out', occurred_at: '2026-09-13T00:00:00Z' }, { group_id: 'A', kind: 'email_in', occurred_at: '2026-10-01T00:00:00Z' }, { group_id: 'B', kind: 'email_out', occurred_at: '2026-10-01T00:00:00Z' }],
  requests: [{ company_id: 'A2', owner_party: 'trs', what: 'Process endorsement for new joiner', since_at: '2026-10-13T00:00:00Z' }, { company_id: 'A', owner_party: 'insurer', what: 'Claims payment summary for Tan', since_at: '2026-10-20T00:00:00Z' }],
  ...over,
})

describe('client portfolio', () => {
  it('ranks businesses by commission, a group counted once; the top 20% and their share', () => {
    const p = buildPortfolio(base())
    expect(p.rows.map(r => r.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(p.rows[0]).toMatchObject({ commission: 18_000, premium: 120_000, top: true, rank: 1, sent: 1, received: 1, requests: 2, trsOwed: 1 })
    expect(p.summary).toMatchObject({ businesses: 5, topCount: 1, usd: { notes: 1, commission: 900 } })
    expect(p.summary.topShare).toBeCloseTo(18_000 / 20_000)
    expect(p.rows[0].byType.Claims).toBe(1)
    expect(p.rows[0].byType['Members and endorsements']).toBe(1)
  })
  it('loss ratio is claims paid over premium, only when a claim carries an amount; next renewal is the next live end date', () => {
    const a = buildPortfolio(base()).rows[0]
    expect(a.lossRatio).toBeCloseTo(24_000 / 120_000)
    expect(a.claimsWithAmount).toBe(1)
    expect(a.nextRenewal).toBe('2027-03-31')
    expect(buildPortfolio(base()).rows[1].lossRatio).toBeNull()
  })
  it('all time takes notes outside the last 12 months', () => {
    expect(buildPortfolio(base({ window: 'all' })).rows.map(r => r.id)).toContain('F')
  })
  it('reads a request into its type, claims ahead of billing', () => {
    expect(requestType('Provide claims payment summary or slip')).toBe('Claims')
    expect(requestType('Process new born dependent enrolment')).toBe('Members and endorsements')
    expect(requestType('Make payment for FlexCare policy premium')).toBe('Billing and payment')
    expect(requestType('Issue cover note for transit insurance')).toBe('Documents and certificates')
    expect(requestType('Quotation for Public Liability')).toBe('Quotations and renewals')
    expect(requestType('Call client back')).toBe('Other')
  })
})
