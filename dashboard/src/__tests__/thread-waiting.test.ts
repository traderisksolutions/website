/** The thread status skips auto-replies and forwards inside TRS. Chase dates skip weekends and holidays. */
import { describe, it, expect } from 'vitest'
import { autoReplyAfter, lastRealMessage, needsOurReply } from '@/lib/threads/waiting'
import { chaseDueOn } from '@/lib/admin/b/cadence'
import { addressesIn, oneRecipient, toProblem } from '@/lib/email/recipients'
import { cloneRows } from '@/lib/placement/fanout'

const inbound = (from: string, body = 'Please advise.', subject = 'RE: Letter') => ({ direction: 'inbound', from_address: from, subject, body_text: body, sent_at: '2026-11-05T07:00:00Z' })
const outbound = (to: string[]) => ({ direction: 'outbound', from_address: 'nathan@trade-risksol.com', subject: 'RE: Letter', body_text: 'Noted', sent_at: '2026-11-06T04:00:00Z', to, cc: [] as string[] })

describe('thread status', () => {
  it('an internal forward leaves the client question waiting on TRS', () => {
    const m = [inbound('serene@client.example'), outbound(['operations@trade-risksol.com'])]
    expect(needsOurReply(m)).toBe(true)
  })
  it('a sick-leave auto-reply leaves TRS waiting on the client', () => {
    const sent = outbound(['serene@client.example'])
    const ooo = inbound('sabrina@client.example', 'Hi, Thank you for your email. I am currently on sick leave.')
    expect(needsOurReply([sent, ooo])).toBe(false)
    expect(autoReplyAfter([sent, ooo], lastRealMessage([sent, ooo]))).toBe(ooo)
  })
  it('a real reply counts', () => {
    expect(needsOurReply([outbound(['a@client.example']), inbound('a@client.example')])).toBe(true)
  })
  it('an email to the client counts', () => {
    expect(needsOurReply([inbound('a@client.example'), outbound(['a@client.example'])])).toBe(false)
  })
})

describe('chaseDueOn', () => {
  it('insurer: five working days, skipping weekends and the Deepavali Monday', () => {
    expect(chaseDueOn('2026-11-06T04:00:00Z', 'insurer')).toBe('2026-11-16')
  })
  it('client: seven days', () => {
    expect(chaseDueOn('2026-11-03T04:00:00Z', 'client')).toBe('2026-11-10')
  })
  it('client: a weekend or holiday moves on to the next working day', () => {
    expect(chaseDueOn('2026-11-02T04:00:00Z', 'client')).toBe('2026-11-10')
    expect(chaseDueOn('2026-11-07T04:00:00Z', 'client')).toBe('2026-11-16')
  })
})

describe('one person in To', () => {
  it('keeps the first address, moves colleagues to Cc, removes other companies', () => {
    expect(oneRecipient('a@eq.example, b@eq.example, c@chubb.example', 'd@eq.example')).toEqual({ to: 'a@eq.example', cc: ['b@eq.example', 'd@eq.example'], removed: ['c@chubb.example'] })
  })
  it('flags more than one address typed in To', () => {
    expect(toProblem('a@eq.example')).toBeNull()
    expect(toProblem('a@eq.example; b@chubb.example')).toMatch(/one address/)
    expect(addressesIn('a@x.example b@y.example')).toHaveLength(2)
  })
  it('a request to several insurers copies only TRS', () => {
    const rows = cloneRows({ id: 'd', contact_id: 'c', thread_id: null, cc: ['ops@trade-risksol.com', 'x@chubb.example'] },
      [{ id: '1', to_email: 'a@eq.example, b@chubb.example', insurer_contact_id: 'k', insurer_name: 'EQ' }], { subject: 's', body: 'b' })
    expect(rows[0].to_email).toBe('a@eq.example')
    expect(rows[0].cc).toEqual(['ops@trade-risksol.com'])
  })
})
