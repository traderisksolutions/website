import { describe, it, expect } from 'vitest'
import { relevanceOf, renewalSeason, shownIn, daysBetween } from '../relevance'

const today = '2026-11-15'

describe('relevanceOf', () => {
  it('puts additions, deletions and endorsements in member movements whatever their age', () => {
    expect(relevanceOf({ lastMessageAt: '2026-01-02T00:00:00Z', label: 'member_movement', onOpenCase: false }, today)).toBe('member_movements')
    expect(relevanceOf({ lastMessageAt: '2026-11-14T00:00:00Z', label: 'endorsement', onOpenCase: true }, today)).toBe('member_movements')
  })
  it('is active only on an open case and within 90 days', () => {
    expect(relevanceOf({ lastMessageAt: '2026-11-01T08:00:00Z', label: 'renewal', onOpenCase: true }, today)).toBe('active')
    expect(relevanceOf({ lastMessageAt: '2026-11-01T08:00:00Z', label: 'renewal', onOpenCase: false }, today)).toBe('back_burner')
    expect(relevanceOf({ lastMessageAt: '2026-07-01T08:00:00Z', label: 'claim', onOpenCase: true }, today)).toBe('back_burner')
    expect(relevanceOf({ lastMessageAt: null, label: null, onOpenCase: true }, today)).toBe('back_burner')
  })
  it('counts day 90 as active and day 91 as back burner', () => {
    expect(daysBetween('2026-08-17', today)).toBe(90)
    expect(relevanceOf({ lastMessageAt: '2026-08-17T23:00:00Z', label: 'other', onOpenCase: true }, today)).toBe('active')
    expect(relevanceOf({ lastMessageAt: '2026-08-16T23:00:00Z', label: 'other', onOpenCase: true }, today)).toBe('back_burner')
  })
})

describe('renewalSeason', () => {
  it('is on when a policy ends within 90 days, with the nearest date', () => {
    expect(renewalSeason({ openRenewalCases: [], policyEnds: ['2027-06-30', '2026-12-31', '2026-12-01', null] }, today)).toEqual({ on: true, basis: 'policy ends', date: '2026-12-01' })
  })
  it('is on when a renewal case is open', () => {
    expect(renewalSeason({ openRenewalCases: [{ title: 'EB renewal', deadline: '2027-03-01T00:00:00Z' }], policyEnds: ['2027-03-01'] }, today)).toEqual({ on: true, basis: 'renewal case open', date: '2027-03-01' })
  })
  it('is off otherwise, and ignores policies already ended', () => {
    expect(renewalSeason({ openRenewalCases: [], policyEnds: ['2026-10-31', '2027-06-30'] }, today)).toEqual({ on: false, basis: null, date: null })
  })
})

describe('shownIn', () => {
  it('shows only active in renewal season', () => {
    expect(shownIn('renewal_season', 'active')).toBe(true)
    expect(shownIn('renewal_season', 'back_burner')).toBe(false)
    expect(shownIn('renewal_season', 'member_movements')).toBe(false)
    expect(shownIn('all', 'back_burner')).toBe(true)
  })
})
