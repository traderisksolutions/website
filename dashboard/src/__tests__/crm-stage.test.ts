import { describe, it, expect } from 'vitest'
import { suggestStage, isStage } from '@/lib/crm/stage'

const facts = { activePolicies: 0, nextRenewalDate: null, openQuotes: 0, openThreads: 0, lastActivityAt: null, openDebitNotes: 0 }
const today = '2026-09-10'

describe('suggestStage', () => {
  it('returns null when the current stage already fits', () => {
    expect(suggestStage({ ...facts, activePolicies: 1 }, 'client', today)).toBeNull()
    expect(suggestStage({ ...facts, openQuotes: 1 }, 'quoting', today)).toBeNull()
    expect(suggestStage(facts, 'lead', today)).toBeNull()
  })

  it('suggests client once a policy or debit note exists', () => {
    expect(suggestStage({ ...facts, activePolicies: 1 }, 'prospect', today)).toBe('client')
    expect(suggestStage({ ...facts, openDebitNotes: 1 }, 'quoting', today)).toBe('client')
  })

  it('suggests renewal due inside the 60-day window and client outside it', () => {
    expect(suggestStage({ ...facts, activePolicies: 1, nextRenewalDate: '2026-10-20' }, 'client', today)).toBe('renewal_due')
    expect(suggestStage({ ...facts, activePolicies: 1, nextRenewalDate: '2027-03-01' }, 'renewal_due', today)).toBe('client')
  })

  it('suggests quoting when a quote is open and prospect when only threads exist', () => {
    expect(suggestStage({ ...facts, openQuotes: 2 }, 'lead', today)).toBe('quoting')
    expect(suggestStage({ ...facts, openThreads: 3, lastActivityAt: '2026-09-01T00:00:00Z' }, 'lead', today)).toBe('prospect')
  })

  it('never demotes a client to lead or prospect', () => {
    expect(suggestStage({ ...facts, openThreads: 1, lastActivityAt: '2026-09-01T00:00:00Z' }, 'client', today)).toBeNull()
  })

  it('suggests lapsed for a client with no policy and nothing going on', () => {
    expect(suggestStage(facts, 'client', today)).toBe('lapsed')
    expect(suggestStage({ ...facts, openThreads: 1, lastActivityAt: '2025-12-01T00:00:00Z' }, 'renewal_due', today)).toBe('lapsed')
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
