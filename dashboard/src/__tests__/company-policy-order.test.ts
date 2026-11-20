import { describe, it, expect } from 'vitest'
import { byRenewal, renewsIn } from '@/lib/companies/policy-order'
import { nameProbe } from '@/lib/crm/find-threads'

describe('Policies tab renewal order', () => {
  it('puts policies in force first, soonest end date first', () => {
    const rows = [
      { id: 'closed', lifecycle: 'closed', start_date: '2026-06-01', end_date: '2026-01-01' },
      { id: 'late', lifecycle: 'live', start_date: '2026-01-01', end_date: '2027-03-01' },
      { id: 'soon', lifecycle: 'renewal_due', start_date: '2025-12-01', end_date: '2026-12-01' },
    ]
    expect(byRenewal(rows).map(r => r.id)).toEqual(['soon', 'late', 'closed'])
  })
  it('names the days to renewal for a policy in force only', () => {
    expect(renewsIn({ lifecycle: 'live', end_date: '2026-12-01' }, '2026-11-20')).toBe('in 11 days')
    expect(renewsIn({ lifecycle: 'live', end_date: '2026-11-19' }, '2026-11-20')).toBe('ended 1 day ago')
    expect(renewsIn({ lifecycle: 'closed', end_date: '2026-12-01' }, '2026-11-20')).toBeNull()
  })
})

describe('find threads by name', () => {
  it('drops the legal suffix', () => {
    expect(nameProbe('Acme Engineering Pte. Ltd.')).toBe('Acme Engineering')
    expect(nameProbe('AB Pte Ltd')).toBeNull()
  })
})
