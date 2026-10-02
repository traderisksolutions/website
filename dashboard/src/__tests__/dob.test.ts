/**
 * Every date of birth on the Gembridge census, which is where this went wrong: 10 of 15 members
 * dropped from the quotation, two more priced a year off.
 */
import { describe, it, expect } from 'vitest'
import { parseCalendarDate, ageLastBirthday } from '@/lib/dates/dob'

const ON = { y: 2026, m: 10, d: 1 }   // the quotation's effective date

describe('parseCalendarDate', () => {
  it('reads every Gembridge date of birth day-first, and gets the age the census states', () => {
    const census: [string, number][] = [
      ['24/12/1971', 54], ['12/09/1972', 54], ['19/08/1976', 50], ['25/03/1978', 48], ['20/08/2015', 11],
      ['03/03/1977', 49], ['26/09/1975', 51], ['02/07/1982', 44], ['01/03/2020', 6], ['16/04/2025', 1],
      ['22/07/1988', 38], ['18/04/1990', 36], ['04/10/2018', 7], ['25/11/2019', 6], ['15/08/1974', 52],
    ]
    for (const [dob, age] of census) {
      const d = parseCalendarDate(dob)
      expect(d, dob).not.toBeNull()
      expect(ageLastBirthday(d!, ON), dob).toBe(age)
    }
  })

  it('never reads a slash date month-first', () => {
    expect(parseCalendarDate('12/09/1972')).toEqual({ y: 1972, m: 9, d: 12 })
    expect(parseCalendarDate('04/10/2018')).toEqual({ y: 2018, m: 10, d: 4 })
  })

  it('reads ISO dates, with or without a time', () => {
    expect(parseCalendarDate('1971-12-24')).toEqual({ y: 1971, m: 12, d: 24 })
    expect(parseCalendarDate('1971-12-24T00:00:00.000Z')).toEqual({ y: 1971, m: 12, d: 24 })
  })

  it('accepts the other day-first separators', () => {
    expect(parseCalendarDate('24-12-1971')).toEqual({ y: 1971, m: 12, d: 24 })
    expect(parseCalendarDate('24.12.1971')).toEqual({ y: 1971, m: 12, d: 24 })
    expect(parseCalendarDate('4/7/1990')).toEqual({ y: 1990, m: 7, d: 4 })
  })

  it('refuses rather than guesses', () => {
    expect(parseCalendarDate('31/02/1980')).toBeNull()      // not rolled into March
    expect(parseCalendarDate('24/12/71')).toBeNull()        // two-digit birth year
    expect(parseCalendarDate('12/24/1971')).toBeNull()      // month-first: month 24 does not exist
    expect(parseCalendarDate('December 24 1971')).toBeNull()
    expect(parseCalendarDate('')).toBeNull()
  })

  it('counts a birthday on the effective date as reached', () => {
    expect(ageLastBirthday({ y: 1990, m: 10, d: 1 }, ON)).toBe(36)
    expect(ageLastBirthday({ y: 1990, m: 10, d: 2 }, ON)).toBe(35)
  })
})

import { parseDocumentDate, toIsoDocumentDate, parseBirthDate } from '@/lib/dates/dob'

describe('parseDocumentDate — dates printed on insurer documents', () => {
  it('reads the formats Singapore insurers print', () => {
    expect(toIsoDocumentDate('2-Jun-26')).toBe('2026-06-02')
    expect(toIsoDocumentDate('02 June 2026')).toBe('2026-06-02')
    expect(toIsoDocumentDate('2 Sept 2026')).toBe('2026-09-02')
    expect(toIsoDocumentDate('June 2, 2026')).toBe('2026-06-02')
    expect(toIsoDocumentDate('02/06/2026')).toBe('2026-06-02')
    expect(toIsoDocumentDate('02/06/26')).toBe('2026-06-02')
    expect(toIsoDocumentDate('2026-06-02')).toBe('2026-06-02')
  })
  it('never reads a numeric date month-first', () => {
    expect(toIsoDocumentDate('12/09/2026')).toBe('2026-09-12')
    expect(toIsoDocumentDate('06/13/2026')).toBeNull()   // month 13: a US-format date is refused, not swapped
  })
  it('refuses what it cannot read', () => {
    expect(parseDocumentDate('31-Feb-26')).toBeNull()
    expect(parseDocumentDate('Q3 2026')).toBeNull()
    expect(parseDocumentDate('')).toBeNull()
  })
})

describe('month names', () => {
  it('accepts real names and abbreviations only', () => {
    expect(toIsoDocumentDate('2-Junk-26')).toBeNull()
    expect(toIsoDocumentDate('2-Sept-26')).toBe('2026-09-02')
    expect(toIsoDocumentDate('2 September 2026')).toBe('2026-09-02')
  })
})

describe('parseBirthDate', () => {
  const today = { y: 2026, m: 10, d: 2 }
  it('reads census forms, day first', () => {
    expect(parseBirthDate('5-Jul-87', today)).toEqual({ y: 1987, m: 7, d: 5 })
    expect(parseBirthDate('20-Dec-86', today)).toEqual({ y: 1986, m: 12, d: 20 })
    expect(parseBirthDate('05/07/1987', today)).toEqual({ y: 1987, m: 7, d: 5 })
    expect(parseBirthDate('5 July 1987', today)).toEqual({ y: 1987, m: 7, d: 5 })
  })
  it('puts a two-digit year in the past, never the future', () => {
    expect(parseBirthDate('14-Feb-05', today)).toEqual({ y: 2005, m: 2, d: 14 })
    expect(parseBirthDate('14-Feb-30', today)).toEqual({ y: 1930, m: 2, d: 14 })
    expect(parseBirthDate('03/11/26', today)).toEqual({ y: 1926, m: 11, d: 3 })
  })
  it('refuses what it cannot read', () => {
    expect(parseBirthDate('09-31-1980', today)).toBeNull()
    expect(parseBirthDate('', today)).toBeNull()
  })
})
