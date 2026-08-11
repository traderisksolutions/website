import { describe, it, expect } from 'vitest'
import { wordJaccard } from '@/lib/ai-learning-loop'

describe('wordJaccard', () => {
  it('returns 1 for identical text', () => {
    expect(wordJaccard('Thanks for reaching out, we will revert soon.', 'Thanks for reaching out, we will revert soon.')).toBe(1)
  })

  it('returns 1 when both strings are empty', () => {
    expect(wordJaccard('', '')).toBe(1)
  })

  it('is robust to word reordering (unlike a positional diff)', () => {
    const a = 'the quick brown fox jumps over the lazy dog'
    const b = 'the lazy dog jumps over the quick brown fox'
    expect(wordJaccard(a, b)).toBe(1)
  })

  it('drops sharply for substantively different text', () => {
    const a = 'We will send the pricing by end of day tomorrow.'
    const b = 'Unfortunately your claim has been declined due to policy exclusions.'
    expect(wordJaccard(a, b)).toBeLessThan(0.3)
  })

  it('is case-insensitive and ignores punctuation', () => {
    expect(wordJaccard('Hello, World!', 'hello world')).toBe(1)
  })
})
