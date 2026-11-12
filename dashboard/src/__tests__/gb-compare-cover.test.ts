import { describe, it, expect } from 'vitest'
import { buildCompare, indexRates, matchPlan, priceCover, productOf } from '@/lib/gb/compare-cover'
import { amountOf, changeOf, coverWords } from '@/lib/gb/compare-words'
import { compareFacts, codeEmail } from '@/lib/gb/compare-draft'
import type { Workbook, WbRate, WbBenefit } from '@/lib/gb/workbook'
import type { Member } from '@/lib/gb-quote'

const rate = (insurer: string, cover: string, plan: string, net: number, extra: Partial<WbRate> = {}): WbRate => ({ insurer, cover, plan, cls: null, renewalOnly: false, from: 0, to: 99, net, life: null, ...extra })
const ben = (insurer: string, cover: string, plan: string, id: string, label: string, value: string): WbBenefit => ({ insurer, cover, plan, id, label, value, source: null })
const H = 'Hospital & Surgical'
const wb: Workbook = {
  file: { name: 'test', driveFileId: null, modifiedAt: null, readAt: '2026-11-13' },
  rates: [
    rate('Steadfast MCare+', H, 'Plan 3 · Govt 1-bed · 0%', 1000), rate('Steadfast MCare+', H, 'Plan 2 · Govt 1-bed · 0%', 1300),
    rate('RCC Enhanced III', H, 'Plan 5 (GRH 1-bed)', 800), rate('RCC Enhanced III', H, 'Plan 1 (PTE 1-bed)', 1500),
    rate('AIA Flexi Vital Care Plus', H, 'Plan 3 (Pte 1-bed)', 900, { life: 'EE' }), rate('AIA Flexi Vital Care Plus', H, 'Plan 3 (Pte 1-bed)', 400, { life: 'Dep' }),
  ],
  lists: {
    'Steadfast MCare+': { [H]: ['Plan 2 · Govt 1-bed · 0%', 'Plan 3 · Govt 1-bed · 0%'] },
    'RCC Enhanced III': { [H]: ['Plan 1 (PTE 1-bed)', 'Plan 5 (GRH 1-bed)'] },
    'Income FlexCare': {}, 'Singlife MyBenefits Plus': {},
    'AIA Flexi Vital Care Plus': { [H]: ['Plan 3 (Pte 1-bed)', 'GHS-FW Plan 1 (WP/SP)'] },
  },
  benefits: [
    ...[['Steadfast MCare+', 'Plan 2 · Govt 1-bed · 0%', 'Government/Restructured', '$150,000', 'Annual policy limit (APL)', 'As charged (up to APL)'], ['Steadfast MCare+', 'Plan 3 · Govt 1-bed · 0%', 'Government/Restructured', '$80,000', 'Annual policy limit (APL)', 'As charged (up to APL)'],
      ['RCC Enhanced III', 'Plan 5 (GRH 1-bed)', 'Govt/Restructured', '$25,000', 'Per disability', '$10,000'], ['RCC Enhanced III', 'Plan 1 (PTE 1-bed)', 'Private', '$200,000', 'Annual policy limit', 'As charged to $200k'],
      ['AIA Flexi Vital Care Plus', 'Plan 3 (Pte 1-bed)', 'Private', '$250,000', 'Annual policy limit', '$10,000']]
      .flatMap(([ins, plan, type, lim, basis, icu]) => [ben(ins, H, plan, 'ghs.hospital_type', 'Hospital type', type), ben(ins, H, plan, 'ghs.room_board', 'Room & board (ward)', '1-bed'), ben(ins, H, plan, 'ghs.annual_limit', 'H&S limit', lim), ben(ins, H, plan, 'ghs.limit_basis', 'Limit basis', basis), ben(ins, H, plan, 'ghs.copay', 'Co-payment / co-insurance', '0%'), ben(ins, H, plan, 'ghs.icu', 'ICU', icu)]),
  ],
}
const members: Member[] = [
  { name: 'A', category: 'Staff', relationship: 'self', age: 40, plans: { GHS: '3' } },
  { name: 'B', category: 'Staff', relationship: 'spouse', age: 38, plans: { GHS: '3' } },
  { name: 'C', category: 'Staff', relationship: 'self', age: 30, plans: { GHS: '3' } },
]
const schedule = { GHS: { '3': { hospital: 'government' as const, beds: 1 as const, limitKind: 'annual' as const, limit: 80000, coins: 0 as const } }, EMM: {}, GOPC: {}, GOSC: {}, GD: {}, GTL: {} }

describe('compare words', () => {
  it('reads amounts, daily caps and as charged', () => {
    expect(amountOf('$5,000')).toBe(5000)
    expect(amountOf('$150/day (max 45 days)')).toBe(6750)
    expect(amountOf('As charged to $200k')).toBe(Infinity)
    expect(amountOf('See policy')).toBeNull()
  })
  it('states the change against today, with the multiple from 2x', () => {
    expect(changeOf('$4,000', '$5,000')).toEqual({ text: '−20%', tone: 'down' })
    expect(changeOf('$10,000', '$5,000')).toEqual({ text: '+100% (2×)', tone: 'up' })
    expect(changeOf('$10,000', 'As charged (up to APL)')).toEqual({ text: 'less', tone: 'down' })
    expect(changeOf('Annual policy limit', 'Annual policy limit (APL)')).toEqual({ text: 'same', tone: 'same' })
    expect(changeOf('20%', '0%', true).tone).toBe('down')
  })
  it('says a hospital plan in cover terms', () => {
    const b = Object.fromEntries(wb.benefits.filter(x => x.plan === 'Plan 5 (GRH 1-bed)').map(x => [x.id, x.value]))
    expect(coverWords(H, 'Plan 5 (GRH 1-bed)', b)).toBe('Government 1-bed · S$25,000 per disability')
  })
})

describe('compare engine', () => {
  it('prices employees and dependants on their own tables', () => {
    const r = priceCover(indexRates(wb), 'AIA Flexi Vital Care Plus', H, 'Plan 3 (Pte 1-bed)', members, { effectiveDate: '2026-10-24', renewal: false, employeesInCompany: 2 })
    expect(r.premium).toBe(900 * 2 + 400)
  })
  it('matches the same hospital type and ward first, then the nearest limit; never a foreign-worker plan', () => {
    const benefitsOf = (p: string) => (c: string, plan: string) => Object.fromEntries(wb.benefits.filter(x => x.insurer === p && x.cover === c && x.plan === plan).map(x => [x.id, x.value]))
    const t = { hosp: { hospital: 'government' as const, beds: 1, limit: 80000, basis: 'annual' as const, coins: 0 }, gmm: null, gpCopay: null, spLimit: null, dental: null }
    expect(matchPlan(benefitsOf('RCC Enhanced III'), wb.lists['RCC Enhanced III'][H], H, t).plan).toBe('Plan 5 (GRH 1-bed)')
    expect(matchPlan(benefitsOf('Steadfast MCare+'), wb.lists['Steadfast MCare+'][H], H, t).plan).toBe('Plan 3 · Govt 1-bed · 0%')
    expect(matchPlan(benefitsOf('AIA Flexi Vital Care Plus'), wb.lists['AIA Flexi Vital Care Plus'][H], H, t).plan).toBe('Plan 3 (Pte 1-bed)')
  })
  it('builds today, the five products and their prices; the email names gains and losses', () => {
    expect(productOf('QBE Insurance (Singapore)')).toBe('Steadfast MCare+')
    const d = buildCompare({ quotationId: 'q', wb, members, schedule, effectiveDate: '2026-10-24', basis: 'renewal', currentInsurer: 'QBE' })
    expect(d.categories).toEqual([{ key: '3', name: 'Plan 3', lives: 3, employees: 2 }])
    expect(d.today.picks['3'][H]).toBe('Plan 3 · Govt 1-bed · 0%')
    expect(d.prices['3']['RCC Enhanced III'][H]['Plan 5 (GRH 1-bed)']).toBeCloseTo(800 * 3)
    const f = compareFacts({ ...d, company: 'Test Co' }, 'RCC Enhanced III', d.picks['RCC Enhanced III'])
    expect(f.todayTotal).toBe(3000)
    expect(f.total).toBe(2400)
    expect(f.less.map(h => h.label)).toContain('ICU')
    const e = codeEmail(f, 'Grace')
    expect(e.body).toContain('S$2,400 a year, net of GST, −20.0% against today\'s S$3,000')
    expect(e.body).toContain('- ICU: S$10,000, against As charged (up to APL) today (less)')
  })
})
