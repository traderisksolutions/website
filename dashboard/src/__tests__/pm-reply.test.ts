import { describe, it, expect } from 'vitest'
import { buildReplyBody } from '@/lib/pm-reply'
import type { ReplyQuote } from '@/lib/pm-reply'

const base: ReplyQuote = {
  company_name: 'Acme Pte Ltd',
  effective_date: '2026-01-01',
  results: {
    census_size: 2, lines_union: [],
    insurers: [
      {
        calculator_id: 'c1', insurer_name: 'Steadfast', effective_date: '2026-05-20',
        coverage_lines: [{ code: 'HS', label: 'Hospital & Surgical' }, { code: 'OPGP', label: 'Outpatient GP' }],
        by_line: { HS: 1706.88, OPGP: 826 }, grand: 2532.88, member_count: 2, avg_per_life: 1266.44, members: [],
      },
      {
        calculator_id: 'c2', insurer_name: 'Great Eastern', effective_date: null,
        coverage_lines: [{ code: 'HS', label: 'Hospital & Surgical' }],
        by_line: { HS: 958.32 }, grand: 958.32, member_count: 2, avg_per_life: 479.16, members: [],
      },
      // errored insurer is excluded
      { calculator_id: 'c3', insurer_name: 'Broken', effective_date: null, coverage_lines: [], by_line: {}, grand: null, member_count: 0, avg_per_life: null, members: [], error: 'boom' },
    ],
  },
}

describe('buildReplyBody', () => {
  it('lists each priced insurer with line premiums + totals, skipping errored ones', () => {
    const body = buildReplyBody(base)
    expect(body).toContain('for Acme Pte Ltd')
    expect(body).toContain('Policy effective date: 2026-01-01')
    expect(body).toContain('Steadfast')
    expect(body).toContain('Hospital & Surgical: $1,706.88')
    expect(body).toContain('Total annual premium (net): $2,532.88')
    expect(body).toContain('avg $1,266.44/life, 2 lives')
    expect(body).toContain('Great Eastern')
    expect(body).not.toContain('Broken')          // errored insurer omitted
    expect(body).toContain('Attached is a CSV per insurer')
  })

  it('includes the recommendation when present', () => {
    const body = buildReplyBody({ ...base, recommendation: { recommendation: 'Steadfast', headline: 'Best private-hospital value.', rationale: 'Lower total for A-ward access.', per_insurer: [] } })
    expect(body).toContain('Our recommendation: Steadfast')
    expect(body).toContain('Best private-hospital value.')
    expect(body).toContain('Lower total for A-ward access.')
  })

  it('omits recommendation + effective-date lines when absent', () => {
    const body = buildReplyBody({ ...base, company_name: null, effective_date: null })
    expect(body).not.toContain('Our recommendation')
    expect(body).not.toContain('Policy effective date')
    expect(body.startsWith('Please find below our group employee benefits premium comparison (net')).toBe(true)
  })
})
