import { describe, expect, it } from 'vitest'
import { barLabel, forecast, monthName, monthsFrom, pct, type ForecastItem } from '../forecast'

const item = (o: Partial<ForecastItem>): ForecastItem => ({ expiry: '2026-12-10', premium: 1000, commission: 100, outcome: null, line_code: 'wica', owner: 'a@x.sg', ...o })

describe('monthsFrom', () => {
  it('runs 12 months from the current one, across the year end', () => {
    const m = monthsFrom('2026-11-20')
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2026-11')
    expect(m[2]).toBe('2027-01')
    expect(m[11]).toBe('2027-10')
  })
})

describe('forecast', () => {
  const T = '2026-11-20'
  it('sums due, won, open and lost per month; items outside the 12 months are left out', () => {
    const f = forecast([
      item({}), item({ premium: 500.25, commission: 50.1, outcome: 'renewed' }), item({ premium: null, commission: null, outcome: 'lost' }),
      item({ expiry: '2027-10-31' }), item({ expiry: '2027-11-01' }), item({ expiry: '2026-10-31' }),
    ], T)
    const dec = f.months[1]
    expect(dec.due).toEqual({ count: 3, premium: 1500.25, commission: 150.1 })
    expect(dec.won).toEqual({ count: 1, premium: 500.25, commission: 50.1 })
    expect(dec.lost).toEqual({ count: 1, premium: 0, commission: 0 })
    expect(dec.open).toEqual({ count: 1, premium: 1000, commission: 100 })
    expect(f.months[11].due.count).toBe(1)
    expect(f.total.due.count).toBe(4)
    expect(f.total.due.premium).toBe(2500.25)
  })
  it('gross retention = renewed premium ÷ due premium, only for a month with nothing open', () => {
    const f = forecast([
      item({ outcome: 'renewed', premium: 900 }), item({ outcome: 'lost', premium: 100 }),
      item({ expiry: '2027-01-05', outcome: 'renewed', premium: 300 }), item({ expiry: '2027-01-06', premium: 700 }),
      item({ expiry: '2027-02-05', outcome: 'renewed', premium: 400 }), item({ expiry: '2027-02-06', outcome: 'lost', premium: 600 }),
    ], T)
    expect(f.months[0].retention).toBeNull()
    expect(f.months[0].closed).toBe(false)
    expect(f.months[1]).toMatchObject({ closed: true, retention: 0.9 })
    expect(f.months[2]).toMatchObject({ closed: false, retention: null })
    expect(f.months[3]).toMatchObject({ closed: true, retention: 0.4 })
    expect(f.total.retention).toBe(0.65)
  })
  it('a closed month with no premium has no retention', () => {
    expect(forecast([item({ outcome: 'renewed', premium: null })], T).months[1]).toMatchObject({ closed: true, retention: null })
  })
  it('filters by line and owner, with none for records without', () => {
    const items = [item({}), item({ line_code: 'eb', owner: 'b@x.sg' }), item({ line_code: null, owner: null })]
    expect(forecast(items, T, { line: 'eb' }).total.due.count).toBe(1)
    expect(forecast(items, T, { line: 'none' }).total.due.count).toBe(1)
    expect(forecast(items, T, { owner: 'A@X.sg' }).total.due.count).toBe(1)
    expect(forecast(items, T, { owner: 'none' }).total.due.count).toBe(1)
    expect(forecast(items, T, {}).total.due.count).toBe(3)
  })
})

describe('labels', () => {
  it('names months and bars', () => {
    expect(monthName('2027-05')).toBe('May 2027')
    expect(monthName('2027-05', true)).toBe('May 27')
    expect(barLabel(155_415)).toBe('155k')
    expect(barLabel(8029)).toBe('8.0k')
    expect(barLabel(97)).toBe('97')
    expect(pct(0.912)).toBe('91.2%')
    expect(pct(null)).toBe('—')
  })
})
