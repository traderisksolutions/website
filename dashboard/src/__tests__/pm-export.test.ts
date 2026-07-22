import { describe, it, expect } from 'vitest'
import { buildInsurerCsv, insurerFilename } from '@/lib/pm-export'
import type { QuoteRow } from '@/lib/pm-export'

const quote: QuoteRow = {
  company_name: 'Acme, Pte Ltd',
  effective_date: '2026-01-01',
  census: [
    { name: 'Jane Tan', relationship: 'Self' },
    { name: 'Baby Tan', relationship: 'Child', age: 3 },
    { name: '', relationship: 'Self' }, // blank -> excluded (matches results order)
  ],
  selections: { c1: { HS: { plan: 'Plan 1', hospital: 'Private Hospital' }, OPGP: { plan: 'Plan 1' } } },
  results: {
    census_size: 2,
    lines_union: [],
    insurers: [{
      calculator_id: 'c1', insurer_name: 'Steadfast', effective_date: '2026-05-20',
      coverage_lines: [{ code: 'HS', label: 'Hospital & Surgical' }, { code: 'OPGP', label: 'Outpatient GP' }],
      by_line: { HS: 1706.88, OPGP: 826 }, grand: 2532.88, member_count: 2, avg_per_life: 1266.44,
      members: [
        { row: 16, name: 'Jane Tan', lines: { HS: 1706.88, OPGP: 413 }, subtotal: 2119.88 },
        { row: 17, name: 'Baby Tan', lines: { HS: null, OPGP: 413 }, subtotal: 413 },
      ],
    }],
  },
}

describe('buildInsurerCsv', () => {
  const { filename, csv } = buildInsurerCsv(quote, 'c1')
  const rows = csv.split('\r\n')

  it('names the file from company + insurer', () => {
    expect(filename).toBe('Acme-Pte-Ltd_Steadfast_quote.csv')
  })

  it('escapes commas in metadata (company name)', () => {
    expect(rows).toContain('Company,"Acme, Pte Ltd"')
  })

  it('has one header + one row per priced life with coverage columns + subtotal', () => {
    const header = rows.find(r => r.startsWith('No,Name'))!
    expect(header).toBe('No,Name,Relationship,Category,Hospital & Surgical,Outpatient GP,Subtotal')
    expect(rows).toContain('1,Jane Tan,Self,Employee,1706.88,413.00,2119.88')
    // dependent priced on own age; blank HS renders as empty cell
    expect(rows).toContain('2,Baby Tan,Child,Dependent,,413.00,413.00')
  })

  it('has a Total row and Average-per-life row from stored totals', () => {
    expect(rows).toContain(',,,Total,1706.88,826.00,2532.88')
    expect(rows).toContain(',,,Average per life,,,1266.44')
  })

  it('carries the plan basis', () => {
    expect(csv).toContain('Plan basis,')
    expect(csv).toContain('HS: Plan 1 / Private Hospital')
  })

  it('throws for an insurer not in the results', () => {
    expect(() => buildInsurerCsv(quote, 'nope')).toThrow()
  })
})

describe('insurerFilename', () => {
  it('handles a null company', () => {
    expect(insurerFilename(null, 'Great Eastern')).toBe('Great-Eastern_quote.csv')
  })
})
