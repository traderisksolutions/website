/**
 * Employment benefits on a placement line, the pure edges: which covers a spec's words ask
 * for, which tier an insurer sits in, and the census as an email table. No database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sbTry = vi.fn()
vi.mock('@/lib/crm/db', () => ({ sbTry: (...a: unknown[]) => sbTry(...a), enc: encodeURIComponent, sb: vi.fn(), inChunks: vi.fn() }))
vi.mock('@/lib/gb/draft', () => ({ draftQuotation: vi.fn(), DraftError: class extends Error {} }))
vi.mock('@/lib/placement/workflow', () => ({ openRounds: vi.fn() }))
vi.mock('@/lib/placement/store', () => ({}))

import { censusSummary, coversFromSpec, resolveTier, tierOf, TIER_A_INSURERS } from '@/lib/placement/eb'

beforeEach(() => { sbTry.mockReset() })

describe('coversFromSpec', () => {
  it('defaults to GHS when the spec names no cover', () => {
    expect(coversFromSpec({})).toEqual([{ code: 'GHS' }])
    expect(coversFromSpec({ insured: 'ACME Pte Ltd, 15 staff' })).toEqual([{ code: 'GHS' }])
    expect(coversFromSpec(null)).toEqual([{ code: 'GHS' }])
  })

  it('reads the cover words in canonical order', () => {
    const covers = coversFromSpec({ scope: 'Dental, term life and hospital & surgical for all staff', extras: 'outpatient GP visits; specialist' })
    expect(covers.map(c => c.code)).toEqual(['GHS', 'GTL', 'GOPC', 'GOSC', 'GD'])
  })

  it('reads abbreviations', () => {
    expect(coversFromSpec({ scope: 'GHS, GTL, GCI, GPA' }).map(c => c.code)).toEqual(['GHS', 'GTL', 'GCI', 'GPA'])
  })

  it('puts private hospital and ward on hospital cover only', () => {
    const covers = coversFromSpec({ scope: 'Hospital & surgical, private hospital ward B1; personal accident' })
    expect(covers).toEqual([{ code: 'GHS', hospital: 'private', ward: 2 }, { code: 'GPA' }])
  })

  it('reads ward A and B2 as 1 and 4 beds, and "4-bedded" by number', () => {
    expect(coversFromSpec({ scope: 'GHS government ward A' })[0]).toEqual({ code: 'GHS', hospital: 'government', ward: 1 })
    expect(coversFromSpec({ scope: 'GHS ward B2' })[0]).toEqual({ code: 'GHS', ward: 4 })
    expect(coversFromSpec({ scope: 'GHS 4-bedded private' })[0]).toEqual({ code: 'GHS', hospital: 'private', ward: 4 })
  })

  it('reads the sum assured beside the cover, in S$100k style', () => {
    const covers = coversFromSpec({ scope: 'Group term life S$100k per employee and critical illness at $50,000', limit: 'S$1M' })
    expect(covers).toEqual([{ code: 'GTL', sumAssured: 100_000 }, { code: 'GCI', sumAssured: 50_000 }])
  })

  it('takes the Limit field as the sum only when one sum cover is asked', () => {
    expect(coversFromSpec({ scope: 'term life', limit: 'S$200,000' })).toEqual([{ code: 'GTL', sumAssured: 200_000 }])
    const two = coversFromSpec({ scope: 'term life and personal accident', limit: 'S$200,000' })
    expect(two).toEqual([{ code: 'GTL' }, { code: 'GPA' }])
  })

  it('adds GHS under a maternity rider asked alone', () => {
    expect(coversFromSpec({ extras: 'maternity' }).map(c => c.code)).toEqual(['GHS', 'EMM'])
  })
})

describe('tierOf', () => {
  it('names the five Tier A insurers under any corporate spelling', () => {
    expect(TIER_A_INSURERS).toEqual(['Income', 'AIA', 'Raffles Health', 'QBE', 'Singlife'])
    for (const n of ['Income Insurance Limited', 'NTUC Income', 'AIA Singapore Pte Ltd', 'Raffles Health Insurance', 'QBE Insurance (Singapore)', 'Singlife']) {
      expect(tierOf(n), n).toBe('A')
    }
  })

  it('is C for Cigna until a Cigna rate table is approved, then B', () => {
    expect(tierOf('Cigna Europe Insurance Company S.A.-N.V.', [])).toBe('C')
    expect(tierOf('Cigna Europe Insurance Company S.A.-N.V.', ['Income Insurance Limited'])).toBe('C')
    expect(tierOf('Cigna', ['Cigna Care Connect 1.0'])).toBe('B')
  })

  it('is C for every other insurer, with or without rate tables', () => {
    expect(tierOf('April International', ['April International'])).toBe('C')
    expect(tierOf('Great Eastern General Insurance')).toBe('C')
    expect(tierOf('')).toBe('C')
    expect(tierOf(null)).toBe('C')
  })

  it('resolveTier reads the approved rate tables', async () => {
    sbTry.mockResolvedValueOnce([{ insurer_name: 'Cigna Europe' }, { insurer_name: 'AIA Singapore' }])
    expect(await resolveTier('Cigna')).toBe('B')
    expect(sbTry).toHaveBeenCalledWith('gb_rate_tables?status=eq.approved&select=insurer_name', [])
    sbTry.mockResolvedValueOnce([])
    expect(await resolveTier('Cigna')).toBe('C')
  })
})

describe('censusSummary', () => {
  it('lays the list out as a padded table with a count line', () => {
    const text = censusSummary([
      { name: 'Tan Ah Kow', category: 'Manager', relationship: 'self', dob: '1980-03-12' },
      { name: 'Lim Mei', category: 'Manager', relationship: 'spouse', dob: '1982-07-01' },
      { name: 'Ravi', category: 'Staff', relationship: 'self', dob: null, age: 41 },
    ])
    const lines = text.split('\n')
    expect(lines[0]).toBe('Employee list (3 lives: 2 employees, 1 dependants)')
    expect(lines[2]).toBe('Name        Relationship  Date of birth  Category')
    expect(lines[3]).toBe('----------  ------------  -------------  --------')
    expect(lines[4]).toBe('Tan Ah Kow  Employee      1980-03-12     Manager')
    expect(lines[5]).toBe('Lim Mei     Spouse        1982-07-01     Manager')
    expect(lines[6]).toBe('Ravi        Employee      age 41         Staff')
  })

  it('handles an empty list', () => {
    expect(censusSummary([]).split('\n')[0]).toBe('Employee list (0 lives: 0 employees, 0 dependants)')
  })
})
