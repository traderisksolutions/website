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
