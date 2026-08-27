import { describe, it, expect } from 'vitest'
import { clampDimension } from '@/hooks/useResizableDimension'

describe('clampDimension (shared engine behind both the rail-width and composer-height resize hooks)', () => {
  it('passes through values already inside the range', () => {
    expect(clampDimension(150, 100, 200)).toBe(150)
    expect(clampDimension(100, 100, 200)).toBe(100)
    expect(clampDimension(200, 100, 200)).toBe(200)
  })

  it('clamps below the minimum', () => {
    expect(clampDimension(0, 100, 200)).toBe(100)
    expect(clampDimension(-999, 100, 200)).toBe(100)
  })

  it('clamps above the maximum', () => {
    expect(clampDimension(9999, 100, 200)).toBe(200)
  })

  it('rounds fractional values', () => {
    expect(clampDimension(150.4, 100, 200)).toBe(150)
    expect(clampDimension(150.6, 100, 200)).toBe(151)
  })

  it('falls back to the minimum for non-finite input', () => {
    expect(clampDimension(NaN, 100, 200)).toBe(100)
    expect(clampDimension(Infinity, 100, 200)).toBe(100)
    expect(clampDimension(-Infinity, 100, 200)).toBe(100)
  })
})
