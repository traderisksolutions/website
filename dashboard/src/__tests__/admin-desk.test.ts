import { describe, it, expect } from 'vitest'
import { cycleKey, detectCycles } from '@/lib/clients/admin-desk'


describe('admin desk cycles', () => {
  const t = (subject: string, first: string) => ({ subject, first: `${first}T02:00:00Z`, thread_id: first })
  it('a monthly enrolment: the same subject but for the month, three threads', () => {
    const c = detectCycles([t('BCEI: Enrolment for August 2026', '2026-08-12'), t('RE: BCEI: Enrolment for September 2026', '2026-09-11'), t('BCEI: Enrolment for October 2026', '2026-10-13'), t('Claim for Tan', '2026-10-01')])
    expect(c).toEqual([{ label: 'BCEI: Enrolment for October 2026', thread_id: '2026-10-13', type: 'Members and endorsements', count: 3, everyDays: 31, cadence: 'monthly', last: '2026-10-13', next: '2026-11-13' }])
  })
  it('a weekly declaration; two threads are not a cycle', () => {
    const w = ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23'].map(d => t(`Weekly member movement declaration ${d}`, d))
    expect(detectCycles(w)[0]).toMatchObject({ cadence: 'weekly', everyDays: 7, next: '2026-10-30' })
    expect(detectCycles(w.slice(0, 2))).toEqual([])
  })
  it('takes replies, months, dates and bracketed names out of a subject', () => {
    expect(cycleKey('Fwd: RE: (TRS) Aureus [EXTERNAL] Staff movement 12 Nov 2026')).toBe('aureus staff movement')
  })
})
