/**
 * Phase 1 of the agents learning Nathan's method (2 Nov 2026): chase cadence by party and days to
 * deadline, relays with numbered questions and the other side's words under QUOTE / UNQUOTE, and
 * the sender's voice laid over a neutral draft at approval.
 */
import { describe, it, expect } from 'vitest'
import { chaseDecision, MAX_CHASES } from '@/lib/admin/b/sweeps'
import { buildDraft } from '@/lib/admin/b/drafts'
import { dependencyLine } from '@/lib/admin/b/drafter'
import { composeRelay, numbered, quoteBlock, hasNumbering, type RelayFacts } from '@/lib/admin/b/relay/compose'
import { applyVoice, signBlock, DEFAULT_VOICE, type Voice } from '@/lib/admin/b/voice'

describe('chase cadence', () => {
  const insurer = { status: 'waiting_insurer', waiting_since: '2026-10-05', last_activity_at: null, snoozed_until: null, closed_at: null, deadline: null }
  it('chases an insurer after 5 working days and a client after 7 calendar days', () => {
    expect(chaseDecision(insurer, '2026-10-12').chase).toBeNull()                        // 5 working days
    expect(chaseDecision(insurer, '2026-10-13').chase).toBe('chase_insurer')              // 6
    expect(chaseDecision({ ...insurer, status: 'waiting_client' }, '2026-10-11').chase).toBeNull()   // 6 days
    expect(chaseDecision({ ...insurer, status: 'waiting_client' }, '2026-10-12').chase).toBe('chase_client') // 7
  })
  it('chases every 2 days inside the last week before the deadline, and asks for today inside 5', () => {
    const d = { ...insurer, waiting_since: '2026-10-28', deadline: '2026-11-04' }
    expect(chaseDecision(d, '2026-10-29').chase).toBeNull()
    const r = chaseDecision(d, '2026-10-30')
    expect(r).toMatchObject({ chase: 'chase_insurer', round: 1, urgent: true })
    expect(chaseDecision(d, '2026-11-01').round).toBe(2)
    expect(chaseDecision({ ...d, deadline: '2026-11-20' }, '2026-10-30').chase).toBeNull()  // not near: normal cadence
  })
  it('hands over to a person after three chases instead of a fourth email', () => {
    expect(chaseDecision(insurer, '2026-10-30').round).toBe(MAX_CHASES)   // 19 working days: the third chase
    const r = chaseDecision(insurer, '2026-11-09')   // 25 working days → round 4
    expect(r.round).toBe(MAX_CHASES + 1)
    expect(r.chase).toBeNull()
    expect(r.escalate).toBe(true)
  })
})

describe('chase bodies', () => {
  const f = { greetingName: 'Belinda', clientName: 'Example Client Pte Ltd', title: 'Shopcare renewal', policyNumber: 'SI26Q00001', insurerName: 'Example Insurer', insurerRef: null, claimant: null, lossDate: null, threadSubject: 'Re: Shopcare renewal', lastSent: '2026-10-20' }
  it('is one ask with a thank-you, and names the dependency', () => {
    const b = buildDraft('chase_insurer', { ...f, round: 1, dependency: 'This is needed so that we can release the cover note to the client.' }).body
    expect(b).toContain('May I check on Shopcare renewal')
    expect(b).toContain('release the cover note')
    expect(b).toContain('Thank you!')
    expect(b.split('\n').filter(l => /\?/.test(l))).toHaveLength(1)
  })
  it('asks for the answer today inside 5 days of the deadline', () => {
    const soon = new Date(Date.now() + 8 * 3600_000 + 3 * 86_400_000).toISOString().slice(0, 10)
    const b = buildDraft('chase_insurer', { ...f, round: 1, urgent: true, deadline: soon }).body
    expect(b).toMatch(/expiry is in 3 days, may we have your reply on .* by today please\?/)
  })
  it('proposes a call on the third chase', () => {
    expect(buildDraft('chase_insurer', { ...f, round: 3 }).body).toContain('give me a call at {owner_phone}')
    expect(buildDraft('chase_client', { ...f, round: 3 }).body).toContain('take a call at {owner_phone}')
  })
  it('turns a next action into a reason, and drops ones that say nothing to the recipient', () => {
    expect(dependencyLine('Send the policy documents to the client')).toBe('This is needed so that we can send the policy documents to the client.')
    expect(dependencyLine('Wait for the insurer')).toBeNull()
    expect(dependencyLine(null)).toBeNull()
  })
})

describe('relay shape', () => {
  const base: RelayFacts = { greetingName: 'Mei', clientName: 'Example Client Pte Ltd', insurerName: 'Example Insurer', lineLabel: 'contractors all risks', policyNumber: null, className: null, threadSubject: 'Re: (TRS) Example Insurer - Example Client | CAR', title: 'CAR quotation' }
  it('numbers the insurer questions and asks for answers against the numbers', () => {
    const b = composeRelay('relay_question', { ...base, asks: ['Description of works', 'Is there any basement?', 'Excavation depth'] }).body
    expect(b).toContain('1. Description of works\n2. Is there any basement?\n3. Excavation depth')
    expect(b).toContain('reply against each number')
  })
  it('relays the insurer\'s decline verbatim under QUOTE / UNQUOTE', () => {
    const b = composeRelay('relay_decline', { ...base, quoted: 'We are unable to support this risk as the contract value is outside our appetite.' }).body
    expect(b).toContain('QUOTE\nWe are unable to support this risk as the contract value is outside our appetite.\nUNQUOTE')
    expect(b).not.toContain('"We are unable')
  })
  it('forwards numbered client answers as answers, numbered as asked', () => {
    const b = composeRelay('forward_question', { ...base, original: { from: 'ops@example-client.sg', sent_at: '2026-11-01', subject: 'Re: CAR', text: '1. Piling and superstructure\n2. No basement\n3. 3 m' } }).body
    expect(b).toContain('answers to your questions, numbered as asked')
    expect(b).toContain('QUOTE\n1. Piling and superstructure\n2. No basement\n3. 3 m\nUNQUOTE')
  })
  it('helpers', () => {
    expect(numbered(['- a', '2) b', 'c'])).toBe('1. a\n2. b\n3. c')
    expect(quoteBlock('  x  ')).toBe('QUOTE\nx\nUNQUOTE')
    expect(quoteBlock('')).toBe('')
    expect(hasNumbering('1. a\n2. b')).toBe(true)
    expect(hasNumbering('one thing')).toBe(false)
  })
})

describe('voice', () => {
  const nathan: Voice = { ...DEFAULT_VOICE, name: 'Nathan', greetingFirst: 'Dear', greetingWarm: 'Hi', thanks: true, closing: 'Warmest Regards,', phone: '+65 0000 0000', phoneOnFirstContact: true, company: false }
  const neutral = 'Dear Belinda,\n\nMay I check on the renewal?\n\nThank you!\n\nBest regards,\n{owner_name}\nTrade Risk Solutions'
  it('keeps the neutral draft neutral for a sender without a profile', () => {
    expect(applyVoice(neutral, { ...DEFAULT_VOICE, name: 'Hasya Hasnizam' }, { firstContact: true })).toBe('Dear Belinda,\n\nMay I check on the renewal?\n\nThank you!\n\nBest regards,\nHasya Hasnizam\nTrade Risk Solutions')
  })
  it('lays Nathan over it: Dear on first contact with the mobile, Hi once warm without it', () => {
    expect(applyVoice(neutral, nathan, { firstContact: true })).toBe('Dear Belinda,\n\nMay I check on the renewal?\n\nThank you!\n\nWarmest Regards,\nNathan\n+65 0000 0000')
    expect(applyVoice(neutral, nathan, { firstContact: false })).toBe('Hi Belinda,\n\nMay I check on the renewal?\n\nThank you!\n\nWarmest Regards,\nNathan')
  })
  it('adds the thank-you when the draft had none, and fills or drops the phone line', () => {
    const b = applyVoice('Dear X,\n\nPlease proceed.\n\nBest regards,\n{owner_name}\nTrade Risk Solutions', nathan, { firstContact: false })
    expect(b).toBe('Hi X,\n\nPlease proceed.\n\nThank you!\n\nWarmest Regards,\nNathan')
    expect(applyVoice('Call me at {owner_phone}.\n\nBest regards,\n{owner_name}\nTrade Risk Solutions', nathan, { firstContact: true })).toContain('Call me at +65 0000 0000.')
    expect(applyVoice('Call me at {owner_phone}.', DEFAULT_VOICE, { firstContact: true })).toBe('Call me at .')
  })
  it('signBlock', () => {
    expect(signBlock(DEFAULT_VOICE, { firstContact: true })).toBe('Best regards,\nTrade Risk Solutions')
  })
})
