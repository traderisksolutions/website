import { describe, it, expect } from 'vitest'
import { detectClientIntent, detectInsurerIntent, askedItems, planClientAmendment, needsAmendment, correctionAmount, partialLine, type OnFile, type Incoming } from '../cues'
import { amendmentOps, amendmentTitle, chaseDue } from '../rules'

// Invented people and policies; nothing here is a real client.
const onFile = (over: Partial<OnFile> & { id: string; kind: OnFile['kind']; member_name: string }): OnFile =>
  ({ effective_on: null, last_day: null, status: 'reported', batch_id: 'b1', version: 1, transaction_id: null, ...over })
const inc = (over: Partial<Incoming> & { kind: Incoming['kind']; name: string }): Incoming => ({ effective_on: null, last_day: null, detail: {}, ...over })
const thread = () => 't1'

describe('reading a client change of mind', () => {
  it('withdraw: "ignore my last email"', () => {
    expect(detectClientIntent('Re: staff movement', 'Hi, please ignore my last email, the list was wrong. Will resend.').intent).toBe('withdraw')
    expect(detectClientIntent(null, 'Kindly disregard the earlier request, we sent the wrong sheet.').intent).toBe('withdraw')
    expect(detectClientIntent(null, 'Please put this on hold for now.').intent).toBe('withdraw')
  })
  it('cancel: a leaver who is staying, a joiner who is not coming', () => {
    expect(detectClientIntent(null, 'Good news, Tan Ah Kow has withdrawn his resignation and is staying with us.').intent).toBe('cancel')
    expect(detectClientIntent(null, 'Please cancel the deletion of Lim Mei Ling.').intent).toBe('cancel')
    expect(detectClientIntent(null, 'Ravi is not joining us after all, no need to add him.').intent).toBe('cancel')
  })
  it('change: a corrected date or plan', () => {
    expect(detectClientIntent(null, 'Sorry, the last day should be 15 Nov instead of 31 Oct.').intent).toBe('change')
    expect(detectClientIntent(null, 'Please change the effective date for Ravi to 1 Dec.').intent).toBe('change')
    expect(detectClientIntent(null, 'Typo in my earlier mail: her name is Nur Aisyah, not Nur Aisha.').intent).toBe('change')
  })
  it('a plain movement list is none of these', () => {
    expect(detectClientIntent('Staff movement', 'Please add the following staff:\n1. Ravi Kumar - 1 Nov 2026\n2. Lim Mei Ling - 3 Nov 2026').intent).toBe('none')
    expect(detectClientIntent(null, 'Tan Ah Kow has resigned, last day 31 Oct.').intent).toBe('none')
  })
  it('reads the client\'s own words, not the quoted history', () => {
    const body = 'Noted, thanks.\n\nOn Mon, 2 Nov 2026 at 10:00, TRS wrote:\n> please ignore my last email'
    expect(detectClientIntent(null, body).intent).toBe('none')
  })
})

describe('reading an insurer change of mind', () => {
  it('query: documents or details wanted', () => {
    const r = detectInsurerIntent('RE: Movement', 'Dear Ernest, kindly provide the date of birth and passport copy for Ravi Kumar before we can process. Thanks.')
    expect(r.intent).toBe('query')
    expect(askedItems('Dear Ernest, kindly provide the date of birth and passport copy for Ravi Kumar before we can process. Thanks.')).toEqual(['Dear Ernest, kindly provide the date of birth and passport copy for Ravi Kumar before we can process.'])
  })
  it('reject: a member the insurer will not take', () => {
    expect(detectInsurerIntent(null, 'We regret that we are unable to add Mr Tan as he exceeds the age limit of 65.').intent).toBe('reject')
  })
  it('reissue: a revised note', () => {
    expect(detectInsurerIntent('Revised tax invoice ASIAWCCPRDN0012345', 'Please find attached the revised tax invoice; kindly disregard the earlier invoice.').intent).toBe('reissue')
  })
  it('partial: the rest to follow', () => {
    const r = detectInsurerIntent(null, 'Attached is the endorsement for 2 of the 3 members. The remaining member is pending underwriting.')
    expect(r.partial).toBe(true)
    expect(r.intent).toBe('partial')
  })
  it('a plain note is none', () => {
    expect(detectInsurerIntent('Endorsement 3 - Tax Invoice', 'Please find attached the endorsement and tax invoice.').intent).toBe('none')
  })
  it('"please confirm" on its own is how insurers end a mail, not a query', () => {
    expect(detectInsurerIntent(null, 'Please confirm to proceed issuance.').intent).toBe('none')
    expect(detectInsurerIntent(null, 'Kindly confirm your attendance by clicking the link below.').intent).toBe('none')
    expect(detectInsurerIntent(null, 'Can you please advise your suitable phone number, I would like a quick call.').intent).toBe('none')
    expect(detectInsurerIntent(null, 'Please advise the inception date (no backdating is allowed).').intent).toBe('query')
  })
})

describe('the plan against what is on file (cases 1, 2, 7, 8)', () => {
  it('case 1: a change before sending supersedes the reported movement; the batch is redrafted', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', last_day: '2026-10-31', effective_on: '2026-11-01' })]
    const plan = planClientAmendment('change', [inc({ kind: 'leave', name: 'Tan Ah Kow', last_day: '2026-11-15', effective_on: '2026-11-16' })], file, 't1', thread)
    expect(plan).toEqual([{ do: 'supersede', movement: file[0], with: expect.objectContaining({ last_day: '2026-11-15' }), reason: 'client changed' }])
    expect(needsAmendment(plan)).toBe(false)
  })
  it('case 2: the same change after sending needs an amendment to the insurer', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', last_day: '2026-10-31', status: 'sent' })]
    const plan = planClientAmendment('change', [inc({ kind: 'leave', name: 'Tan Ah Kow', last_day: '2026-11-15' })], file, 't1', thread)
    expect(plan[0].do).toBe('supersede')
    expect(needsAmendment(plan)).toBe(true)
  })
  it('case 8: "ignore my last email" cancels what that thread reported and nothing the insurer has noted', () => {
    const file = [
      onFile({ id: 'm1', kind: 'join', member_name: 'Ravi Kumar' }),
      onFile({ id: 'm2', kind: 'join', member_name: 'Lim Mei Ling', status: 'sent' }),
      onFile({ id: 'm3', kind: 'leave', member_name: 'Old Timer', status: 'noted', transaction_id: 'tx1' }),
    ]
    const plan = planClientAmendment('withdraw', [], file, 't1', thread)
    expect(plan.map(a => a.do === 'new' ? 'new' : `${a.do}:${a.movement.id}`)).toEqual(['cancel:m1', 'cancel:m2'])
    expect(needsAmendment(plan)).toBe(true)   // m2 was sent: the insurer must hear
  })
  it('a withdrawal on another thread touches nothing on this one', () => {
    const file = [onFile({ id: 'm1', kind: 'join', member_name: 'Ravi Kumar' })]
    expect(planClientAmendment('withdraw', [], file, 't2', thread)).toEqual([])
  })
  it('case 7: the same person reported twice is dropped; a contradicting instruction supersedes the earlier', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', last_day: '2026-10-31', effective_on: '2026-11-01' })]
    expect(planClientAmendment('none', [inc({ kind: 'leave', name: 'Tan Ah Kow', last_day: '2026-10-31', effective_on: '2026-11-01' })], file, 't1', thread)).toEqual([])
    const later = planClientAmendment('none', [inc({ kind: 'leave', name: 'Tan Ah Kow', last_day: '2026-11-30', effective_on: '2026-12-01' })], file, 't1', thread)
    expect(later).toEqual([{ do: 'supersede', movement: file[0], with: expect.objectContaining({ last_day: '2026-11-30' }), reason: 'later instruction' }])
  })
  it('a join for someone with a pending leave: the later instruction stands', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', status: 'sent' })]
    const plan = planClientAmendment('none', [inc({ kind: 'join', name: 'Tan Ah Kow', effective_on: '2026-12-01' })], file, 't1', thread)
    expect(plan[0]).toEqual({ do: 'supersede', movement: file[0], with: expect.objectContaining({ kind: 'join' }), reason: 'later instruction' })
  })
  it('new names are new; a cancel names only the people in the mail', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', status: 'sent' }), onFile({ id: 'm2', kind: 'join', member_name: 'Ravi Kumar' })]
    const plan = planClientAmendment('cancel', [inc({ kind: 'leave', name: 'Tan Ah Kow' }), inc({ kind: 'join', name: 'New Person' })], file, 't1', thread)
    expect(plan).toEqual([{ do: 'cancel', movement: file[0], reason: 'client cancelled' }, { do: 'new', with: expect.objectContaining({ name: 'New Person' }) }])
  })
  it('a part of the name still matches', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Muhammad Ravi Kumar bin Abdullah', status: 'sent' })]
    expect(planClientAmendment('cancel', [inc({ kind: 'leave', name: 'Ravi Kumar bin Abdullah' })], file, 't1', thread)[0].do).toBe('cancel')
  })
})

describe('after the insurer has noted or TRS has billed (case 3)', () => {
  it('a cancellation becomes a reversal request, and a change a reversal plus a new instruction', () => {
    const file = [onFile({ id: 'm1', kind: 'leave', member_name: 'Tan Ah Kow', status: 'billed', transaction_id: 'tx1', last_day: '2026-10-31' })]
    expect(planClientAmendment('cancel', [inc({ kind: 'leave', name: 'Tan Ah Kow' })], file, 't1', thread)).toEqual([{ do: 'reverse', movement: file[0], reason: 'client cancelled after billing' }])
    const changed = planClientAmendment('change', [inc({ kind: 'leave', name: 'Tan Ah Kow', last_day: '2026-11-30' })], file, 't1', thread)
    expect(changed.map(a => a.do)).toEqual(['reverse', 'new'])
  })
})

describe('re-issued notes and corrections (case 5)', () => {
  it('the corrective note is the signed difference', () => {
    expect(correctionAmount(312.4, 350.0)).toEqual({ kind: 'debit', amount: 37.6 })
    expect(correctionAmount(312.4, 300.0)).toEqual({ kind: 'credit', amount: 12.4 })
    expect(correctionAmount(-125.96, -100.0)).toEqual({ kind: 'debit', amount: 25.96 })   // a smaller refund than first credited
    expect(correctionAmount(312.4, 312.4)).toBeNull()
  })
})

describe('partial noting (case 6) and the paused chase (case 4)', () => {
  it('says what is left', () => {
    expect(partialLine(3, 1)).toBe('1 of 3 still unnoted')
    expect(partialLine(3, 0)).toBeNull()
    expect(partialLine(3, 3)).toBeNull()
  })
  it('a batch waiting on the client is not chased; it is again once the answer went', () => {
    const b = { status: 'sent' as const, sent_at: '2026-11-01T01:00:00Z', next_chase_at: '2026-11-08T01:00:00Z', chase_count: 0 }
    const later = new Date('2026-11-09T01:00:00Z')
    expect(chaseDue({ ...b, sub_state: 'awaiting_client' }, later)).toBe(false)
    expect(chaseDue({ ...b, sub_state: null }, later)).toBe(true)
  })
})

describe('the amendment in Today', () => {
  it('counts what the revision asks and names it', () => {
    const ms = [
      { detail: { amendment: 'cancel', of_kind: 'leave' }, supersedes_id: 'm1' },
      { detail: { amendment: 'replace' }, supersedes_id: 'm2' },
      { detail: { amendment: 'reverse', of_kind: 'join' }, supersedes_id: 'm3' },
      { detail: {}, supersedes_id: null },
    ]
    expect(amendmentOps(ms)).toEqual({ cancel: 1, replace: 1, reverse: 1, add: 1 })
    expect(amendmentTitle(amendmentOps(ms), -104.2, 'QBE', 'N0000001', 2)).toBe('Approve amendment: cancel 1, change 1, reverse 1, add 1, est. -S$104.20 · QBE N0000001 (rev. 2)')
  })
})
