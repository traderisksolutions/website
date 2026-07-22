import { describe, it, expect } from 'vitest'
import { categoryFor, buildMembers, alignLines, avgPerLife, toInsurerResult } from '@/lib/pm-quote'
import type { InsurerResult } from '@/lib/pm-quote'
import type { CellMapProfile, CoverageLine } from '@/lib/pm-profile'

const LINES: CoverageLine[] = [
  { code: 'HS', label: 'Hospital & Surgical', inputs: { plan: 'J', hospital: 'K', beds: 'L', coinsurance: 'M' }, output: 'N' },
  { code: 'OPGP', label: 'Outpatient GP', inputs: { plan: 'O' }, output: 'Q' },
]

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
    const m = buildMembers(census, selection, LINES)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ name: 'Jane', category: 'Employee', coverage: { HS: { plan: 'Plan 1' }, OPGP: { plan: 'Plan 1' } } })
    expect(m[1]).toMatchObject({ name: 'Baby', category: 'Dependent', age: 3 })
  })

  it('omits coverage lines with no selection', () => {
    const m = buildMembers([{ name: 'X' }], { OPGP: { plan: 'Plan 2' } }, LINES)
    expect(m[0].coverage).toEqual({ OPGP: { plan: 'Plan 2' } })
    expect(m[0].coverage.HS).toBeUndefined()
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
  const profile = { coverage_lines: LINES } as CellMapProfile
  const run = { members: [{ row: 16, name: 'Jane', lines: { HS: 1706.88, OPGP: 413 }, subtotal: 2119.88 }], totals: { by_line: { HS: 1706.88, OPGP: 413 }, grand: 2119.88 } }

  it('shapes one insurer result with avg/life', () => {
    const r = toInsurerResult('c1', 'Steadfast', '2026-05-20', profile, run)
    expect(r.grand).toBe(2119.88)
    expect(r.member_count).toBe(1)
    expect(r.avg_per_life).toBe(2119.88)
    expect(r.coverage_lines).toEqual([{ code: 'HS', label: 'Hospital & Surgical' }, { code: 'OPGP', label: 'Outpatient GP' }])
  })

  it('aligns lines across insurers by normalised label, mapping each insurer code', () => {
    const a = toInsurerResult('c1', 'A', null, profile, run)
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
})
