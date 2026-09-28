import { describe, it, expect } from 'vitest'
import { renewalBucket, renewalText, inRenewalWindow } from '@/lib/crm/renewal'

const today = '2026-09-28'

describe('renewalBucket — the bands Companies, the drawer and Calendar all use', () => {
  it('puts a date before today in overdue unless the policy is marked renewed', () => {
    expect(renewalBucket('2026-09-27', today)).toBe('overdue')
    expect(renewalBucket('2026-09-27', today, 'renewed')).toBe('renewed')
  })
  it('bands are mutually exclusive and inclusive of their upper edge', () => {
    expect(renewalBucket('2026-09-28', today)).toBe('within_7')   // today
    expect(renewalBucket('2026-10-05', today)).toBe('within_7')   // +7
    expect(renewalBucket('2026-10-06', today)).toBe('within_30')  // +8
    expect(renewalBucket('2026-10-28', today)).toBe('within_30')  // +30
    expect(renewalBucket('2026-10-29', today)).toBe('within_60')  // +31
    expect(renewalBucket('2026-11-27', today)).toBe('within_60')  // +60
    expect(renewalBucket('2026-11-28', today)).toBe('within_90')  // +61
    expect(renewalBucket('2026-12-27', today)).toBe('within_90')  // +90
    expect(renewalBucket('2026-12-28', today)).toBe('beyond_90')  // +91
    expect(renewalBucket(null, today)).toBe('no_date')
  })
})

describe('inRenewalWindow — the cumulative tabs', () => {
  it('"within 30 days" includes the 7-day ones, as the hint text promises', () => {
    expect(inRenewalWindow('2026-09-30', today, 'w30')).toBe(true)
    expect(inRenewalWindow('2026-09-30', today, 'w7')).toBe(true)
    expect(inRenewalWindow('2026-10-20', today, 'w7')).toBe(false)
    expect(inRenewalWindow('2026-10-20', today, 'w30')).toBe(true)
  })
  it('overdue and no-date are their own tabs, and never leak into the windows', () => {
    expect(inRenewalWindow('2026-09-01', today, 'w90')).toBe(false)
    expect(inRenewalWindow('2026-09-01', today, 'overdue')).toBe(true)
    expect(inRenewalWindow(null, today, 'w90')).toBe(false)
    expect(inRenewalWindow(null, today, 'none')).toBe(true)
    expect(inRenewalWindow(null, today, 'all')).toBe(true)
  })
})

describe('renewalText', () => {
  it('reads the way a broker would say it', () => {
    expect(renewalText('2026-09-28', today)).toBe('Due today')
    expect(renewalText('2026-09-29', today)).toBe('Due tomorrow')
    expect(renewalText('2026-12-31', today)).toBe('Due in 94 days')
    expect(renewalText('2026-09-16', today)).toBe('12 days overdue')
    expect(renewalText(null, today)).toBe('No renewal date')
  })
})
