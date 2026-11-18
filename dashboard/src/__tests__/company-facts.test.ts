import { describe, it, expect } from 'vitest'
import { companyFacts } from '@/lib/companies/facts'

const p = (o: Partial<Parameters<typeof companyFacts>[0][number]>) => ({ label: 'WICA', product_line: 'wica', lifecycle: 'live', start_date: null, end_date: null, renewal_date: null, currency: 'SGD', premium: null, ...o })

describe('companyFacts', () => {
  it('counts held policies and sums SGD premium only', () => {
    const f = companyFacts([
      p({ premium: 19_600 }), p({ lifecycle: 'renewal_due', premium: 6_500 }), p({ lifecycle: 'bound', currency: 'USD', premium: 999 }),
      p({ lifecycle: 'lapsed', premium: 5_000 }), p({ lifecycle: 'quoting', premium: 1 }),
    ], '2026-11-19')
    expect(f.held).toBe(3)
    expect(f.annualPremium).toBe(26_100)
  })

  it('has no premium when none is known', () => {
    expect(companyFacts([p({})], '2026-11-19').annualPremium).toBeNull()
  })

  it('takes the earliest start as client since', () => {
    expect(companyFacts([p({ start_date: '2024-03-01' }), p({ lifecycle: 'lapsed', start_date: '2023-01-15' })], '2026-11-19').clientSince).toBe('2023-01-15')
  })

  it('lists held renewals within 60 days, soonest first, renewal date before end date', () => {
    const f = companyFacts([
      p({ label: 'PL', end_date: '2026-12-31' }),
      p({ label: 'WICA', end_date: '2027-01-31', renewal_date: '2026-12-01' }),
      p({ label: 'EB', end_date: '2027-04-01' }),
      p({ label: 'Old', lifecycle: 'lapsed', end_date: '2026-12-01' }),
      p({ label: 'Past', end_date: '2026-11-01' }),
    ], '2026-11-19')
    expect(f.renewals).toEqual([{ label: 'WICA', date: '2026-12-01', days: 12 }, { label: 'PL', date: '2026-12-31', days: 42 }])
  })
})
