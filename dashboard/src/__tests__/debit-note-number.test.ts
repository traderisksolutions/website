import { describe, it, expect } from 'vitest'
import { debitNoteMonthPrefix, nextSequenceNumber } from '@/lib/debit-note-commit'

describe('debitNoteMonthPrefix', () => {
  it('is year and month, never the day', () => {
    expect(debitNoteMonthPrefix('2026-06-02')).toBe('DN2606')
    expect(debitNoteMonthPrefix('2026-06-30')).toBe('DN2606')
    expect(debitNoteMonthPrefix('2026-01-05')).toBe('DN2601')
  })
})

describe('nextSequenceNumber', () => {
  it('starts a month at 01', () => {
    expect(nextSequenceNumber('DN2606', [])).toBe('DN260601')
  })

  it('continues the running sequence', () => {
    expect(nextSequenceNumber('DN2606', ['DN260601', 'DN260602'])).toBe('DN260603')
  })

  it('fills a gap left by a voided note rather than leaving a hole', () => {
    expect(nextSequenceNumber('DN2606', ['DN260601', 'DN260603'])).toBe('DN260602')
  })

  it('ignores other months entirely', () => {
    expect(nextSequenceNumber('DN2606', ['DN260501', 'DN260715'])).toBe('DN260601')
  })

  it('grows past 99, which August 2025 would have needed at 38 notes', () => {
    const many = Array.from({ length: 99 }, (_, i) => `DN2606${String(i + 1).padStart(2, '0')}`)
    expect(nextSequenceNumber('DN2606', many)).toBe('DN2606100')
  })

  it('is not confused by spacing or case in stored numbers', () => {
    expect(nextSequenceNumber('DN2606', ['DN 260601', 'dn260602'])).toBe('DN260603')
  })

  it('never reuses a number already issued that month', () => {
    // the bug this replaces: a number built from the day could already belong to another client
    const issued = ['DN260601', 'DN260602', 'DN260603', 'DN260604', 'DN260609']
    const next = nextSequenceNumber('DN2606', issued)
    expect(issued).not.toContain(next)
    expect(next).toBe('DN260605')
  })
})
