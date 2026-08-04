import { describe, it, expect } from 'vitest'
import { debitNoteNumberBase, pickFreeDebitNoteNumber } from '@/lib/debit-note-commit'

describe('debitNoteNumberBase', () => {
  it('formats as "DN " + 2-digit year/month/day', () => {
    expect(debitNoteNumberBase('2026-06-02')).toBe('DN 260602')
  })

  it('pads single-digit month/day', () => {
    expect(debitNoteNumberBase('2026-01-05')).toBe('DN 260105')
  })
})

describe('pickFreeDebitNoteNumber', () => {
  it('returns the base number when nothing else was issued that day', () => {
    expect(pickFreeDebitNoteNumber('DN 260602', [])).toBe('DN 260602')
    expect(pickFreeDebitNoteNumber('DN 260602', ['DN 260601'])).toBe('DN 260602')
  })

  it('appends -2 on the first same-day collision', () => {
    expect(pickFreeDebitNoteNumber('DN 260602', ['DN 260602'])).toBe('DN 260602-2')
  })

  it('keeps incrementing past existing suffixes', () => {
    expect(pickFreeDebitNoteNumber('DN 260602', ['DN 260602', 'DN 260602-2', 'DN 260602-3'])).toBe('DN 260602-4')
  })

  it('does not get confused by a gap in the suffix sequence', () => {
    expect(pickFreeDebitNoteNumber('DN 260602', ['DN 260602', 'DN 260602-3'])).toBe('DN 260602-2')
  })
})
