import { describe, it, expect } from 'vitest'
import { indexNames } from '../party-read'
import { referralOn } from '../thread-referral'

const carebridge = { id: '1', name: 'Carebridge Pte Ltd', kind: 'partner' }, ledger = { id: '4', name: 'Ledger Mail', kind: 'partner' }
const names = indexNames([carebridge, { id: '2', name: 'Harbour Insurance', kind: 'insurer' }, { id: '3', name: 'Orchard Foods Pte Ltd', kind: 'client' }])
const domainKind = new Map([['carebridge.sg', 'partner'], ['ledger.example', 'partner'], ['harbour-insurance.example', 'insurer'], ['orchard-foods.example', 'client']])
const at = (d: string) => d === 'carebridge.sg' ? { company: carebridge, checked: true } : d === 'ledger.example' ? { company: ledger, checked: false } : null
const email = (from_address: string, body_text: string) => ({ from_address, body_text })
const on = (...messages: ReturnType<typeof email>[]) => referralOn(messages, domainKind, names, at)

describe('the referral on a thread', () => {
  it('is a sender at the domain of a referral a person has checked', () => {
    expect(on(email('hr@orchard-foods.example', 'Hello'), email('Amy Tan <amy@carebridge.sg>', 'Hi Nathan,\n\nCensus attached.')))
      .toEqual({ companyId: '1', company: 'Carebridge Pte Ltd', by: 'address', cue: 'carebridge.sg', sender: 'amy@carebridge.sg' })
  })
  it('is not one who writes in the market’s voice from that domain', () => {
    expect(on(email('amy@carebridge.sg', 'Please find our quotation for your client attached.'))).toBeNull()
  })
  it('is a sender at an unchecked referral’s domain only when they write as one', () => {
    expect(on(email('news@ledger.example', 'Hi Nathan,\n\nOur November circular is attached.'))).toBeNull()
    expect(on(email('kim@ledger.example', 'Hi Nathan,\n\nOur client would like a quotation for 12 staff.'))).toEqual({ companyId: '4', company: 'Ledger Mail', by: 'voice', cue: 'our client', sender: 'kim@ledger.example' })
  })
  it('is read from a personal address by its signature, then by its wording', () => {
    expect(on(email('amy.tan@gmail.com', 'Hi Nathan,\n\nCensus attached.\n\nBest regards,\nAmy Tan\nCarebridge Pte Ltd'))).toMatchObject({ companyId: '1', by: 'signature' })
    expect(on(email('sam@gmail.com', 'Hi Nathan,\n\nOur client would like to add two staff.'))).toEqual({ companyId: null, company: null, by: 'voice', cue: 'our client', sender: 'sam@gmail.com' })
  })
  it('is no one among clients and insurers', () => {
    expect(on(email('hr@orchard-foods.example', 'Our client list is attached.'), email('uw@harbour-insurance.example', 'Hello'))).toBeNull()
  })
})
