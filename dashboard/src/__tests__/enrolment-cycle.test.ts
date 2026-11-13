import { describe, it, expect } from 'vitest'
import { classify, clientReminder, insurerChase, pendingSubmissions, workingDaysBetween, type CycleMessage } from '@/lib/clients/enrolment-cycle'

const sides = { client: new Set(['client.example']), insurer: new Set(['insurer.example']) }
const msg = (o: Partial<CycleMessage>): CycleMessage => ({ id: 'm', thread_id: 't1', direction: 'inbound', from: 'hr@client.example', sent_at: '2026-11-02T02:00:00Z', has_attachments: true, subject: 'Acme: Enrolment for November 2026', body: 'Dear Team, please find attached the enrolment of new members.', to: ['eligibility@insurer.example'], ...o })

describe('enrolment cycles', () => {
  it('tells a submission from a confirmation; TRS mail and attachment-free notes are neither', () => {
    expect(classify(msg({}), sides)).toBe('submission')
    expect(classify(msg({ from: 'eligibility@insurer.example', has_attachments: false, body: 'I am pleased to confirm the enrolment of the below new member.' }), sides)).toBe('confirmation')
    expect(classify(msg({ has_attachments: false }), sides)).toBeNull()
    expect(classify(msg({ direction: 'outbound' }), sides)).toBeNull()
  })
  it('counts working days, weekends out', () => {
    expect(workingDaysBetween('2026-11-06', '2026-11-13')).toBe(5)          // Friday to Friday
    expect(workingDaysBetween('2026-11-07', '2026-11-09')).toBe(1)          // Saturday to Monday
  })
  it('a submission is pending until the insurer confirms after it, from 5 working days', () => {
    const sub = msg({ id: 's1' })
    expect(pendingSubmissions([sub], sides, '2026-11-06')).toEqual([])          // 4 working days
    expect(pendingSubmissions([sub], sides, '2026-11-09').map(m => m.id)).toEqual(['s1'])
    const conf = msg({ id: 'c1', from: 'eligibility@insurer.example', has_attachments: false, sent_at: '2026-11-04T02:00:00Z', body: 'pleased to confirm the enrolment' })
    expect(pendingSubmissions([sub, conf], sides, '2026-11-20')).toEqual([])
    // Confirmed on its own thread; and an old month is not chased.
    expect(pendingSubmissions([sub, { ...conf, thread_id: 't2' }], sides, '2026-11-20')).toEqual([])
    expect(pendingSubmissions([sub], sides, '2026-12-10')).toEqual([])
  })
  it('writes the chase and the reminder in plain words', () => {
    const c = insurerChase('Acme Pte Ltd', msg({}))
    expect(c.subject).toBe('RE: Acme: Enrolment for November 2026')
    expect(c.body).toContain('On 2 November 2026, Acme Pte Ltd sent the enrolment in "Acme: Enrolment for November 2026"')
    const r = clientReminder('Acme Pte Ltd', 'Jane', '2026-12-02', msg({}))
    expect(r.subject).toBe('Acme Pte Ltd: enrolment for December 2026')
    expect(r.body).toContain('Dear Jane,')
  })
})
