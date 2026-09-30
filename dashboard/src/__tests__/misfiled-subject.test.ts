import { describe, it, expect } from 'vitest'
import { clientFromSubject, subjectCandidates } from '@/lib/crm/misfiled'

// Real subjects from the TRS mailbox, 30 Sept 2026.
describe('clientFromSubject', () => {
  it('reads the client out of "(TRS) Insurer - Client"', () => {
    expect(clientFromSubject('(TRS) Chubb - ALR Technologies | Tech PI, D&O & Cyber')).toBe('ALR Technologies')
    expect(clientFromSubject('Re: (TRS) EQ - Gourmetz Motor Fleet')).toBe('Gourmetz')
    expect(clientFromSubject('(TRS) Sompo - AAS AV382 Cargo Insurance')).toBe('AAS AV382')
    expect(clientFromSubject('(TRS) EQ- Four One Eleven LLP | WIC')).toBe('Four One Eleven LLP')
    expect(clientFromSubject('RE: (TRS) CTPIS - Everard Access | Advance Payment Bond')).toBe('Everard Access')
  })
  it('reads the client out of "TRS (Insurer) : Client"', () => {
    expect(clientFromSubject('Re: TRS (RHI) : Healthway Medical Group Pte Ltd Policy')).toBe('Healthway Medical Group Pte Ltd')
    expect(clientFromSubject('TRS (AWFA) : JK Wildlife Pte Ltd - Renewal for Group Travel')).toBe('JK Wildlife Pte Ltd')
  })
  it('strips reply and forward prefixes, including Chinese ones', () => {
    expect(clientFromSubject('Re: (TRS) Liberty - Mister Mobile Trading Pte Ltd')).toBe('Mister Mobile Trading Pte Ltd')
    expect(clientFromSubject('回复：(TRS) Income - Regent Logistics Fleet')).toBe('Regent Logistics')
  })
  it('returns null when the subject is not in a house shape', () => {
    expect(clientFromSubject('Fwd: Anthropic’s trillion-dollar question')).toBeNull()
    expect(clientFromSubject('Re: Your enquiry | Trade Risk Solutions')).toBeNull()
    expect(clientFromSubject('')).toBeNull()
    expect(clientFromSubject(null)).toBeNull()
  })
  it('refuses a cover name standing in for a client, and falls back to the other side', () => {
    // Nothing on either side is a client name.
    expect(clientFromSubject('(TRS) Claims - Professional Indemnity')).toBeNull()
    // The cover is rejected, so the name before the dash is offered instead.
    expect(clientFromSubject('(TRS) Lioner - Professional Indemnity')).toBe('Lioner')
  })
  it('reads the client when staff put it first, as "(TRS) Client - Cover"', () => {
    expect(subjectCandidates('(TRS) Mobile Accessories Studio - ShopCare Policy Document'))
      .toContain('Mobile Accessories Studio')
    expect(subjectCandidates('(TRS) PC Repair Studio - WIC and FWMI')).toContain('PC Repair Studio')
  })
  it('trims trailing admin text so the create field prefills cleanly', () => {
    expect(clientFromSubject('TRS(GE) : Whampoa Soya Bean  Pte Ltd Renewal for 2026')).toBe('Whampoa Soya Bean Pte Ltd')
    expect(clientFromSubject('TRS (GE) : Mister Mobile Trading  Policy No : 2026/1')).toBe('Mister Mobile Trading')
  })
  it('keeps a name that merely contains a cover word', () => {
    expect(clientFromSubject('(TRS) ECICS - CJYE West 1800 Dormitory')).toBe('CJYE West 1800 Dormitory')
    expect(clientFromSubject('(TRS) EQ - Mister Mobile Trading Pte Ltd')).toBe('Mister Mobile Trading Pte Ltd')
  })
  it('refuses something too short or with no letters', () => {
    expect(clientFromSubject('(TRS) EQ - AB')).toBeNull()
    expect(clientFromSubject('(TRS) EQ - 2026')).toBeNull()
  })
})
