import { describe, it, expect } from 'vitest'
import { categoryFor, buildMembers, alignLines, avgPerLife, toInsurerResult } from '@/lib/pm-quote'
import type { InsurerResult } from '@/lib/pm-quote'

const CODES = ['HS', 'OPGP']
const LINES = [{ code: 'HS', label: 'Hospital & Surgical' }, { code: 'OPGP', label: 'Outpatient GP' }]

describe('categoryFor', () => {
  it('derives Employee from Self and Dependent otherwise', () => {
    expect(categoryFor({ relationship: 'Self' })).toBe('Employee')
    expect(categoryFor({ relationship: 'Spouse' })).toBe('Dependent')
    expect(categoryFor({ relationship: 'Child' })).toBe('Dependent')
    expect(categoryFor({})).toBe('Employee')            // default Self
    expect(categoryFor({ category: 'Exec' })).toBe('Exec') // explicit wins
  })
})

describe('buildMembers', () => {
  const census = [
    { name: 'Jane', relationship: 'Self', date_of_birth: '1985-01-01' },
    { name: 'Baby', relationship: 'Child', age: 3 },
    { name: '', relationship: 'Self' },   // blank -> dropped
  ]
  const selection = { HS: { plan: 'Plan 1', hospital: 'Private Hospital', beds: '1-bedded', coinsurance: '0%' }, OPGP: { plan: 'Plan 1' } }

  it('applies the selection to every named life and derives category', () => {
    const m = buildMembers(census, selection, CODES)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ name: 'Jane', category: 'Employee', coverage: { HS: { plan: 'Plan 1' }, OPGP: { plan: 'Plan 1' } } })
    expect(m[1]).toMatchObject({ name: 'Baby', category: 'Dependent', age: 3 })
  })

  it('omits coverage lines with no selection', () => {
    const m = buildMembers([{ name: 'X' }], { OPGP: { plan: 'Plan 2' } }, CODES)
    expect(m[0].coverage).toEqual({ OPGP: { plan: 'Plan 2' } })
    expect(m[0].coverage.HS).toBeUndefined()
  })

  it('applies a category override only to matching members, per coverage code, falling back to default elsewhere', () => {
    const mixedCensus = [
      { name: 'Boss', relationship: 'Self', age: 45, employee_category: 'Management' },
      { name: 'Staffer', relationship: 'Self', age: 30, employee_category: 'Employee' },
      { name: 'Untagged', relationship: 'Self', age: 35 },
    ]
    const categoryOverrides = { Management: { HS: { plan: 'Plan Elite' } } }   // OPGP left unset -> inherits default
    const m = buildMembers(mixedCensus, selection, CODES, categoryOverrides)
    expect(m[0].coverage).toEqual({ HS: { plan: 'Plan Elite' }, OPGP: { plan: 'Plan 1' } })   // Management: HS overridden, OPGP default
    expect(m[1].coverage).toEqual({ HS: { plan: 'Plan 1', hospital: 'Private Hospital', beds: '1-bedded', coinsurance: '0%' }, OPGP: { plan: 'Plan 1' } })
    expect(m[2].coverage).toEqual(m[1].coverage)   // untagged member prices identically to a category with no override
  })
})

describe('avgPerLife', () => {
  it('divides and rounds, guards zero/null', () => {
    expect(avgPerLife(1000, 4)).toBe(250)
    expect(avgPerLife(1000, 3)).toBe(333.33)
    expect(avgPerLife(null, 4)).toBeNull()
    expect(avgPerLife(1000, 0)).toBeNull()
  })
})

describe('toInsurerResult + alignLines', () => {
  const run = { members: [{ row: 16, name: 'Jane', lines: { HS: 1706.88, OPGP: 413 }, subtotal: 2119.88 }], totals: { by_line: { HS: 1706.88, OPGP: 413 }, grand: 2119.88 } }

  it('shapes one insurer result with avg/life', () => {
    const r = toInsurerResult('c1', 'Steadfast', '2026-05-20', LINES, run)
    expect(r.grand).toBe(2119.88)
    expect(r.member_count).toBe(1)
    expect(r.avg_per_life).toBe(2119.88)
    expect(r.coverage_lines).toEqual([{ code: 'HS', label: 'Hospital & Surgical' }, { code: 'OPGP', label: 'Outpatient GP' }])
  })

  it('aligns lines across insurers by normalised label, mapping each insurer code', () => {
    const a = toInsurerResult('c1', 'A', null, LINES, run)
    const b: InsurerResult = {
      calculator_id: 'c2', insurer_name: 'B', effective_date: null,
      coverage_lines: [{ code: 'HOSP', label: 'hospital & surgical' }, { code: 'DENT', label: 'Dental' }],
      by_line: {}, grand: null, member_count: 1, avg_per_life: null, members: [],
    }
    const rows = alignLines([a, b])
    // H&S collapses to one row (case/punctuation-insensitive) mapping each insurer's own code.
    const hs = rows.find(r => r.key === 'hospital surgical')!
    expect(hs.per_insurer).toEqual({ c1: 'HS', c2: 'HOSP' })
    // Dental only exists for B.
    const dental = rows.find(r => r.label === 'Dental')!
    expect(dental.per_insurer).toEqual({ c2: 'DENT' })
    expect(rows).toHaveLength(3) // H&S, OPGP, Dental
  })

  it('aligns by canonical_category when set, merging insurers whose own wording differs entirely', () => {
    const a: InsurerResult = {
      calculator_id: 'c1', insurer_name: 'A', effective_date: null,
      coverage_lines: [{ code: 'OPD1', label: 'Group Outpatient Primary Care', canonical_category: 'Outpatient GP' }],
      by_line: {}, grand: null, member_count: 1, avg_per_life: null, members: [],
    }
    const b: InsurerResult = {
      calculator_id: 'c2', insurer_name: 'B', effective_date: null,
      coverage_lines: [{ code: 'OPC', label: 'Group Outpatient Clinical (GP Outpatient)', canonical_category: 'Outpatient GP' }],
      by_line: {}, grand: null, member_count: 1, avg_per_life: null, members: [],
    }
    const rows = alignLines([a, b])
    expect(rows).toHaveLength(1)
    expect(rows[0].per_insurer).toEqual({ c1: 'OPD1', c2: 'OPC' })
  })

  it('does not merge across canonical_category "Other" or when unset — falls back to label matching', () => {
    const a: InsurerResult = {
      calculator_id: 'c1', insurer_name: 'A', effective_date: null,
      coverage_lines: [{ code: 'X1', label: 'Something Unusual', canonical_category: 'Other' }],
      by_line: {}, grand: null, member_count: 1, avg_per_life: null, members: [],
    }
    const b: InsurerResult = {
      calculator_id: 'c2', insurer_name: 'B', effective_date: null,
      coverage_lines: [{ code: 'X2', label: 'Something Else Entirely', canonical_category: 'Other' }],
      by_line: {}, grand: null, member_count: 1, avg_per_life: null, members: [],
    }
    const rows = alignLines([a, b])
    expect(rows).toHaveLength(2)   // "Other" never merges, even between two insurers that both used it
  })
})
