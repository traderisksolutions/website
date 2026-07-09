import { describe, it, expect } from 'vitest'
import { verifyFigure, numTokens } from '@/lib/rfq-quote-verify'

// The anti-hallucination failsafe (#1): a figure is only "verified" if it appears
// verbatim in the insurer source, inside its cited excerpt, and the second model
// agrees. The headline case: 254,000 must NOT pass as 245,000.

describe('numTokens', () => {
  it('normalises commas and decimal variants', () => {
    const t = numTokens('Premium SGD 254,000.00 per annum')
    expect(t.has('254000.00')).toBe(true)
    expect(t.has('254000')).toBe(true)
  })
})

describe('verifyFigure — the 254,000 vs 245,000 guard', () => {
  const source = 'We are pleased to quote a premium of SGD 254,000.00 per annum, excess SGD 35,000.'

  it('verifies a correct figure present in source, excerpt and consensus', () => {
    const r = verifyFigure('Premium', 'SGD 254,000.00', 'premium of SGD 254,000.00 per annum', source, 'SGD 254,000')
    expect(r.status).toBe('verified')
    expect(r.reasons).toHaveLength(0)
  })

  it('FLAGS a transposed figure (245,000) not present in source', () => {
    const r = verifyFigure('Premium', 'SGD 245,000.00', 'premium of SGD 254,000.00 per annum', source, 'SGD 254,000')
    expect(r.status).toBe('review')
    expect(r.reasons.join(' ')).toMatch(/not found verbatim/i)
    // and the excerpt doesn't contain 245,000 either
    expect(r.reasons.join(' ')).toMatch(/cited excerpt/i)
  })

  it('flags when the value is absent from its own cited excerpt', () => {
    const r = verifyFigure('Excess', 'SGD 35,000', 'premium of SGD 254,000.00', source, 'SGD 35,000')
    // 35,000 IS in source but NOT in the (wrong) excerpt
    expect(r.status).toBe('review')
    expect(r.reasons.join(' ')).toMatch(/cited excerpt/i)
  })

  it('flags when the second model disagrees on the number', () => {
    const r = verifyFigure('Premium', 'SGD 254,000.00', 'premium of SGD 254,000.00 per annum', source, 'SGD 250,000')
    expect(r.status).toBe('review')
    expect(r.reasons.join(' ')).toMatch(/second model/i)
  })

  it('flags when no source text is available', () => {
    const r = verifyFigure('Premium', 'SGD 254,000', 'premium of SGD 254,000', '', null)
    expect(r.status).toBe('review')
    expect(r.reasons.join(' ')).toMatch(/unavailable/i)
  })

  it('treats a null value as empty (nothing to verify)', () => {
    const r = verifyFigure('Excess', null, null, source, null)
    expect(r.status).toBe('empty')
  })
})
