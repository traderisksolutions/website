import { describe, it, expect } from 'vitest'
import { buildWorkbookAnalysisSummary, renderChangeSummary } from '@/lib/pm-summary'
import type { RateTable } from '@/lib/pm-rates'
import type { DiffEntry } from '@/lib/pm-diff'

const rt: RateTable = {
  calculator_id: 'c1',
  age_basis: 'ANB',
  rules: {
    group_size_loading: [{ min: 1, max: 1, loading_pct: 50 }, { min: 10, max: null, loading_pct: -10 }],
    loading_excludes: ['GTL'],
    gst: { inclusive: true, rate: 0.09 },
    quote_basis_exclusions: { new_business: ['71+'] },
  },
  coverages: [
    { code: 'GHS', full_name: 'Group Hospital & Surgical', plans: [{ code: 'Plan 1', label: 'Plan 1' }, { code: 'Plan 2', label: 'Plan 2' }], age_bands: ['0-25'], rates: [] },
    { code: 'GTL', full_name: 'Group Term Life', plans: [{ code: 'Plan 1', label: 'Plan 1' }], age_bands: ['0-25'], rates: [] },
  ],
}

describe('buildWorkbookAnalysisSummary', () => {
  it('mentions age basis, coverage/plan counts, loading bands, exclusions and GST', () => {
    const s = buildWorkbookAnalysisSummary(rt)
    expect(s).toContain('2 coverages')
    expect(s).toContain('Age Next Birthday')
    expect(s).toContain('1 lives: +50%')
    expect(s).toContain('10+ lives: -10%')
    expect(s).toContain('GTL')
    expect(s).toContain('GST-inclusive at 9%')
    expect(s).toContain('71+')
  })

  it('says premiums are flat when there is no group-size loading', () => {
    const flat: RateTable = { ...rt, rules: {} }
    expect(buildWorkbookAnalysisSummary(flat)).toContain('flat regardless of headcount')
  })
})

describe('renderChangeSummary', () => {
  it('reports no changes when both diffs are empty', () => {
    expect(renderChangeSummary([], [])).toBe('No changes from the previous approved version.')
  })

  it('summarises a rate change with a percentage', () => {
    const diff: DiffEntry[] = [{ path: 'coverages.Group Hospital & Surgical.0-25.Plan 1', from: 100, to: 110 }]
    const s = renderChangeSummary(diff, [])
    expect(s).toContain('100 → 110')
    expect(s).toContain('+10.0%')
  })

  it('separates added/removed/changed benefit terms', () => {
    const diff: DiffEntry[] = [
      { path: 'Dental — Annual limit', from: null, to: '$800' },
      { path: 'Hospitalization — ICU', from: '$10k', to: null },
      { path: 'Hospitalization — Room & Board', from: '1-bed', to: '2-bed' },
    ]
    const s = renderChangeSummary([], diff)
    expect(s).toContain('Added benefits: Dental — Annual limit')
    expect(s).toContain('Removed benefits: Hospitalization — ICU')
    expect(s).toContain('Changed benefits: Hospitalization — Room & Board (1-bed → 2-bed)')
  })
})
