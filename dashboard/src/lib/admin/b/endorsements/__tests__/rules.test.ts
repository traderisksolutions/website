import { describe, it, expect } from 'vitest'
import { batchWindow, batchDue, canMove, countOf, estimateTotal, batchTitle, noteDecision, lineFor, movementTypeFor, chaseDue, gstRateFor, noteTitle } from '../rules'

describe('batch windows', () => {
  it('a weekly batch runs Monday to Sunday in Singapore time', () => {
    // Wed 4 Nov 2026 10:00 SGT = 02:00 UTC
    expect(batchWindow('weekly', new Date('2026-11-04T02:00:00Z'))).toEqual({ window_start: '2026-11-02', window_end: '2026-11-08' })
    // Sun 8 Nov 2026 23:30 SGT is still that week; Mon 9 Nov 00:30 SGT is the next
    expect(batchWindow('weekly', new Date('2026-11-08T15:30:00Z')).window_start).toBe('2026-11-02')
    expect(batchWindow('weekly', new Date('2026-11-08T16:30:00Z')).window_start).toBe('2026-11-09')
  })
  it('a daily or immediate batch is the day itself', () => {
    expect(batchWindow('daily', new Date('2026-11-04T02:00:00Z'))).toEqual({ window_start: '2026-11-04', window_end: '2026-11-04' })
    expect(batchWindow('immediate', new Date('2026-11-04T20:00:00Z'))).toEqual({ window_start: '2026-11-05', window_end: '2026-11-05' })
  })
  it('closes after the window ends and 09:00 SGT has passed', () => {
    const b = { cadence: 'weekly' as const, window_end: '2026-11-08' }
    expect(batchDue(b, new Date('2026-11-08T23:00:00Z'))).toBe(false)   // Mon 07:00 SGT
    expect(batchDue(b, new Date('2026-11-09T01:00:00Z'))).toBe(true)    // Mon 09:00 SGT
    expect(batchDue({ cadence: 'immediate', window_end: '2026-11-09' }, new Date('2026-11-09T00:00:00Z'))).toBe(true)
  })
})

describe('state machine', () => {
  it('moves forward only', () => {
    expect(canMove('open', 'ready')).toBe(true)
    expect(canMove('ready', 'sent')).toBe(true)
    expect(canMove('sent', 'noted')).toBe(true)
    expect(canMove('noted', 'billed')).toBe(true)
    expect(canMove('billed', 'settled')).toBe(true)
    expect(canMove('sent', 'open')).toBe(false)
    expect(canMove('settled', 'billed')).toBe(false)
    expect(canMove('ready', 'open')).toBe(true)     // a person unapproves
  })
})

describe('counts, estimates and titles', () => {
  const ms = [{ kind: 'join', estimate_amount: 100.5 }, { kind: 'leave', estimate_amount: -40.25 }, { kind: 'change', estimate_amount: null }]
  it('counts and sums only priced movements', () => {
    expect(countOf(ms)).toEqual({ joins: 1, leaves: 1, changes: 1 })
    expect(estimateTotal(ms)).toBe(60.25)
    expect(estimateTotal([{ kind: 'join', estimate_amount: null }])).toBeNull()
    expect(estimateTotal([])).toBeNull()
  })
  it('names the batch item', () => {
    expect(batchTitle({ joins: 2, leaves: 1, changes: 0 }, 312.4, 'QBE', 'N0000001', 'member')).toBe('Approve batch: 2 joins, 1 leave, est. S$312.40 · QBE N0000001')
    expect(batchTitle({ joins: 1, leaves: 0, changes: 0 }, null, null, null, 'vehicle')).toBe('Approve batch: 1 vehicle added')
    expect(noteTitle('credit', -125.96, 'CN123', 'Great Eastern')).toBe('Approve credit note to client: S$125.96 for Great Eastern CN123')
  })
})

describe('insurer note decision', () => {
  it('bills within tolerance and asks otherwise', () => {
    expect(noteDecision({ variance: 1.2, withinTolerance: true, needsReview: false, matched: 1 })).toEqual({ bill: true, question: null })
    expect(noteDecision({ variance: 80, withinTolerance: false, needsReview: false, matched: 1 }).bill).toBe(false)
    expect(noteDecision({ variance: null, withinTolerance: null, needsReview: true, matched: 1 }).question).toMatch(/could not be read/)
    expect(noteDecision({ variance: null, withinTolerance: null, needsReview: false, matched: 0 }).question).toMatch(/does not name a movement/)
    // No estimate at all (first movement on a new policy): nothing to compare, so bill.
    expect(noteDecision({ variance: null, withinTolerance: null, needsReview: false, matched: 1 }).bill).toBe(true)
  })
})

describe('lines and types', () => {
  it('reads the line from the class wording when the slug is missing', () => {
    expect(lineFor({ product_line: null, class_of_insurance: 'Foreign Worker Medical (FWMI)' })).toBe('foreign_worker_medical')
    expect(lineFor({ product_line: null, class_of_insurance: 'Group Personal Accident' })).toBe('employee_benefits')
    expect(lineFor({ product_line: null, class_of_insurance: 'Office Standard Plan - GE BIZSupreme' })).toBe('iar_fire')
    expect(lineFor({ product_line: 'wica', class_of_insurance: null })).toBe('wica')
    expect(lineFor({ product_line: null, class_of_insurance: null })).toBeNull()
  })
  it('maps lines to movement types', () => {
    expect(movementTypeFor('employee_benefits')).toBe('member')
    expect(movementTypeFor('commercial_vehicle')).toBe('vehicle')
    expect(movementTypeFor('iar_fire')).toBe('other')
    expect(gstRateFor('employee_benefits', 'Group Term Life')).toBe(0)
    expect(gstRateFor('employee_benefits', 'GHS')).toBe(0.09)
  })
})

describe('chasing', () => {
  it('chases a sent batch a week after sending, up to three times', () => {
    const sent = '2026-11-02T01:00:00Z'
    expect(chaseDue({ status: 'sent', sent_at: sent, next_chase_at: null, chase_count: 0 }, new Date('2026-11-08T00:00:00Z'))).toBe(false)
    expect(chaseDue({ status: 'sent', sent_at: sent, next_chase_at: null, chase_count: 0 }, new Date('2026-11-09T02:00:00Z'))).toBe(true)
    expect(chaseDue({ status: 'sent', sent_at: sent, next_chase_at: '2026-11-20T00:00:00Z', chase_count: 1 }, new Date('2026-11-15T00:00:00Z'))).toBe(false)
    expect(chaseDue({ status: 'sent', sent_at: sent, next_chase_at: null, chase_count: 3 }, new Date('2026-12-01T00:00:00Z'))).toBe(false)
    expect(chaseDue({ status: 'noted', sent_at: sent, next_chase_at: null, chase_count: 0 }, new Date('2026-12-01T00:00:00Z'))).toBe(false)
  })
})
