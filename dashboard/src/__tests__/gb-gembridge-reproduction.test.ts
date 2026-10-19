/**
 * The Gembridge quotation of 15 Oct 2026 (TRS EB Package Calculator - Gembridge.xlsx), reproduced
 * by the quote engine from the workbook's own rate rows. 15 lives, five insurers, 28 figures that
 * must match the sheet's Summary to the cent.
 *
 * This is the method behind every future deal: the engine, not a spreadsheet, prices the census.
 * The fixture pins the rules the sheet applied and the engine must keep applying:
 *   - RCC on age next birthday; everyone else on age last birthday
 *   - RCC group factor by number of EMPLOYEES (6 here → 5% off), medical lines only
 *   - personal accident by occupation class; employees only (dependants hold no PA plan)
 *   - AIA dependants on AIA's dependant tables; every other insurer at the employee rate
 *   - new business: renewal-only bands price nothing
 *   - line premiums kept at four decimals, totals rounded once, as the sheet sums
 */
import { describe, expect, it } from 'vitest'
import { computeQuote, type Member, type RateTableInfo, type CategoryMap } from '@/lib/gb-quote'
import fixture from './fixtures/gembridge-2026-10.json'

type Fixture = {
  effective_date: string
  basis: 'new_business' | 'renewal'
  members: Member[]
  tables: { rate_table_id: string; insurer_name: string; age_basis: 'next_birthday' | 'last_birthday'; rules: RateTableInfo['rules'] }[]
  rates: (RateTableInfo['rates'][number] & { rate_table_id: string })[]
  category_map: CategoryMap
  products: string[]
  expected_net_by_product: Record<string, Record<string, number>>
}
const fx = fixture as unknown as Fixture

describe('Gembridge, 15 Oct 2026: engine reproduces the workbook', () => {
  const tables: RateTableInfo[] = fx.tables.map(t => ({
    rate_table_id: t.rate_table_id, insurer_name: t.insurer_name, age_basis: t.age_basis,
    rates: fx.rates.filter(r => r.rate_table_id === t.rate_table_id), rules: t.rules ?? null,
  }))
  const result = computeQuote(fx.members, tables, fx.category_map, fx.products, 0.09, fx.effective_date, { basis: fx.basis })

  it('prices every line (no gaps)', () => {
    for (const ins of result.per_insurer) expect(ins.missing, ins.insurer_name).toBe(0)
  })

  for (const [insurer, expected] of Object.entries(fx.expected_net_by_product)) {
    it(`${insurer}: every product and the total match the sheet to the cent`, () => {
      const got = result.per_insurer.find(i => i.insurer_name === insurer)
      expect(got, insurer).toBeTruthy()
      for (const [product, net] of Object.entries(expected)) expect(got!.by_product[product], `${insurer} ${product}`).toBeCloseTo(net, 2)
      const total = Object.values(expected).reduce((s, v) => s + v, 0)
      expect(got!.subtotal).toBeCloseTo(total, 2)
    })
  }

  it('RCC applied the 5 percent group discount to medical lines only', () => {
    const rcc = result.per_insurer.find(i => i.insurer_name.startsWith('RCC'))!
    expect(rcc.applied?.group_factor).toBe(0.95)
    const pa = result.lines.filter(l => l.insurer_name.startsWith('RCC') && l.product_code === 'Personal Accident')
    expect(pa).toHaveLength(6)
    for (const l of pa) expect(l.premium).toBe(92.22)   // class 1, S$250k, undiscounted
  })

  it('dependants carry no personal accident line at any insurer', () => {
    const depPa = result.lines.filter(l => l.relationship !== 'self' && /Accident/.test(l.product_code))
    expect(depPa).toHaveLength(0)
  })
})
