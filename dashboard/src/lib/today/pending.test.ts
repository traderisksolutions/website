import { describe, it, expect } from 'vitest'
import { pendingOf, sideOf, homeBridgeOf, lapsedPolicy, cardOrder, type PendingInput } from './pending'

const now = new Date('2026-11-02T01:00:00Z')
const base: PendingInput = {
  case_type: 'claim', status: 'trs_to_act', title: 'A claim', summary: null, next_action: null, needs_human: null,
  deadline: null, waiting_since: null, last_activity_at: '2026-11-01T00:00:00Z', has_draft: false, override: null, policies: [],
}

describe('pendingOf', () => {
  it('reads the case worker’s lapsed-cover phrases as red', () => {
    expect(pendingOf({ ...base, summary: 'Piling has run uninsured since 24 Sep.' }, now).level).toBe('red')
    expect(pendingOf({ ...base, needs_human: 'Chubb WIC and PL expired 15 Oct with no renewal instruction on record.' }, now).level).toBe('red')
    expect(pendingOf({ ...base, title: 'GPA policy expired, no renewal evidence' }, now).level).toBe('red')
    expect(pendingOf({ ...base, summary: 'The WICA policy lapsed on 31 Oct.' }, now).level).toBe('red')
  })
  it('does not read a lapsed quote or offer as lapsed cover', () => {
    expect(pendingOf({ ...base, title: 'Liberty quote for Rolls Royce - quote lapsed, re-quote needed' }, now).level).toBe('grey')
    expect(pendingOf({ ...base, summary: 'The offer lapsed; client to decide.' }, now).level).toBe('grey')
  })
  it('is red when a stalled renewal has an expired policy with no live successor', () => {
    const i: PendingInput = { ...base, case_type: 'renewal', status: 'stalled', policies: [{ class: 'WICA', end_date: '2026-10-15', lifecycle: 'live' }] }
    expect(pendingOf(i, now)).toMatchObject({ level: 'red' })
    const renewed: PendingInput = { ...i, policies: [...i.policies, { class: 'WICA', end_date: '2027-10-14', lifecycle: 'live' }] }
    expect(pendingOf(renewed, now).level).not.toBe('red')
  })
  it('a stalled quote goes red only when it names the expired class', () => {
    const expired = [{ class: 'Foreign Worker Medical', end_date: '2026-09-01', lifecycle: 'live' }]
    expect(pendingOf({ ...base, case_type: 'new_quote', status: 'stalled', title: 'Motor quote for a Rolls Royce', policies: expired }, now).level).toBe('grey')
    expect(pendingOf({ ...base, case_type: 'new_quote', status: 'stalled', title: 'Foreign Worker Medical re-quote', policies: expired }, now).level).toBe('red')
  })
  it('is amber for money owed more than 30 days', () => {
    expect(pendingOf({ ...base, case_type: 'premium_billing', status: 'waiting_insurer', waiting_since: '2026-08-12' }, now)).toMatchObject({ level: 'amber', reason: 'Money owed 82 days' })
    expect(pendingOf({ ...base, title: 'Great Eastern refund S$381.50', status: 'waiting_insurer', waiting_since: '2026-09-11' }, now).level).toBe('amber')
    expect(pendingOf({ ...base, case_type: 'premium_billing', status: 'waiting_client', waiting_since: '2026-10-25' }, now).level).toBe('grey')
  })
  it('is amber for a claim the insurer has sat on for more than 30 days', () => {
    expect(pendingOf({ ...base, status: 'waiting_insurer', waiting_since: '2026-09-20' }, now).level).toBe('amber')
    expect(pendingOf({ ...base, status: 'waiting_insurer', waiting_since: '2026-10-24' }, now).level).toBe('grey')
  })
  it('is amber inside 14 days of a deadline, and after it', () => {
    expect(pendingOf({ ...base, deadline: '2026-11-10' }, now)).toMatchObject({ level: 'amber', reason: 'Due in 8 days', due: '2026-11-10' })
    expect(pendingOf({ ...base, deadline: '2026-10-30' }, now).reason).toBe('Deadline passed 3 days ago')
    expect(pendingOf({ ...base, deadline: '2026-12-11' }, now).level).toBe('grey')
  })
  it('is green when a draft is ready and no decision blocks it', () => {
    expect(pendingOf({ ...base, has_draft: true }, now).level).toBe('green')
    expect(pendingOf({ ...base, has_draft: true, needs_human: 'Which policy responds?' }, now).level).toBe('grey')
  })
  it('red outranks amber and green', () => {
    expect(pendingOf({ ...base, summary: 'cover has expired', deadline: '2026-11-03', has_draft: true }, now).level).toBe('red')
  })
  it('an override wins', () => {
    expect(pendingOf({ ...base, summary: 'uninsured', override: { level: 'grey', reason: 'Cover confirmed by phone' } }, now)).toMatchObject({ level: 'grey', reason: 'Cover confirmed by phone' })
  })
  it('carries since and due as dates', () => {
    expect(pendingOf({ ...base, waiting_since: '2026-10-01', deadline: '2026-12-01' }, now)).toMatchObject({ since: '2026-10-01', due: '2026-12-01' })
    expect(pendingOf(base, now).since).toBe('2026-11-01')
  })
})

describe('lapsedPolicy', () => {
  it('ignores declined and closed policies', () => {
    expect(lapsedPolicy([{ class: 'PI', end_date: '2026-01-01', lifecycle: 'closed' }], now)).toBeNull()
  })
  it('matches class case-insensitively', () => {
    expect(lapsedPolicy([{ class: 'Wica', end_date: '2026-01-01', lifecycle: 'lapsed' }, { class: 'WICA', end_date: '2027-01-01', lifecycle: 'live' }], now)).toBeNull()
  })
})

describe('side and bridge', () => {
  it('maps status to the side that owes the move', () => {
    expect(sideOf('waiting_client')).toBe('client'); expect(sideOf('waiting_insurer')).toBe('insurer')
    expect(sideOf('trs_to_act')).toBe('trs'); expect(sideOf('stalled')).toBe('trs')
  })
  it('puts every case type on one of three bridges', () => {
    expect(homeBridgeOf('new_quote')).toBe('rfq'); expect(homeBridgeOf('renewal')).toBe('rfq'); expect(homeBridgeOf('documents')).toBe('rfq')
    expect(homeBridgeOf('enquiry')).toBe('rfq'); expect(homeBridgeOf('other')).toBe('rfq')
    expect(homeBridgeOf('claim')).toBe('claims')
    expect(homeBridgeOf('endorsement')).toBe('endorsements'); expect(homeBridgeOf('member_movement')).toBe('endorsements'); expect(homeBridgeOf('premium_billing')).toBe('endorsements')
  })
  it('orders cards red first, then the longest wait', () => {
    const cards = [{ level: 'grey' as const, days: 90 }, { level: 'red' as const, days: 2 }, { level: 'red' as const, days: 18 }, { level: 'amber' as const, days: 82 }]
    expect(cards.sort(cardOrder).map(c => `${c.level}${c.days}`)).toEqual(['red18', 'red2', 'amber82', 'grey90'])
  })
})
