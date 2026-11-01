import { describe, it, expect } from 'vitest'
import { groupOf, isLater, laterFor, bridgeOf, type GroupInput } from './rules'

const now = new Date('2026-11-02T02:00:00Z') // Mon 2 Nov 10:00 SGT
const base: GroupInput = { status: 'trs_to_act', needs_human: null, has_draft: false, last_activity_at: '2026-11-01T02:00:00Z', later_until: null, later_when: null, seen_at: null }

describe('groupOf', () => {
  it('puts a decision above a draft', () => expect(groupOf({ ...base, needs_human: 'Choose the policy', has_draft: true }, now)).toBe('decide'))
  it('puts a draft in send', () => expect(groupOf({ ...base, has_draft: true }, now)).toBe('send'))
  it('puts TRS work with no draft in act', () => expect(groupOf(base, now)).toBe('act'))
  it('shows a waiting case with unseen new mail as read', () => expect(groupOf({ ...base, status: 'waiting_insurer' }, now)).toBe('read'))
  it('drops a waiting case once seen', () => expect(groupOf({ ...base, status: 'waiting_insurer', seen_at: '2026-11-01T05:00:00Z' }, now)).toBe('none'))
  it('drops a waiting case with old mail', () => expect(groupOf({ ...base, status: 'waiting_client', last_activity_at: '2026-10-01T00:00:00Z' }, now)).toBe('none'))
  it('holds a later item off the list', () => expect(groupOf({ ...base, has_draft: true, later_until: '2026-11-02T06:00:00Z' }, now)).toBe('later'))
  it('drops done items', () => expect(groupOf({ ...base, status: 'done', has_draft: true }, now)).toBe('none'))
})

describe('isLater', () => {
  it('ends at the set time', () => expect(isLater({ later_until: '2026-11-02T01:00:00Z', later_when: null, last_activity_at: null }, now)).toBe(false))
  it('waits for a reply', () => expect(isLater({ later_until: '2026-11-01T03:00:00Z', later_when: 'client_reply', last_activity_at: '2026-11-01T02:00:00Z' }, now)).toBe(true))
  it('ends when newer mail arrives', () => expect(isLater({ later_until: '2026-11-01T03:00:00Z', later_when: 'client_reply', last_activity_at: '2026-11-01T09:00:00Z' }, now)).toBe(false))
})

describe('laterFor', () => {
  it('this afternoon is 14:00 SGT before 2pm', () => expect(laterFor('afternoon', now).later_until).toBe('2026-11-02T06:00:00.000Z'))
  it('this afternoon after 2pm is three hours on', () => expect(laterFor('afternoon', new Date('2026-11-02T08:00:00Z')).later_until).toBe('2026-11-02T11:00:00.000Z'))
  it('tomorrow is 09:00 SGT', () => expect(laterFor('tomorrow', now).later_until).toBe('2026-11-03T01:00:00.000Z'))
  it('Monday from a Monday is next week', () => expect(laterFor('monday', now).later_until).toBe('2026-11-09T01:00:00.000Z'))
  it('Monday from a Friday', () => expect(laterFor('monday', new Date('2026-11-06T02:00:00Z')).later_until).toBe('2026-11-09T01:00:00.000Z'))
  it('reply waits keep the set time', () => expect(laterFor('insurer_reply', now)).toEqual({ later_until: now.toISOString(), later_when: 'insurer_reply' }))
})

describe('bridgeOf', () => {
  it('maps case types to bridges', () => {
    expect(bridgeOf('renewal')).toBe('rfq')
    expect(bridgeOf('claim')).toBe('claims')
    expect(bridgeOf('member_movement')).toBe('endorsements')
    expect(bridgeOf('enquiry')).toBe('other')
  })
})
