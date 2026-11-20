import { describe, expect, it } from 'vitest'
import { conversationsOf, subjectRoot, type ConvMessage } from '@/lib/mail/conversations'

const insurerOf = (d: string) => (d === 'chubb.com' ? 'Chubb' : null)
const isTrs = (e: string) => e.endsWith('@trade-risksol.com')
const m = (subject: string, from: string, at: string, direction = 'inbound', thread = 't1'): ConvMessage => ({ thread_id: thread, subject, from_address: from, direction, sent_at: at })

describe('subjectRoot', () => {
  it('drops reply, forward and external marks', () => {
    expect(subjectRoot('RE: [EXTERNAL] Re:  (TRS) Chubb - Deluge (Annual Travel)')).toBe('(TRS) Chubb - Deluge (Annual Travel)')
    expect(subjectRoot('Fwd: Manfred: Deluge Annual Travel Insurance')).toBe('Manfred: Deluge Annual Travel Insurance')
    expect(subjectRoot('Manfred: Deluge Annual Travel Insurance')).toBe('Manfred: Deluge Annual Travel Insurance')
    expect(subjectRoot('Automatic reply: (TRS) ECICS - CCCC (Dover Show Flat CAR)')).toBe('(TRS) ECICS - CCCC (Dover Show Flat CAR)')
    expect(subjectRoot('Out of Office: RE: Quote')).toBe('Quote')
  })
})

describe('conversationsOf', () => {
  it('splits a client conversation and an insurer conversation filed under one thread', () => {
    const msgs = [
      m('Manfred: Deluge Annual Travel Insurance', 'manfredhan@awfa.com.sg', '2026-10-19T06:23'),
      m('Re: Manfred: Deluge Annual Travel Insurance', 'nathan.budiutomo@trade-risksol.com', '2026-10-19T08:08', 'outbound'),
      m('Fwd: Manfred: Deluge Annual Travel Insurance', 'chengsou.tan@trade-risksol.com', '2026-11-05T06:55', 'outbound'),
      m('(TRS) Chubb - Deluge (Annual Travel)', 'chengsou.tan@trade-risksol.com', '2026-11-05T07:02', 'outbound'),
      m('RE: [EXTERNAL] Re: (TRS) Chubb - Deluge (Annual Travel)', 'Jiaqing.Wang@chubb.com', '2026-11-06T07:05'),
      m('Re: Manfred: Deluge Annual Travel Insurance', 'manfredhan@awfa.com.sg', '2026-11-10T04:06'),
      m('RE: [EXTERNAL] Re:  (TRS) Chubb - Deluge (Annual Travel)', 'Jiaqing.Wang@chubb.com', '2026-11-18T23:20'),
    ]
    const names = (e: string) => (e === 'jiaqing.wang@chubb.com' ? 'Jiaqing Wang' : null)
    const [client, insurer] = conversationsOf(msgs, insurerOf, isTrs, names).get('t1')!
    expect(client).toMatchObject({ subject: 'Manfred: Deluge Annual Travel Insurance', side: 'client', insurer: null, people: ['manfredhan@awfa.com.sg'], count: 4 })
    expect(insurer).toMatchObject({ subject: '(TRS) Chubb - Deluge (Annual Travel)', side: 'insurer', insurer: 'Chubb', people: ['Jiaqing Wang'], count: 3, last: '2026-11-18T23:20' })
  })

  it('leaves a thread with one conversation out, and marks a TRS-only conversation with no side', () => {
    const one = conversationsOf([m('Quote', 'a@client.sg', '1'), m('Re: Quote', 'b@trade-risksol.com', '2', 'outbound')], insurerOf, isTrs)
    expect(one.size).toBe(0)
    const two = conversationsOf([m('Quote', 'a@client.sg', '1'), m('Internal note', 'b@trade-risksol.com', '2', 'outbound')], insurerOf, isTrs).get('t1')!
    expect(two.map(c => c.side)).toEqual(['client', null])
  })
})
