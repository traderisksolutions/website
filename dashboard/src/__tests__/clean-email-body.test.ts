import { describe, it, expect } from 'vitest'
import { cleanEmailBody } from '@/lib/clean-email-body'

describe('cleanEmailBody', () => {
  it('re-joins orphaned numbered list markers', () => {
    expect(cleanEmailBody('1.\nCAR\n2.\nWC')).toBe('1. CAR\n2. WC')
  })

  it('re-joins bullet + lettered markers', () => {
    expect(cleanEmailBody('*\nPiling\n-\nScope\na)\nDetail')).toBe('* Piling\n- Scope\na) Detail')
  })

  it('collapses 3+ blank lines to a single blank line', () => {
    expect(cleanEmailBody('Para one\n\n\n\nPara two')).toBe('Para one\n\nPara two')
  })

  it('trims trailing whitespace and leading/trailing blank lines', () => {
    expect(cleanEmailBody('\n\nHello   \nworld\n\n')).toBe('Hello\nworld')
  })

  it('preserves intentional single paragraph breaks (no unwrapping)', () => {
    expect(cleanEmailBody('Dear Nathan\n\nWe refer to the above.')).toBe('Dear Nathan\n\nWe refer to the above.')
  })

  it('handles empty/null safely', () => {
    expect(cleanEmailBody(null)).toBe('')
    expect(cleanEmailBody('')).toBe('')
  })
})
