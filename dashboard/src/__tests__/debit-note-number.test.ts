import { describe, it, expect } from 'vitest'
import { debitNoteNumberBase, pickFreeDebitNoteNumber } from '@/lib/debit-note-commit'

describe('debitNoteNumberBase', () => {
  it('formats as DN + 2-digit year/month/day', () => {
    expect(debitNoteNumberBase('2026-06-02')).toBe('DN260602')
  })

  it('pads single-digit month/day', () => {
    expect(debitNoteNumberBase('2026-01-05')).toBe('DN260105')
  })
})

describe('pickFreeDebitNoteNumber', () => {
  it('returns the base number when nothing else was issued that day', () => {
    expect(pickFreeDebitNoteNumber('DN260602', [])).toBe('DN260602')
    expect(pickFreeDebitNoteNumber('DN260602', ['DN260601'])).toBe('DN260602')
  })

  it('appends -2 on the first same-day collision', () => {
    expect(pickFreeDebitNoteNumber('DN260602', ['DN260602'])).toBe('DN260602-2')
  })

  it('keeps incrementing past existing suffixes', () => {
    expect(pickFreeDebitNoteNumber('DN260602', ['DN260602', 'DN260602-2', 'DN260602-3'])).toBe('DN260602-4')
  })

  it('does not get confused by a gap in the suffix sequence', () => {
    expect(pickFreeDebitNoteNumber('DN260602', ['DN260602', 'DN260602-3'])).toBe('DN260602-2')
  })
})
