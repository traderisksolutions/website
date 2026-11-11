import { describe, expect, it } from 'vitest'
import { PACKAGES, packageCovers, rungForCurrent, suggestedRung } from '@/lib/gb/packages'

describe('package ladder', () => {
  it('five rungs, each with five facts a client reads', () => {
    expect(PACKAGES.map(p => p.key)).toEqual(['essential', 'standard', 'enhanced', 'executive', 'premier'])
    for (const p of PACKAGES) expect(p.facts).toHaveLength(5)
  })
  it('climbs: ward, major medical, riders and life never step down', () => {
    const order = { G4: 0, G1: 1, P4: 2, P2: 3, P1: 4 }
    for (let i = 1; i < PACKAGES.length; i++) {
      const a = PACKAGES[i - 1].requirement, b = PACKAGES[i].requirement
      expect(order[b.ward!]).toBeGreaterThanOrEqual(order[a.ward!])
      expect(b.gtl!).toBeGreaterThanOrEqual(a.gtl!)
    }
  })
  it('turns into the covers the engine prices', () => {
    const c = packageCovers(PACKAGES[1])
    expect(c.map(x => x.code)).toEqual(['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GTL'])
    expect(c[0]).toMatchObject({ hospital: 'private', ward: 4, coPay: false, tier: 'entry' })
    expect(packageCovers(PACKAGES[0])[0]).toMatchObject({ hospital: 'government', ward: 4 })
    expect(packageCovers(PACKAGES[4]).find(x => x.code === 'GTL')).toMatchObject({ sumAssured: 300_000 })
  })
  it('finds the rung a current plan sits on', () => {
    expect(rungForCurrent({ ward: 'P2', wardLevel: 'entry' })).toBe('enhanced')
    expect(rungForCurrent({ ward: 'P1', wardLevel: 'top' })).toBe('premier')
    expect(rungForCurrent({ ward: 'G1' })).toBe('essential')
    expect(rungForCurrent(null)).toBeNull()
  })
  it('suggests the current rung at a renewal, Standard otherwise', () => {
    expect(suggestedRung('renewal', { ward: 'P1', wardLevel: 'entry' }).key).toBe('executive')
    expect(suggestedRung('renewal', null).key).toBe('standard')
    expect(suggestedRung('new_business', { ward: 'P1' }).key).toBe('standard')
  })
})
