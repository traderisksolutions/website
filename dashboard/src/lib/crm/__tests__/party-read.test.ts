import { describe, it, expect } from 'vitest'
import { companyInSignature, companyOfAddress, indexNames, readSender, readSenders, referralAmong, signatureOf, voiceOf } from '../party-read'

const index = indexNames([
  { id: '1', name: 'Carebridge Pte Ltd', kind: 'partner' },
  { id: '2', name: 'Harbour Insurance', kind: 'insurer' },
  { id: '3', name: 'Orchard Foods Pte Ltd', kind: 'client' },
  { id: '4', name: 'Northlight', kind: 'client' },
  { id: '5', name: 'Northlight', kind: 'insurer' },
])
const email = (from_address: string, body_text: string) => ({ from_address, body_text })

describe('the address', () => {
  it('names the company on file whose name is the domain', () => {
    expect(companyOfAddress('Amy Tan <amy@carebridge.sg>', index)?.id).toBe('1')
    expect(readSender(email('amy@carebridge.com.sg', 'Hello'), index)).toMatchObject({ party: 'referral', by: 'address', cue: 'carebridge.com.sg' })
  })
  it('names no one from a public mailbox or a name two kinds of company share', () => {
    expect(companyOfAddress('carebridge@gmail.com', index)).toBeNull()
    expect(companyOfAddress('uw@northlight.sg', index)).toBeNull()
  })
})

describe('the signature', () => {
  const body = 'Hi Nathan,\n\nPlease see the census attached.\n\nBest regards,\nAmy Tan\nAccount Manager | Carebridge Pte Ltd\nwww.carebridge.sg'
  it('is the block under the closing, without the quoted history', () => {
    const s = signatureOf(`${body}\n\nOn Mon, 2 Nov 2026 at 10:00, Nathan <nathan@trade-risksol.com> wrote:\n> Harbour Insurance has replied.`)
    expect(s).toContain('Carebridge Pte Ltd')
    expect(s).not.toContain('Harbour')
  })
  it('names the company on a line of it, or by its web address', () => {
    expect(companyInSignature('Amy Tan\nAccount Manager | Carebridge Pte Ltd', index)).toMatchObject({ company: { id: '1' }, cue: 'Account Manager | Carebridge Pte Ltd' })
    expect(companyInSignature('Amy Tan\nwww.carebridge.sg', index)?.company.id).toBe('1')
    expect(companyInSignature('Amy Tan\nAccount Manager', index)).toBeNull()
  })
  it('places a personal address by the company that signs', () => {
    expect(readSender(email('amy.tan@gmail.com', body), index)).toMatchObject({ party: 'referral', by: 'signature', company: { id: '1' } })
  })
})

describe('the voice', () => {
  it('hears a referral speak of its client, the market of the broker’s', () => {
    expect(voiceOf('Our client would like to add two staff from next month.')).toMatchObject({ party: 'referral', cue: 'our client' })
    expect(voiceOf('We are pleased to quote for your client as attached.')?.party).toBe('insurer')
  })
  it('hears neither in plain words, nor in both at once', () => {
    expect(voiceOf('Please see the census attached.')).toBeNull()
    expect(voiceOf('Our client has seen our proposal.')).toBeNull()
  })
})

describe('one read per sender', () => {
  it('lets a named company beat a voice', () => {
    const reads = readSenders([
      email('amy.tan@gmail.com', 'We are pleased to quote for your client.'),
      email('amy.tan@gmail.com', 'Census attached.\n\nRegards,\nAmy Tan\nCarebridge Pte Ltd'),
    ], index)
    expect(reads.get('amy.tan@gmail.com')).toMatchObject({ party: 'referral', by: 'signature' })
  })
  it('holds the voice heard more often, and neither when they tie', () => {
    const referral = email('ben@unfiled.sg', 'Our client has asked for a revised quotation.')
    const market = email('ben@unfiled.sg', 'Please see our proposal for your client.')
    expect(readSenders([referral, referral, market], index).get('ben@unfiled.sg')?.party).toBe('referral')
    expect(readSenders([referral, market], index).has('ben@unfiled.sg')).toBe(false)
  })
})

describe('the referral a thread rests on', () => {
  it('is the sender a company names, over one only the wording places', () => {
    const reads = readSenders([
      email('sam@gmail.com', 'Hi Nathan,\n\nOur client would like to add two staff.'),
      email('amy.tan@gmail.com', 'Hi Nathan,\n\nCensus attached.\n\nBest regards,\nAmy Tan\nCarebridge Pte Ltd'),
    ], index)
    expect(referralAmong(reads)).toMatchObject({ sender: 'amy.tan@gmail.com', read: { by: 'signature', company: { id: '1' } } })
  })
  it('is no one when every sender reads as the market or a client', () => {
    const reads = readSenders([
      email('uw@harbour-insurance.sg', 'Please find our quotation for your client attached.'),
      email('hr@orchardfoods.sg', 'Hello'),
    ], index)
    expect(referralAmong(reads)).toBeNull()
  })
})
