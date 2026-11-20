import { describe, expect, it } from 'vitest'
import { compareRates, coverOfCode, planKey, productOfTable, type TableRate } from '@/lib/gb/library'
import type { WbRate } from '@/lib/gb/workbook'

const wb = (o: Partial<WbRate>): WbRate => ({ insurer: 'Income FlexCare', cover: 'Hospital & Surgical', plan: 'Plan 1', cls: null, renewalOnly: false, from: 0, to: 25, net: 100, life: null, ...o })
const tr = (o: Partial<TableRate>): TableRate => ({ rate_table_id: 't', product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 1', age_min: 0, age_max: 30, member_type: 'employee', premium: 100, renewal_only: false, dimensions: null, ...o })

describe('product library: workbook against rate tables', () => {
  it('names the product, cover and plan the same way on both sides', () => {
    expect(productOfTable('QBE Insurance (Singapore) Pte Ltd')).toBe('Steadfast MCare+')
    expect(productOfTable('Raffles Health Insurance')).toBe('RCC Enhanced III')
    expect(productOfTable('Cigna')).toBeNull()
    expect(coverOfCode('Group Hospital and Surgical (GHS)')).toBe('Hospital & Surgical')
    expect(coverOfCode('GHS+EMM')).toBe('Hospital & Surgical')
    expect(coverOfCode('Group Outpatient Primary Care (GOPC)')).toBe('Outpatient GP')
    expect(coverOfCode('Group Term Life (GTL)')).toBe('Term Life')
    expect(coverOfCode('GTL + GACI')).toBeNull()
    expect(coverOfCode('GP COPAY S$5 + SP')).toBeNull()
    expect(planKey('Plan 1 · Private 1-bed · 20%')).toBe(planKey('Plan 1 · Private 1-bedded · 20% co-insurance'))
    expect(planKey('Plan 1 (PTE 1-bed)')).toBe(planKey('Plan 1 · Private 1-bedded'))
    expect(planKey('Plan 1 · Private 1-bed · 0%')).not.toBe(planKey('Plan 1 · Private 4-bed · 0%'))
    expect(planKey('PLAN 2')).toBe(planKey('Plan 2'))
  })

  it('equal, different and one-sided rates are counted; the age band is matched by its first age', () => {
    const c = compareRates('Income FlexCare', [
      wb({ from: 0, to: 25, net: 100 }), wb({ from: 26, to: 30, net: 120 }), wb({ plan: 'Plan 9', net: 50 }),
    ], [
      tr({ age_min: 0, age_max: 25, premium: 100.004 }), tr({ age_min: 26, age_max: 30, premium: 132 }), tr({ plan_code: 'Plan 7', premium: 10 }),
    ])
    expect([c.compared, c.equal, c.workbookOnly, c.tableOnly]).toEqual([2, 1, 1, 1])
    expect(c.differ).toEqual([expect.objectContaining({ plan: 'Plan 1', ages: '26–30', workbook: 120, table: 132, pct: 0.1 })])
  })

  it('a table that states the price with 9% GST is counted apart, not as a difference', () => {
    const c = compareRates('Income FlexCare', [wb({ net: 145 })], [tr({ premium: 158.05 })])
    expect([c.gst, c.differ.length, c.equal]).toEqual([1, 0, 0])
  })

  it('life, class and basis must agree', () => {
    const c = compareRates('Income FlexCare', [wb({ life: 'Dep', net: 40 }), wb({ cls: 'Class 2', cover: 'Personal Accident', net: 30 }), wb({ renewalOnly: true, net: 90 })], [
      tr({ member_type: 'dependant', premium: 40 }),
      tr({ product_code: 'Group Personal Accident (GPA)', dimensions: { occupation_class: '2' }, premium: 33 }),
      tr({ renewal_only: false, premium: 999 }),
    ])
    expect(c.equal).toBe(1)
    expect(c.differ.map(d => d.cover)).toEqual(['Personal Accident'])
    expect(c.workbookOnly).toBe(1)
  })
})
