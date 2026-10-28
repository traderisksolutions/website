/**
 * Replies that do not arrive on the request's own thread: a broker sent from their own mailbox,
 * forwarded an insurer's email into operations@, or the insurer started a fresh thread. The
 * Message-ID, the [TRS-Q-0142] reference and the subject file them; a domain alone only queues.
 */
import { describe, it, expect } from 'vitest'
import {
  baseSubject, findTier, lineFinished, matchDispatches, parseRefs, placementFinished, readForward, tierKey, withRef,
  type OpenDispatch,
} from '@/lib/placement/match'

const open: OpenDispatch[] = [
  { id: 'wica-allianz', placement_id: 'p1', placement_ref: 'Q-0142', line_id: 'wica', to_email: 'daniel.ho@allianz.com.sg', sent_subject: 'Quotation request — Kranji Precision WICA [TRS-Q-0142]', rfc822_message_id: '<abc@mail.gmail.com>' },
  { id: 'ghs-allianz', placement_id: 'p1', placement_ref: 'Q-0142', line_id: 'ghs', to_email: 'grace.lim@allianz.com.sg', sent_subject: 'Quotation request — Kranji Precision GHS [TRS-Q-0142]', rfc822_message_id: '<def@mail.gmail.com>' },
  { id: 'ghs-msig', placement_id: 'p1', placement_ref: 'Q-0142', line_id: 'ghs', to_email: 'priya@msig.com.sg', sent_subject: 'Quotation request — Kranji Precision GHS [TRS-Q-0142]', rfc822_message_id: '<ghi@mail.gmail.com>' },
  { id: 'pl-allianz-other', placement_id: 'p2', placement_ref: 'Q-0139', line_id: 'pl', to_email: 'daniel.ho@allianz.com.sg', sent_subject: 'Quotation request — Sunbloom PL [TRS-Q-0139]', rfc822_message_id: '<jkl@mail.gmail.com>' },
]

describe('references', () => {
  it('puts the reference on the subject once', () => {
    expect(withRef('Quotation request — Kranji', 'Q-0142')).toBe('Quotation request — Kranji [TRS-Q-0142]')
    expect(withRef('Re: Quotation [TRS-Q-0142]', 'Q-0142')).toBe('Re: Quotation [TRS-Q-0142]')
    expect(withRef('No ref', null)).toBe('No ref')
  })
  it('reads every reference in the texts, once each', () => {
    expect(parseRefs('RE: FW: quote [TRS-Q-0142]', 'see trs-q-0142 and TRS-Q-0139')).toEqual(['Q-0142', 'Q-0139'])
    expect(parseRefs('Q-0142 alone is not ours')).toEqual([])
  })
  it('compares subjects without prefixes or references', () => {
    expect(baseSubject('RE: Fwd: AW: Quotation request — Kranji [TRS-Q-0142]')).toBe('quotation request — kranji')
  })
})

describe('readForward', () => {
  it('reads the original sender of a Gmail forward', () => {
    const body = 'FYI\n\n---------- Forwarded message ---------\nFrom: Daniel Ho <daniel.ho@allianz.com.sg>\nDate: Tue, 27 Oct 2026 at 10:02\nSubject: RE: Quotation request [TRS-Q-0142]\nTo: jl@trade-risksol.com\n\nPremium S$6,840.'
    expect(readForward('Fwd: RE: Quotation request [TRS-Q-0142]', body)).toEqual({
      from: { email: 'daniel.ho@allianz.com.sg', name: 'Daniel Ho' }, subject: 'RE: Quotation request [TRS-Q-0142]', sent: 'Tue, 27 Oct 2026 at 10:02',
    })
  })
  it('skips TRS addresses in an Outlook chain to reach the outsider', () => {
    const body = 'see below\n-----Original Message-----\nFrom: Mei <mei@trade-risksol.com>\nSent: Monday\nSubject: FW: GHS\n\n-----Original Message-----\nFrom: Ms Tan [mailto:tan@kranji.com.sg]\nSent: Monday, 26 Oct\nSubject: GHS — what about 1M?\n'
    expect(readForward('FW: GHS', body)?.from).toEqual({ email: 'tan@kranji.com.sg', name: 'Ms Tan' })
  })
  it('is null for an ordinary email', () => {
    expect(readForward('Quotation', 'Dear Underwriter, please quote.')).toBeNull()
  })
})

describe('matchDispatches', () => {
  it('files by In-Reply-To whatever mailbox it landed in, with the same insurer on the other lines', () => {
    const r = matchDispatches({ party: 'daniel.ho@allianz.com.sg', subject: 'RE: something else', body: '', inReplyTo: '<ABC@mail.gmail.com>' }, open)
    expect(r).toEqual({ kind: 'matched', ids: ['wica-allianz', 'ghs-allianz'], via: 'header' })
  })
  it('files by reference from the insurer it was sent to, not other placements to that insurer', () => {
    const r = matchDispatches({ party: 'someone.else@allianz.com.sg', subject: 'Kranji quotes [TRS-Q-0142]', body: '', inReplyTo: null }, open)
    expect(r).toEqual({ kind: 'matched', ids: ['wica-allianz', 'ghs-allianz'], via: 'ref' })
  })
  it('ignores a reference from an insurer that was never asked', () => {
    expect(matchDispatches({ party: 'x@chubb.com', subject: '[TRS-Q-0142]', body: '', inReplyTo: null }, open)).toEqual({ kind: 'none' })
  })
  it('files by the request subject when it names one placement', () => {
    const r = matchDispatches({ party: 'priya@msig.com.sg', subject: 'RE: Quotation request — Kranji Precision GHS', body: '', inReplyTo: null }, open)
    expect(r).toEqual({ kind: 'matched', ids: ['ghs-msig'], via: 'subject' })
  })
  it('only queues when the domain is all it has', () => {
    const r = matchDispatches({ party: 'daniel.ho@allianz.com.sg', subject: 'Our renewal notice', body: '', inReplyTo: null }, open)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      expect(r.strength).toBe('domain')
      expect(r.ids.sort()).toEqual(['ghs-allianz', 'pl-allianz-other', 'wica-allianz'])
    }
  })
  it('never matches a personal-mail domain on domain alone', () => {
    const personal: OpenDispatch[] = [{ ...open[0], id: 'g', to_email: 'agent@gmail.com' }]
    expect(matchDispatches({ party: 'other@gmail.com', subject: 'hello', body: '', inReplyTo: null }, personal)).toEqual({ kind: 'none' })
  })
})

describe('tiers', () => {
  it('treats the same amount written differently as one tier', () => {
    expect(tierKey('S$1,000,000')).toBe(tierKey('1M'))
    expect(tierKey('$500k')).toBe(tierKey('500,000'))
    expect(tierKey('Plan B')).toBe(tierKey('plan  b'))
    expect(tierKey('1M')).not.toBe(tierKey('2M'))
  })
  it('finds the tier a quoted label belongs to', () => {
    const tiers = [{ id: 't1', label: '500k' }, { id: 't2', label: '1M' }]
    expect(findTier('S$1,000,000', tiers)?.id).toBe('t2')
    expect(findTier('2M', tiers)).toBeNull()
    expect(findTier(null, tiers)).toBeNull()
  })
})

describe('done', () => {
  it('closes a placement only when every line is finished', () => {
    expect(lineFinished('done')).toBe(true)
    expect(lineFinished('bound')).toBe(false)
    expect(placementFinished(['done', 'declined', 'lost'])).toBe(true)
    expect(placementFinished(['done', 'bound'])).toBe(false)
    expect(placementFinished([])).toBe(false)
  })
})

describe('earlier rounds', () => {
  const rounds: OpenDispatch[] = [
    { ...open[2], id: 'ghs-msig-r1', rfc822_message_id: '<r1@mail.gmail.com>', current: false },
    { ...open[2], id: 'ghs-msig-r2', rfc822_message_id: '<r2@mail.gmail.com>' },
  ]
  it('files a reference or subject match on the current round only', () => {
    expect(matchDispatches({ party: 'priya@msig.com.sg', subject: 'Kranji [TRS-Q-0142]', body: '', inReplyTo: null }, rounds))
      .toEqual({ kind: 'matched', ids: ['ghs-msig-r2'], via: 'ref' })
  })
  it('still files a late reply to the earlier round by its Message-ID', () => {
    expect(matchDispatches({ party: 'priya@msig.com.sg', subject: 'RE: x', body: '', inReplyTo: '<r1@mail.gmail.com>' }, rounds))
      .toEqual({ kind: 'matched', ids: ['ghs-msig-r1'], via: 'header' })
  })
})
