import { describe, it, expect } from 'vitest'
import { money, num, fmtDate, fmtDay, fmtDateTime, timeAgo, DASH } from './format'

describe('money', () => {
  it('SGD as S$ with two decimals and a kept sign', () => {
    expect(money(1234.5)).toBe('S$1,234.50')
    expect(money(-1234.5)).toBe('-S$1,234.50')
    expect(money(0)).toBe('S$0.00')
  })
  it('other currencies by code, decimals by option, null as a dash', () => {
    expect(money(1234.5, { ccy: 'USD' })).toBe('USD 1,234.50')
    expect(money(1234.5, { dp: 0 })).toBe('S$1,235')
    expect(money(null)).toBe(DASH)
    expect(money(null, { empty: '' })).toBe('')
    expect(money(Number.NaN)).toBe(DASH)
  })
})

describe('num', () => {
  it('fixed decimals, no currency', () => {
    expect(num(1234.5)).toBe('1,234.50')
    expect(num(1234.5, 0)).toBe('1,235')
    expect(num(undefined)).toBe(DASH)
  })
})

describe('dates', () => {
  it('Singapore time: 16:30 UTC on the 23rd is 00:30 on the 24th', () => {
    expect(fmtDate('2026-12-23T16:30:00Z')).toBe('24 Dec 2026')
    expect(fmtDay('2026-12-23T16:30:00Z')).toBe('24 Dec')
    expect(fmtDateTime('2026-12-23T16:30:00Z')).toBe('24 Dec 2026 00:30')
  })
  it('plain dates and bad input', () => {
    expect(fmtDate('2026-01-05')).toBe('5 Jan 2026')
    expect(fmtDate(null)).toBe(DASH)
    expect(fmtDate('not a date', '')).toBe('')
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-12-24T04:00:00Z')
  it('minutes, hours, days, then the date', () => {
    expect(timeAgo('2026-12-24T03:59:30Z', DASH, now)).toBe('just now')
    expect(timeAgo('2026-12-24T03:15:00Z', DASH, now)).toBe('45m ago')
    expect(timeAgo('2026-12-23T20:00:00Z', DASH, now)).toBe('8h ago')
    expect(timeAgo('2026-12-21T04:00:00Z', DASH, now)).toBe('3d ago')
    expect(timeAgo('2026-12-01T04:00:00Z', DASH, now)).toBe('1 Dec')
    expect(timeAgo(null)).toBe(DASH)
  })
})
