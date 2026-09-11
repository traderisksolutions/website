import { describe, it, expect } from 'vitest'
import { suggestStage, isStage } from '@/lib/crm/stage'

const facts = {
  activePolicies: 0, nextRenewalDate: null, openQuotes: 0, openThreads: 0,
  lastActivityAt: null, openDebitNotes: 0, totalDebitNotes: 0, lastBillingDate: null as string | null,
}
const today = '2026-09-10'
const recent = '2026-08-01'

describe('suggestStage', () => {
  it('returns null when the current stage already fits', () => {
    expect(suggestStage({ ...facts, activePolicies: 1 }, 'client', today)).toBeNull()
    expect(suggestStage({ ...facts, openQuotes: 1 }, 'quoting', today)).toBeNull()
  })

  it('treats an active policy or any billing history as proof of being a client', () => {
    expect(suggestStage({ ...facts, activePolicies: 1 }, 'prospect', today)).toBe('client')
    expect(suggestStage({ ...facts, totalDebitNotes: 1, lastBillingDate: recent }, 'prospect', today)).toBe('client')
  })

  it('keeps a client who has paid everything — paid history still counts', () => {
    // The regression this guards: openDebitNotes is 0 because they always pay on time.
    const paidUpClient = { ...facts, openDebitNotes: 0, totalDebitNotes: 4, lastBillingDate: recent }
    expect(suggestStage(paidUpClient, 'client', today)).toBeNull()
    expect(suggestStage(paidUpClient, 'prospect', today)).toBe('client')
  })

  it('suggests renewal due inside the 60-day window and client outside it', () => {
    expect(suggestStage({ ...facts, activePolicies: 1, nextRenewalDate: '2026-10-20' }, 'client', today)).toBe('renewal_due')
    expect(suggestStage({ ...facts, activePolicies: 1, nextRenewalDate: '2027-03-01' }, 'renewal_due', today)).toBe('client')
  })

  it('suggests quoting when a quote is open', () => {
    expect(suggestStage({ ...facts, openQuotes: 2 }, 'client', today)).toBe('quoting')
  })

  it('never suggests lead or prospect — those belong to sales outreach, which is not connected', () => {
    // Anyone already in our mail is a client, whatever else we do or do not know about them.
    expect(suggestStage({ ...facts, openThreads: 3, lastActivityAt: '2026-09-01T00:00:00Z' }, 'lead', today)).toBe('client')
    expect(suggestStage({ ...facts, openThreads: 3, lastActivityAt: '2026-09-01T00:00:00Z' }, 'prospect', today)).toBe('client')
    expect(suggestStage({ ...facts, totalDebitNotes: 1, lastBillingDate: recent }, 'lead', today)).toBe('client')
    // A company with nothing at all is still dormant, whatever it was called before.
    expect(suggestStage(facts, 'prospect', today)).toBe('lapsed')
  })

  it('never demotes a client', () => {
    expect(suggestStage({ ...facts, openThreads: 1, lastActivityAt: '2026-09-01T00:00:00Z' }, 'client', today)).toBeNull()
    expect(suggestStage({ ...facts, openThreads: 1, lastActivityAt: '2026-09-01T00:00:00Z' }, 'renewal_due', today)).toBe('client')
  })

  it('suggests lapsed only for real dormancy: no policy, no recent billing, no recent talk', () => {
    expect(suggestStage(facts, 'client', today)).toBe('lapsed')
    const longQuiet = { ...facts, totalDebitNotes: 3, lastBillingDate: '2024-01-01', lastActivityAt: '2024-02-01T00:00:00Z', openThreads: 1 }
    expect(suggestStage(longQuiet, 'client', today)).toBe('lapsed')
  })

  it('does not lapse a client billed within the dormancy window', () => {
    const billedLastYear = { ...facts, totalDebitNotes: 2, lastBillingDate: '2025-12-30', lastActivityAt: null }
    expect(suggestStage(billedLastYear, 'client', today)).toBeNull()
  })

  it('an active policy alone prevents lapsing however quiet things are', () => {
    expect(suggestStage({ ...facts, activePolicies: 1, lastBillingDate: '2020-01-01', lastActivityAt: '2020-01-01T00:00:00Z' }, 'client', today)).toBeNull()
  })
})

describe('isStage', () => {
  it('accepts only the six known stages', () => {
    expect(isStage('client')).toBe(true)
    expect(isStage('renewal_due')).toBe(true)
    expect(isStage('customer')).toBe(false)
    expect(isStage(null)).toBe(false)
  })
})
