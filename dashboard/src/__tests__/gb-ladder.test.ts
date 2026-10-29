/**
 * Employment Benefits requirement → plan at every insurer → premium, on the live rate tables
 * (fixture: production gb_rates, 30 Oct 2026, after the brochure fixes) and Gembridge's census.
 *
 * The Gembridge quotation of 15 Oct 2026 asked for: private 1-bed hospital on the top plan, GP with
 * no co-pay, specialist and dental on the top plan, S$250k accident cover for employees, dependants
 * on the medical covers. Through the requirement, every insurer lands on the plan the workbook
 * picked except two the broker chose by hand (QBE specialist Plan 2; Singlife accident S$200k),
 * which are overrides here. The totals must then equal the workbook to the cent, except AIA:
 * AIA's dental covers children from age 3 (brochure p17), and the workbook priced a 1-year-old.
 */
import { describe, expect, it } from 'vitest'
import { computeQuote, memberAge, type Member, type RateTableInfo } from '@/lib/gb-quote'
import { buildCategoryMap, engineCategory, planGrid, DEFAULT_REQUIREMENT, type Requirement, type TableShape } from '@/lib/gb/ladder'
import { underwriting } from '@/lib/gb/underwriting'
import fixture from './fixtures/gb-live-rates-2026-10-30.json'

type Fx = { effective_date: string; members: Member[]; tables: { id: string; insurer_name: string; age_basis: 'next_birthday' | 'last_birthday'; rules: RateTableInfo['rules'] }[]; rates: (RateTableInfo['rates'][number] & { rate_table_id: string })[] }
const fx = fixture as unknown as Fx
const tables: RateTableInfo[] = fx.tables.map(t => ({ rate_table_id: t.id, insurer_name: t.insurer_name, age_basis: t.age_basis, rules: t.rules, rates: fx.rates.filter(r => r.rate_table_id === t.id) }))
const shapes: TableShape[] = fx.tables.map(t => {
  const by = new Map<string, Set<string>>()
  for (const r of fx.rates) if (r.rate_table_id === t.id) { if (!by.has(r.product_code)) by.set(r.product_code, new Set()); by.get(r.product_code)!.add(r.plan_code) }
  return { id: t.id, insurer_name: t.insurer_name, products: [...by].map(([code, plans]) => ({ code, plans: [...plans] })) }
})
const idOf = (re: RegExp) => fx.tables.find(t => re.test(t.insurer_name))!.id
const GEMBRIDGE: Requirement = { ...DEFAULT_REQUIREMENT, ward: 'P1', wardLevel: 'top', gp: 'nil', sp: 'top', dental: 'top', pa: 250_000 }

function price(req: Requirement, overrides: Record<string, string> = {}, members: Member[] = fx.members, only?: RegExp) {
  const use = only ? shapes.filter(s => only.test(s.insurer_name)) : shapes.filter(s => !/cigna/i.test(s.insurer_name))
  const { map, products } = buildCategoryMap([{ name: 'Staff', requirement: req, overrides }], use, members.map(m => ({ category: m.category, relationship: m.relationship })))
  const census = members.map(m => ({ ...m, category: engineCategory({ category: m.category, relationship: m.relationship }) }))
  return computeQuote(census, tables.filter(t => use.some(s => s.id === t.rate_table_id)), map, products, 0.09, fx.effective_date, { basis: 'new_business' })
}

describe('Gembridge through the requirement, live rates', () => {
  const r = price(GEMBRIDGE, { [`${idOf(/QBE/)}|GOSC`]: 'Plan 2', [`${idOf(/Singapore Life/)}|GPA`]: 'Plan 4 ($200k)' })
  const ins = (re: RegExp) => r.per_insurer.find(i => re.test(i.insurer_name))!
  it.each([
    [/Raffles/, 37799.61], [/Income/, 28549.90], [/QBE/, 46224.85], [/Singapore Life/, 27702.00],
  ])('%s equals the 15 Oct workbook to the cent', (re, total) => {
    expect(ins(re).subtotal).toBeCloseTo(total, 2)
    expect(ins(re).missing).toBe(0)
  })
  it('AIA is S$453.71 below the workbook: no dental for the child under 3', () => {
    expect(ins(/AIA/).subtotal).toBeCloseTo(38868.66 - 453.71, 2)
    const gap = r.lines.filter(l => /AIA/.test(l.insurer_name) && l.premium == null)
    expect(gap.map(l => [l.member_name, l.product_code, l.note])).toEqual([['Life 10', 'DENTAL', 'child under 3 not covered']])
  })
  it('AIA prices GP inside its GP + specialist rider; Singlife inside its combined rider', () => {
    expect(Object.keys(ins(/AIA/).by_product)).not.toContain('GP')
    expect(Object.keys(ins(/Singapore Life/).by_product)).not.toContain('Outpatient GP')
  })
  it('dependants carry no accident line', () => {
    expect(r.lines.filter(l => l.relationship !== 'self' && /accident|GADD|GPA/i.test(l.product_code))).toHaveLength(0)
  })
})

describe('requirement → plan', () => {
  const shape = (re: RegExp) => shapes.find(s => re.test(s.insurer_name))!
  const plan = (cells: ReturnType<typeof planGrid>, cover: string) => cells.find(c => c.cover === cover)
  it('QBE government 1-bed entry is Plan 4: Plan 5 is government 4-bed only', () => {
    expect(plan(planGrid({ ...DEFAULT_REQUIREMENT, ward: 'G1', wardLevel: 'entry' }, shape(/QBE/)), 'GHS')?.plan).toBe('Plan 4 · Government 1-bedded')
    expect(plan(planGrid({ ...DEFAULT_REQUIREMENT, ward: 'G4', wardLevel: 'entry' }, shape(/QBE/)), 'GHS')?.plan).toBe('Plan 5 · Government 4-bedded')
  })
  it('a 2-bed request at an insurer without one prices 1-bed and says so', () => {
    const c = plan(planGrid({ ...DEFAULT_REQUIREMENT, ward: 'P2' }, shape(/Income/)), 'GHS')!
    expect(c.plan).toBe('Plan 2')
    expect(c.note).toMatch(/No 2-bed/)
  })
  it('foreign workers get Income Plan 7 and AIA GHS-FW', () => {
    expect(plan(planGrid(DEFAULT_REQUIREMENT, shape(/Income/), true), 'GHS')?.plan).toBe('Plan 7')
    const aia = plan(planGrid(DEFAULT_REQUIREMENT, shape(/AIA/), true), 'GHS')!
    expect([aia.product, aia.plan]).toEqual(['GHS-FW', 'PLAN 2'])
  })
  it('QBE sells no term life: the cell says so instead of pricing', () => {
    expect(plan(planGrid({ ...DEFAULT_REQUIREMENT, gtl: 100_000 }, shape(/QBE/)), 'GTL')?.none).toBe('Not offered')
  })
  it('Income critical illness follows the term life plan number', () => {
    const cells = planGrid({ ...DEFAULT_REQUIREMENT, gtl: 200_000, gci: 50_000 }, shape(/Income/))
    expect(plan(cells, 'GTL')?.plan).toBe('Plan 3')
    expect(plan(cells, 'GCI')?.plan).toBe('Plan 3')
    expect(plan(cells, 'GCI')?.note).toMatch(/S\$100k/)
  })
  it('AIA critical illness is priced as GTL + GACI on the term life plan', () => {
    const cells = planGrid({ ...DEFAULT_REQUIREMENT, gtl: 250_000, gci: 100_000 }, shape(/AIA/))
    expect([plan(cells, 'GTL')?.product, plan(cells, 'GTL')?.plan]).toEqual(['GTL + GACI', 'PLAN 5'])
  })
  it('accident cover takes the nearest sum, ties going up', () => {
    expect(plan(planGrid({ ...DEFAULT_REQUIREMENT, pa: 250_000 }, shape(/Singapore Life/)), 'GPA')?.plan).toBe('Plan 5 ($300k)')
    expect(plan(planGrid({ ...DEFAULT_REQUIREMENT, pa: 250_000 }, shape(/Raffles/)), 'GPA')?.plan).toBe('Plan 2 ($250k)')
  })
  it('a broker override replaces the plan and is marked', () => {
    const { grids } = buildCategoryMap([{ name: 'Staff', requirement: GEMBRIDGE, overrides: { [`${idOf(/QBE/)}|GOSC`]: 'Plan 2' } }], [shape(/QBE/)], [{ category: 'Staff', relationship: 'self' }])
    expect(plan(grids[idOf(/QBE/)].Staff, 'GOSC')).toMatchObject({ plan: 'Plan 2', note: 'Changed by broker' })
  })
  it('dependants not covered: only employees are priced', () => {
    const r = price({ ...GEMBRIDGE, deps: 'none' }, {}, fx.members, /Income/)
    expect(new Set(r.lines.map(l => l.relationship))).toEqual(new Set(['self']))
  })
})

describe('underwriting', () => {
  const lives = fx.members.map(m => ({ name: m.name, relationship: m.relationship, age: memberAge(m, fx.effective_date, 'last_birthday') }))
  it('Income asks for a declaration above S$150k term life', () => {
    expect(underwriting('income', lives, { gtl: 'Plan 3' }).declarations).toHaveLength(6)
    expect(underwriting('income', lives, { gtl: 'Plan 4' }).declarations).toHaveLength(0)
  })
  it('AIA package stops at 50 lives', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ name: `L${i}`, relationship: 'self', age: 30 }))
    expect(underwriting('aia', many, {}).group[0]).toMatch(/up to 50 lives/)
  })
  it('one employee at RCC shows the 50% loading', () => {
    expect(underwriting('rcc', [lives[0]], {}).group).toContain('One employee: RCC loads medical premiums by 50%')
  })
})
