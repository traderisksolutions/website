import { describe, expect, it } from 'vitest'
import { checkFacts, condenseKey, dateFound, figures, figuresFound, threadState } from './condense'

const SOURCE = `=== THREAD 1 (with the client): Request for Medical, Dental and GTL/GCI Insurance Quotations
--- 2026-10-28T03:12 inbound from Jenny <jenny@client.invalid>
Please obtain 3 quotations for 37 lives. Current premium S$17,120.00 with QBE, policy ends 13 Feb 2027.
--- 2026-11-02T09:00 outbound from nathan@trade-risksol.com
We asked QBE for the claims experience on 2 November.`

describe('dateFound', () => {
  it('finds ISO, day-month and month-day forms', () => {
    expect(dateFound('2026-10-28', SOURCE)).toBe(true)
    expect(dateFound('2027-02-13', SOURCE)).toBe(true)
    expect(dateFound('2026-11-02', SOURCE)).toBe(true)
    expect(dateFound('2026-11-02', 'Sent on Nov 2nd')).toBe(true)
    expect(dateFound('2026-11-02', 'on 02/11/2026')).toBe(true)
  })
  it('a date not written is not found; nonsense is refused', () => {
    expect(dateFound('2026-12-05', SOURCE)).toBe(false)
    expect(dateFound('2026-13-40', SOURCE)).toBe(false)
    expect(dateFound('5 Dec', SOURCE)).toBe(false)
  })
})

describe('figures', () => {
  it('reads figures as plain digits', () => {
    expect(figures('S$17,120.00 for 37 lives')).toEqual(['17120', '37'])
    expect(figuresFound('Premium S$17,120 for 37 lives', SOURCE)).toBe(true)
    expect(figuresFound('Premium S$18,000', SOURCE)).toBe(false)
  })
})

describe('checkFacts', () => {
  it('keeps facts whose dates and figures are in the source, drops the rest', () => {
    const f = checkFacts({
      client_asked: [{ date: '2026-10-28', what: '3 quotations for 37 lives.' }, { date: '2026-10-29', what: 'Dental only' }],
      trs_promised: [{ date: null, what: 'Comparison by 5 Dec' }],
      owed: [{ party: 'QBE', what: 'Claims experience', since: '2026-11-02' }, { party: '', what: 'Census', since: null }],
      next: [{ what: 'Chase QBE', by: 'tomorrow' }, { what: 'Send comparison', by: '2027-02-13' }],
    }, SOURCE)
    expect(f).toEqual([
      { label: 'Client asked', what: '3 quotations for 37 lives', date: '2026-10-28', party: null },
      { label: 'Owed', what: 'Claims experience', date: '2026-11-02', party: 'QBE' },
      { label: 'Next step', what: 'Send comparison', date: '2027-02-13', party: null },
    ])
  })
  it('anything that is not the shape reads as no facts', () => {
    expect(checkFacts(null, SOURCE)).toEqual([])
    expect(checkFacts({ client_asked: 'x' }, SOURCE)).toEqual([])
  })
})

describe('threadState and condenseKey', () => {
  it('changes when a thread gets a new message, not with order', () => {
    const a = threadState([{ threadId: 'x', lastAt: '1' }, { threadId: 'y', lastAt: '2' }])
    expect(threadState([{ threadId: 'y', lastAt: '2' }, { threadId: 'x', lastAt: '1' }])).toBe(a)
    expect(threadState([{ threadId: 'x', lastAt: '1' }, { threadId: 'y', lastAt: '3' }])).not.toBe(a)
  })
  it('keys by row and project without case', () => {
    expect(condenseKey('o|c', 'Dover Drive')).toBe('today_condense:o|c|dover drive')
    expect(condenseKey('o|c', null)).toBe('today_condense:o|c|')
  })
})
