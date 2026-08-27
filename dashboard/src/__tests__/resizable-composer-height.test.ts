import { describe, it, expect, beforeEach } from 'vitest'
import { clampComposerHeight, COMPOSER_MIN, COMPOSER_MAX, COMPOSER_DEFAULT } from '@/hooks/useResizableComposerHeight'

describe('clampComposerHeight', () => {
  it('passes through values already inside [min, max]', () => {
    expect(clampComposerHeight(COMPOSER_DEFAULT)).toBe(COMPOSER_DEFAULT)
    expect(clampComposerHeight(COMPOSER_MIN)).toBe(COMPOSER_MIN)
    expect(clampComposerHeight(COMPOSER_MAX)).toBe(COMPOSER_MAX)
  })

  it('clamps below the minimum', () => {
    expect(clampComposerHeight(0)).toBe(COMPOSER_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampComposerHeight(9999)).toBe(COMPOSER_MAX)
  })
})

describe('localStorage persistence round-trip', () => {
  const KEY = 'engagement_composer_height'

  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and clamps a round-tripped height the same way the hook does', () => {
    localStorage.setItem(KEY, '50')
    const stored = Number(localStorage.getItem(KEY))
    expect(clampComposerHeight(stored)).toBe(COMPOSER_MIN)
  })
})
