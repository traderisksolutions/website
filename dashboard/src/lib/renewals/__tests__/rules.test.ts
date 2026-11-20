import { describe, expect, it } from 'vitest'
import { bucketOf, checkChange, expiringFrom, opensOn, suggestEndDate, tasksFor, yearTerm, type NoteLike } from '../rules'

const note = (o: Partial<NoteLike> & { id: string }): NoteLike => ({ issue_date: '2026-01-01', event_type: 'new_business', gross_amount: 0, commission: 0, ...o })
const P = '11111111-1111-4111-8111-111111111111', Q = '22222222-2222-4222-8222-222222222222'

describe('opensOn', () => {
  it('opens 120 days before expiry, 180 for Employment Benefits', () => {
    expect(opensOn({ end_date: '2026-12-31', class_of_insurance: 'Public Liability' })).toBe('2026-09-02')
    expect(opensOn({ end_date: '2026-12-31', class_of_insurance: 'Group Hospital & Surgical Plan' })).toBe('2026-07-04')
    expect(opensOn({ end_date: '2026-12-31', class_of_insurance: 'Policy', is_eb: true })).toBe('2026-07-04')
    expect(opensOn({ end_date: '2026-12-31', class_of_insurance: 'Policy', line_code: 'eb' })).toBe('2026-07-04')
  })
  it('has no day without an end date', () => expect(opensOn({ end_date: null })).toBeNull())
})

describe('tasksFor', () => {
  it('sets tasks at 90, 60, 30 and 15 days before expiry', () => {
    expect(tasksFor('2027-01-31')).toEqual([
      { kind: '-90', due_on: '2026-11-02' }, { kind: '-60', due_on: '2026-12-02' },
      { kind: '-30', due_on: '2027-01-01' }, { kind: '-15', due_on: '2027-01-16' },
    ])
  })
})

describe('expiringFrom', () => {
  it('takes the latest placing note and ignores endorsements', () => {
    const e = expiringFrom([
      note({ id: 'a', issue_date: '2025-01-05', gross_amount: 900, commission: 90 }),
      note({ id: 'b', issue_date: '2026-01-05', event_type: 'renewal', gross_amount: '1000.50', commission: '100', currency: 'USD' }),
      note({ id: 'c', issue_date: '2026-03-01', event_type: 'endorsement', gross_amount: 50, commission: 5 }),
    ])
    expect(e).toEqual({ debit_note_id: 'b', issue_date: '2026-01-05', premium: 1000.5, commission: 100, currency: 'USD' })
  })
  it('nets a correction against its note', () => {
    const e = expiringFrom([note({ id: 'a', gross_amount: 1000, commission: 100 }), note({ id: 'x', event_type: 'endorsement', reverses_debit_note_id: 'a', gross_amount: -200, commission: -20 })])
    expect(e).toMatchObject({ debit_note_id: 'a', premium: 800, commission: 80, currency: 'SGD' })
  })
  it('skips a note reversed to nothing and uses the one before', () => {
    const e = expiringFrom([
      note({ id: 'old', issue_date: '2025-01-01', gross_amount: 700, commission: 70 }),
      note({ id: 'new', issue_date: '2026-01-01', gross_amount: 1000, commission: 100 }),
      note({ id: 'cn', issue_date: '2026-02-01', event_type: 'new_business', reverses_debit_note_id: 'new', gross_amount: -1000, commission: -100 }),
    ])
    expect(e).toMatchObject({ debit_note_id: 'old', premium: 700 })
  })
  it('answers nothing without a placing note', () => {
    expect(expiringFrom([])).toBeNull()
    expect(expiringFrom([note({ id: 'e', event_type: 'endorsement', gross_amount: 10 })])).toBeNull()
  })
})

describe('suggestEndDate', () => {
  it('runs one year less a day from the start', () => {
    expect(suggestEndDate({ start_date: '2026-01-01' }, [])).toEqual({ end_date: '2026-12-31', basis: 'start' })
    expect(yearTerm('2028-02-29')).toBe('2029-02-27')
  })
  it('falls back to the last placing note’s issue date', () => {
    expect(suggestEndDate({ start_date: null }, [note({ id: 'a', issue_date: '2025-06-10' }), note({ id: 'b', issue_date: '2026-06-10' }), note({ id: 'e', issue_date: '2026-09-01', event_type: 'endorsement' })]))
      .toEqual({ end_date: '2027-06-09', basis: 'debit_note' })
  })
  it('suggests nothing without either', () => expect(suggestEndDate({ start_date: null }, [])).toBeNull())
})

describe('bucketOf', () => {
  it.each([[-5, '0-30'], [30, '0-30'], [31, '31-60'], [90, '61-90'], [120, '91-120'], [121, '121+']] as const)('%i → %s', (d, b) => expect(bucketOf(d)).toBe(b))
})

describe('checkChange', () => {
  const open = { policy_id: P, stage: 'open', outcome: null }
  it('moves between open stages and sets the owner', () => {
    expect(checkChange(open, { stage: 'quotes_in', owner: ' Nathan@Trade-Risksol.com ' })).toEqual({ patch: { stage: 'quotes_in', owner: 'nathan@trade-risksol.com' } })
    expect(checkChange(open, { owner: '' })).toEqual({ patch: { owner: null } })
  })
  it('refuses an unknown stage, a closing stage without its outcome, and nothing', () => {
    expect(checkChange(open, { stage: 'done' })).toEqual({ error: 'Unknown stage.' })
    expect(checkChange(open, { stage: 'renewed' })).toEqual({ error: 'Link the new policy to close as Renewed.' })
    expect(checkChange(open, { stage: 'lost' })).toEqual({ error: 'Choose why the renewal was lost.' })
    expect(checkChange(open, {})).toEqual({ error: 'Nothing to change.' })
    expect(checkChange(open, { owner: 'nathan' })).toEqual({ error: 'Choose the owner by email.' })
  })
  it('closes as Renewed only with the new policy linked', () => {
    expect(checkChange(open, { outcome: 'renewed' })).toEqual({ error: 'Link the new policy to close as Renewed.' })
    expect(checkChange(open, { outcome: 'renewed', renewed_policy_id: P })).toEqual({ error: 'Link the new term, not the expiring policy.' })
    expect(checkChange(open, { outcome: 'renewed', renewed_policy_id: Q })).toEqual({ patch: { outcome: 'renewed', stage: 'renewed', renewed_policy_id: Q } })
  })
  it('closes as Lost only with a reason, and Other with a note', () => {
    expect(checkChange(open, { outcome: 'lost' })).toEqual({ error: 'Choose why the renewal was lost.' })
    expect(checkChange(open, { outcome: 'lost', loss_reason: 'other', loss_note: '  ' })).toEqual({ error: 'Add a note for Other.' })
    expect(checkChange(open, { outcome: 'lost', loss_reason: 'price' })).toEqual({ patch: { outcome: 'lost', stage: 'lost', loss_reason: 'price', loss_note: null } })
    expect(checkChange(open, { outcome: 'lost', loss_reason: 'other', loss_note: 'Moved  abroad' })).toMatchObject({ patch: { loss_note: 'Moved abroad' } })
    expect(checkChange(open, { outcome: 'won' })).toEqual({ error: 'Close as Renewed or Lost.' })
  })
  it('leaves a closed record as it is', () => {
    expect(checkChange({ policy_id: P, stage: 'lost', outcome: 'lost' }, { stage: 'open' })).toEqual({ error: 'This renewal is closed.' })
  })
})
