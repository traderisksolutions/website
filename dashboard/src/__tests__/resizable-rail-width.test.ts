import { describe, it, expect, beforeEach } from 'vitest'
import { clampRailWidth, RAIL_MIN, RAIL_MAX, RAIL_DEFAULT } from '@/hooks/useResizableRailWidth'

describe('clampRailWidth', () => {
  it('passes through values already inside [min, max]', () => {
    expect(clampRailWidth(300)).toBe(300)
    expect(clampRailWidth(RAIL_MIN)).toBe(RAIL_MIN)
    expect(clampRailWidth(RAIL_MAX)).toBe(RAIL_MAX)
  })

  it('clamps below the minimum', () => {
    expect(clampRailWidth(100)).toBe(RAIL_MIN)
    expect(clampRailWidth(0)).toBe(RAIL_MIN)
    expect(clampRailWidth(-50)).toBe(RAIL_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampRailWidth(999)).toBe(RAIL_MAX)
  })

  it('rounds fractional pixel values', () => {
    expect(clampRailWidth(340.6)).toBe(341)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampRailWidth(NaN)).toBe(RAIL_DEFAULT)
    expect(clampRailWidth(Infinity)).toBe(RAIL_DEFAULT)
  })
})

describe('localStorage persistence round-trip', () => {
  const KEY = 'engagement_rail_width'

  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and clamps a round-tripped width the same way the hook does', () => {
    localStorage.setItem(KEY, '999')
    const stored = Number(localStorage.getItem(KEY))
    expect(clampRailWidth(stored)).toBe(RAIL_MAX)
  })

  it('a missing key is treated as unset (Number("") is 0, falsy)', () => {
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(Number(localStorage.getItem(KEY))).toBe(0)
  })
})
