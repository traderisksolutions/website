import { describe, expect, it } from 'vitest'
import { isoDay, periodRanges, rowsFrom, siteTraffic } from '@/lib/marketing/ga4'
import { isPeriod } from '@/lib/marketing/ga4-types'

describe('Google Analytics reader', () => {
  it('ends every period yesterday and compares with the same number of days before', () => {
    const { range, previous } = periodRanges('d28', new Date('2026-11-20T03:00:00Z'))
    expect(range).toEqual({ start: '2026-10-23', end: '2026-11-19' })
    expect(previous).toEqual({ start: '2026-09-25', end: '2026-10-22' })
    const week = periodRanges('d7', new Date('2026-03-01T00:00:00Z'))
    expect(week.range).toEqual({ start: '2026-02-22', end: '2026-02-28' })
  })

  it('reads report rows, turning counts that do not parse into 0', () => {
    expect(rowsFrom([{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '12' }, { value: '9' }, { value: 'x' }] }]))
      .toEqual([{ key: 'Organic Search', sessions: 12, users: 9, engagedSessions: 0 }])
    expect(rowsFrom([{ metricValues: [{ value: '-3' }] }])).toEqual([{ key: '', sessions: 0, users: 0, engagedSessions: 0 }])
    expect(rowsFrom(undefined)).toEqual([])
  })

  it('writes GA4 dates as ISO days and leaves anything else alone', () => {
    expect(isoDay('20261109')).toBe('2026-11-09')
    expect(isoDay('(other)')).toBe('(other)')
  })

  it('accepts only the five periods', () => {
    expect(isPeriod('d28')).toBe(true)
    expect(isPeriod('d30')).toBe(false)
    expect(isPeriod(null)).toBe(false)
  })

  it('answers not connected for a website with no tag, without calling Google', async () => {
    const r = await siteTraffic('nosuchsite', 'd28')
    expect(r).toMatchObject({ status: 'not_connected', measurementId: null })
  })
})
