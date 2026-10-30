import { describe, expect, it } from 'vitest'
import { parsePct, rateCheck, roleOf } from '@/lib/placement/figures'

describe('parsePct', () => {
  it('reads the first percentage', () => {
    expect(parsePct('0.0575%')).toBe(0.0575)
    expect(parsePct('72.50% of 100%')).toBe(72.5)
    expect(parsePct('Brokerage: 12.5%')).toBe(12.5)
    expect(parsePct(null)).toBeNull()
  })
})

describe('rateCheck — Dover Drive', () => {
  it('passes the premium that is rate × base', () => {
    expect(rateCheck({ ratePct: 0.0575, base: 288_464_104.8, premium: 165_866 }).check).toBe('ok')
  })
  it('flags the premium computed on a sum insured S$10M short', () => {
    const r = rateCheck({ ratePct: 0.0575, base: 298_464_104.8, premium: 165_866 })
    expect(r.check).toBe('mismatch')
    expect(r.expected).toBeCloseTo(171_616.86, 1)
  })
  it('cannot check without all three figures', () => {
    expect(rateCheck({ ratePct: 0.06, base: null, premium: 1 }).check).toBeNull()
  })
})

describe('roleOf', () => {
  it('tells lead from follow', () => {
    expect(roleOf('Lead 30% of 100%')).toBe('lead')
    expect(roleOf('35% co-share subject to lead terms')).toBe('follow')
    expect(roleOf('CO or RI share up to 25%')).toBe('follow')
    expect(roleOf('CAR rate 0.06%')).toBeNull()
  })
})
