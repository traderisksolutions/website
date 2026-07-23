import { describe, it, expect } from 'vitest'
import { reconcile, sameRate } from '@/lib/pm-pricing'
import type { Pricing } from '@/lib/pm-pricing'

const mk = (rates: Record<string, number | string>): Pricing => ({
  coverages: [{
    code: 'GHS', full_name: 'Group Hospital & Surgical', derivation: '',
    plans: [{ code: 'Plan 1', label: 'Plan 1' }, { code: 'Plan 2', label: 'Plan 2' }],
    age_bands: ['0-25', '26-30'],
    rates: [
      { band: '0-25', by_plan: { 'Plan 1': rates.a, 'Plan 2': rates.b } },
      { band: '26-30', by_plan: { 'Plan 1': rates.c, 'Plan 2': rates.d } },
    ],
  }],
})

describe('sameRate', () => {
  it('treats 413 and 413.00 as equal, 413 vs 431 as different', () => {
    expect(sameRate(413, 413.0)).toBe(true)
    expect(sameRate(413, '413.00')).toBe(true)
    expect(sameRate(413, 431)).toBe(false)
    expect(sameRate('N/A', 'N/A')).toBe(true)
    expect(sameRate('N/A', 244)).toBe(false)
  })
})

describe('reconcile', () => {
  it('agrees on identical rates', () => {
    const r = reconcile(mk({ a: 413, b: 358, c: 448, d: 388 }), mk({ a: 413, b: 358, c: 448, d: 388 }))
    expect(r).toMatchObject({ total: 4, agreed: 4, single_source: 0 })
    expect(r.conflicts).toHaveLength(0)
  })

  it('flags a dollar mismatch (413 vs 431) with both values for the judge', () => {
    const r = reconcile(mk({ a: 413, b: 358, c: 448, d: 388 }), mk({ a: 431, b: 358, c: 448, d: 388 }))
    expect(r.agreed).toBe(3)
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({ plan: 'Plan 1', band: '0-25', opus: 413, gemini: 431 })
  })

  it('counts rates only one model found as single_source (no false conflict)', () => {
    const gemini = mk({ a: 413, b: 358, c: 448, d: 388 })
    gemini.coverages[0].rates.pop() // gemini missing the 26-30 band
    const r = reconcile(mk({ a: 413, b: 358, c: 448, d: 388 }), gemini)
    expect(r).toMatchObject({ total: 4, agreed: 2, single_source: 2 })
    expect(r.conflicts).toHaveLength(0)
  })

  it('matches across cosmetic band/label differences (0-25 vs "0 – 25")', () => {
    const g = mk({ a: 413, b: 358, c: 448, d: 388 })
    g.coverages[0].rates[0].band = '0 – 25' // en-dash + spaces
    const r = reconcile(mk({ a: 413, b: 358, c: 448, d: 388 }), g)
    expect(r.agreed).toBe(4)
    expect(r.conflicts).toHaveLength(0)
  })

  it('matches on the coverage CODE even when the two models spell the full name differently', () => {
    const opus = mk({ a: 413, b: 358, c: 448, d: 388 })
    const gem = mk({ a: 413, b: 358, c: 448, d: 388 })
    gem.coverages[0].full_name = 'Hospital & Surgical (Grp)' // different name, same code GHS
    const r = reconcile(opus, gem)
    expect(r).toMatchObject({ agreed: 4, single_source: 0 })
  })
})
