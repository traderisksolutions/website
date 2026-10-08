import { describe, expect, it } from 'vitest'
import { domainOf, firstNameOf, isEnrollable, isRoleInbox, mobileForWhatsApp, nextSendRun, shouldPauseForBounces, substituteTokens, toCsv } from '@/lib/outreach/prospects'

const person = { full_name: 'Tan Wei Ming', email: 'weiming.tan@acme.com.sg', email_status: 'verified' as const, do_not_contact: false }

describe('named people only', () => {
  it('refuses role inboxes', () => {
    for (const e of ['info@acme.com', 'Sales@acme.com', 'enquiries@acme.sg', 'hr.sg@acme.com', 'no-reply@x.io', 'contactus@a.com']) expect(isRoleInbox(e)).toBe(true)
    for (const e of ['weiming.tan@acme.com', 'infosec.lead@a.com', 'salesforce.admin.jane@a.com', 'j.ong@a.com']) expect(isRoleInbox(e)).toBe(false)
  })
  it('enrols verified or published named people only', () => {
    expect(isEnrollable(person)).toBe(true)
    expect(isEnrollable({ ...person, email_status: 'published' })).toBe(true)
    expect(isEnrollable({ ...person, email_status: 'guessed' })).toBe(false)
    expect(isEnrollable({ ...person, email_status: 'guessed' }, ['guessed'])).toBe(true)
    expect(isEnrollable({ ...person, email: 'info@acme.com.sg' })).toBe(false)
    expect(isEnrollable({ ...person, do_not_contact: true })).toBe(false)
    expect(isEnrollable({ ...person, full_name: ' ' })).toBe(false)
    expect(isEnrollable({ ...person, email: 'not-an-email' })).toBe(false)
  })
})

describe('parsing', () => {
  it('domain from url or email', () => {
    expect(domainOf('https://www.Acme.com.sg/about')).toBe('acme.com.sg')
    expect(domainOf('jane@acme.co.id')).toBe('acme.co.id')
    expect(domainOf('')).toBeNull()
  })
  it('first name drops honorifics', () => {
    expect(firstNameOf('Bapak Budi Santoso')).toBe('Budi')
    expect(firstNameOf('dr. jane ong')).toBe('Jane')
  })
  it('merge matches the sender', () => {
    expect(substituteTokens('Hi {{first_name}}, {{COMPANY}}', 'Jane', '')).toBe('Hi Jane, your company')
    expect(substituteTokens('Hi {{first_name}}', '', 'Acme')).toBe('Hi there')
  })
})

describe('WhatsApp, mobiles only', () => {
  it('accepts mobiles, rejects landlines', () => {
    expect(mobileForWhatsApp('+65 9123 4567', 'SG')).toBe('6591234567')
    expect(mobileForWhatsApp('6123 4567', 'SG')).toBeNull()
    expect(mobileForWhatsApp('9123 4567', 'HK')).toBe('85291234567')
    expect(mobileForWhatsApp('0812-3456-7890', 'ID')).toBe('6281234567890')
    expect(mobileForWhatsApp('+62 21 555 1234', 'ID')).toBeNull()
    expect(mobileForWhatsApp('012-345 6789', 'MY')).toBe('60123456789')
  })
})

describe('schedule and guards', () => {
  it('next sender run is 23:15 UTC', () => {
    expect(nextSendRun(new Date('2026-10-08T10:00:00Z')).toISOString()).toBe('2026-10-08T23:15:00.000Z')
    expect(nextSendRun(new Date('2026-10-08T23:30:00Z')).toISOString()).toBe('2026-10-09T23:15:00.000Z')
  })
  it('bounce pause above 5% on 20 or more', () => {
    expect(shouldPauseForBounces(19, 5)).toBe(false)
    expect(shouldPauseForBounces(20, 1)).toBe(false)
    expect(shouldPauseForBounces(20, 2)).toBe(true)
  })
  it('csv quotes and blocks formulas', () => {
    expect(toCsv([['a,b', '=SUM(A1)', null, 'say "hi"']])).toBe(`"a,b",'=SUM(A1),,"say ""hi"""`)
  })
})
