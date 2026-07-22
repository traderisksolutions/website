import { describe, it, expect } from 'vitest'
import { deriveReviewItems, unresolvedReviewCount, applyProfilePath, resolveReviewItem } from '@/lib/pm-profile'
import type { CellMapProfile } from '@/lib/pm-profile'

const base: CellMapProfile = {
  sheet: 'Step 1', rows: { start: 12, end: 61 },
  member_inputs: { date_of_birth: 'G' }, coverage_lines: [{ code: 'GHS', label: 'GHS', inputs: { plan: 'P' }, output: '' }],
  totals: {}, per_life_total: 'Y', date_serial: true,
  analysis: { review_items: [
    { id: 'dob', severity: 'assumption', question: 'DOB = G?', options: [{ label: 'Yes', set: { path: 'member_inputs.date_of_birth', value: 'G' }, recommended: true }, { label: 'Pick', pick_column: true }] },
    { id: 'gst', severity: 'action', question: 'Net?', options: [{ label: '÷1.09', set: { path: 'total_gst_divisor', value: 1.09 } }, { label: 'Leave', dismiss: true }] },
  ] },
}

describe('deriveReviewItems', () => {
  it('returns structured items when present', () => {
    expect(deriveReviewItems(base).map(i => i.id)).toEqual(['dob', 'gst'])
  })
  it('falls back to acknowledge-only items from legacy strings', () => {
    const p = { ...base, analysis: { assumptions: ['assumed row 61'], needs_review: ['check GST'] } } as CellMapProfile
    const items = deriveReviewItems(p)
    expect(items).toHaveLength(2)
    expect(items.every(i => i.options.length === 1 && i.options[0].dismiss)).toBe(true)
  })
  it('falls back to legacy unmapped[] when no analysis', () => {
    const p = { ...base, analysis: undefined, unmapped: ['x', 'y', 'z'] } as CellMapProfile
    expect(deriveReviewItems(p)).toHaveLength(3)
  })
})

describe('applyProfilePath', () => {
  it('sets member_inputs, rows, per_life_total, gst divisor (immutably)', () => {
    expect(applyProfilePath(base, 'member_inputs.date_of_birth', 'h').member_inputs.date_of_birth).toBe('H')
    expect(applyProfilePath(base, 'rows.end', '80').rows.end).toBe(80)
    expect(applyProfilePath(base, 'per_life_total', 'z').per_life_total).toBe('Z')
    expect(applyProfilePath(base, 'total_gst_divisor', 1.09).total_gst_divisor).toBe(1.09)
    expect(base.member_inputs.date_of_birth).toBe('G') // original untouched
  })
  it('clears a member input when value is empty', () => {
    expect(applyProfilePath(base, 'member_inputs.date_of_birth', '').member_inputs.date_of_birth).toBeUndefined()
  })
})

describe('resolve flow', () => {
  it('marks an item resolved and drops the open count', () => {
    expect(unresolvedReviewCount(base)).toBe(2)
    const p1 = resolveReviewItem(base, 'dob', { label: 'Yes, G' })
    expect(unresolvedReviewCount(p1)).toBe(1)
    const p2 = resolveReviewItem(p1, 'gst', { label: 'Leave' })
    expect(unresolvedReviewCount(p2)).toBe(0)
  })
})
