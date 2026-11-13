import { describe, it, expect } from 'vitest'
import { buildCompare } from '@/lib/gb/compare-cover'
import { buildCompareReport, reportEmail } from '@/lib/gb/compare-report'
import { readReportToken, reportToken } from '@/lib/gb/report-link'
import { DEFAULT_RULES } from '@/lib/gb/plan-pairs'
import { PRODUCTS, type Workbook, type WbBenefit } from '@/lib/gb/workbook'
import type { Member } from '@/lib/gb-quote'

const H = 'Hospital & Surgical', MM = 'Major Medical'
const ben = (insurer: string, cover: string, plan: string, id: string, value: string): WbBenefit => ({ insurer, cover, plan, id, label: id, value, source: null })
const r = (insurer: string, cover: string, plan: string, net: number) => ({ insurer, cover, plan, cls: null, renewalOnly: false, from: 0, to: 99, net, life: null })
const wb: Workbook = {
  file: { name: 'TRS EB Calculator', driveFileId: null, modifiedAt: null, readAt: '2026-11-13' },
  rates: [r('Income FlexCare', H, 'Plan 3 (Restructured 1-bed)', 1000), r('RCC Enhanced III', H, 'Plan 3', 900), r('RCC Enhanced III', MM, 'Plan 3', 100)],
  lists: { 'Income FlexCare': { [H]: ['Plan 3 (Restructured 1-bed)'], [MM]: ['Plan 3'] }, 'RCC Enhanced III': { [H]: ['Plan 3'], [MM]: ['Plan 3'] }, 'Steadfast MCare+': {}, 'Singlife MyBenefits Plus': {}, 'AIA Flexi Vital Care Plus': {} },
  benefits: [
    ...['Income FlexCare', 'RCC Enhanced III'].flatMap(i => [ben(i, H, i === 'Income FlexCare' ? 'Plan 3 (Restructured 1-bed)' : 'Plan 3', 'ghs.hospital_type', 'Restructured'), ben(i, H, i === 'Income FlexCare' ? 'Plan 3 (Restructured 1-bed)' : 'Plan 3', 'ghs.room_board', '1-bed'), ben(i, H, i === 'Income FlexCare' ? 'Plan 3 (Restructured 1-bed)' : 'Plan 3', 'ghs.annual_limit', 'As charged')]),
    ben('Income FlexCare', MM, 'Plan 3', 'gmm.annual_limit', '$100,000'), ben('RCC Enhanced III', MM, 'Plan 3', 'gmm.annual_limit', '$80,000'),
  ],
}
const members: Member[] = [{ name: 'A', category: 'Staff', relationship: 'self', age: 40, plans: { GHS: '3' } }]
const schedule = { GHS: { '3': { hospital: 'government' as const, beds: 1 as const, limitKind: 'per_disability' as const, limit: 1e7, coins: 0 as const } }, EMM: {}, GOPC: {}, GOSC: {}, GD: {}, GTL: {} }

describe('client report from Compare cover', () => {
  const d = { ...buildCompare({ quotationId: 'q', wb, members, schedule, effectiveDate: '2027-01-01', basis: 'renewal', currentInsurer: null, rules: DEFAULT_RULES, lastYearTotal: 1200 }), company: 'Test Co' }
  const m = buildCompareReport(d, '2026-11-13')
  it('prices each product from the plans chosen; Income major medical sits in the hospital premium', () => {
    expect(m.products.map(p => p.name)).toEqual([...PRODUCTS])
    const inc = m.products.find(p => p.name === 'Income FlexCare')!
    expect(inc.total).toBe(1000)
    expect(inc.covers[m.covers.indexOf(MM)]).toMatchObject({ words: 'S$100,000', included: true })
    // RCC: one employee takes its 1.5 group-size factor; its major medical is an optional rider, not taken today.
    expect(m.products.find(p => p.name === 'RCC Enhanced III')!.total).toBe(1350)
    expect(m.today.total).toBe(1200)
    expect(inc.pct).toBeCloseTo(-1 / 6)
  })
  it('the email states each total against today and asks which to take forward', () => {
    const e = reportEmail(m, 'Grace')
    expect(e.subject).toBe('Group benefits comparison for Test Co')
    expect(e.body).toContain('Dear Grace,')
    expect(e.body).toContain('Income FlexCare: S$1,000 a year, net of GST (−16.7% against today)')
    expect(e.body).toContain('Today: S$1,200 a year, net of GST')
  })
})

describe('report link', () => {
  const key = 'k'.repeat(32), now = Date.UTC(2026, 10, 13)
  it('opens for 30 days and refuses a changed or expired token', () => {
    const t = reportToken('1AbCdEfGhIjKlMnOp', now, key)
    expect(readReportToken(t, now, key)).toBe('1AbCdEfGhIjKlMnOp')
    expect(readReportToken(t, now + 31 * 86_400_000, key)).toBeNull()
    expect(readReportToken(t.replace('1AbC', '1AbD'), now, key)).toBeNull()
    expect(readReportToken(t, now, 'x'.repeat(32))).toBeNull()
    expect(readReportToken('../../etc', now, key)).toBeNull()
  })
})
