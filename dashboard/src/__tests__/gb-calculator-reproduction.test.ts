/**
 * The premium engine against the insurers' own calculators.
 *
 * Every case here was computed by scripts/gb-calculators/build.py re-implementing each
 * calculator's formula directly against its sheet cells — QBE's Calculator!N16/Q16/T16/W16/Z16,
 * Income's Working!C4/M4..S4. The engine never sees those formulas; it sees only the rate rows
 * and rules the same script wrote. So agreement here means the engine, given our data, produces
 * the premium the insurer's own spreadsheet would.
 *
 * Cases sit at every age band boundary, one either side, and at each eligibility edge, for every
 * product, plan, variant, relationship and occupation class. If an insurer issues a new
 * calculator, re-run the build script and this test says whether anything moved.
 */
import { describe, it, expect } from 'vitest'
import { computeQuote, gstApplies, type RateRow, type RateTableInfo, type AppliedRules, type QuoteBasis } from '@/lib/gb-quote'
import qbe from '@/lib/gb/calculators/qbe-steadfast-2026.json'
import income from '@/lib/gb/calculators/income-flexcare-2026.json'

type Case = { product_code: string; plan_code: string; age: number; relationship: string
              occupation_class?: string; expected: number | null; renewal_only: boolean }
type Calc = { insurer: string; rate_table_id: string; rules: AppliedRules & { gst_treatment: { treatment: string; conversion_factor: number | null } }
              rates: RateRow[]; cases: Case[] }

const round2 = (n: number) => Math.round(n * 100) / 100

/** One member, one product, one plan — the premium line the engine produces for it. */
function linePremium(calc: Calc, c: Case, basis: QuoteBasis): { premium: number | null; note: string | null } {
  const table: RateTableInfo = {
    rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday',
    rates: calc.rates, rules: calc.rules,
  }
  const q = computeQuote(
    [{ name: 'm', category: 'All', relationship: c.relationship, age: c.age, occupation_class: c.occupation_class ?? '1' }],
    [table],
    { [calc.rate_table_id]: { [c.product_code]: { All: c.plan_code } } },
    [c.product_code], 0.09, '2026-10-01', { basis },
  )
  const line = q.lines[0]
  return { premium: line?.premium ?? null, note: line?.note ?? null }
}

for (const calc of [qbe as unknown as Calc, income as unknown as Calc]) {
  const inclusive = calc.rules.gst_treatment.treatment === 'inclusive'
  const factor = calc.rules.gst_treatment.conversion_factor ?? 1.09

  describe(`${calc.insurer} — engine reproduces the calculator`, () => {
    it(`prices every one of ${calc.cases.length} boundary cases exactly as the calculator does (renewal basis)`, () => {
      const wrong: string[] = []
      for (const c of calc.cases) {
        const { premium, note } = linePremium(calc, c, 'renewal')
        // The engine stores premiums net of GST; an inclusive calculator's figure is stripped once —
        // except life cover, which is GST-exempt and never had any to strip.
        const want = c.expected == null ? null : round2(inclusive && gstApplies(c.product_code) ? c.expected / factor : c.expected)
        const ok = want == null ? premium == null : premium != null && Math.abs(premium - want) <= 0.01
        if (!ok && wrong.length < 15) {
          wrong.push(`${c.product_code} | ${c.plan_code} | age ${c.age} ${c.relationship}${c.occupation_class ? ` class ${c.occupation_class}` : ''}: calculator ${c.expected} -> want ${want}, engine ${premium} (${note ?? ''})`)
        }
      }
      expect(wrong, wrong.join('\n')).toEqual([])
    })

    it('refuses renewal-only ages on new business, as the insurer states', () => {
      const renewalOnly = calc.cases.filter(c => c.renewal_only && c.expected != null)
      expect(renewalOnly.length).toBeGreaterThan(0)
      for (const c of renewalOnly.slice(0, 200)) {
        expect(linePremium(calc, c, 'new_business').premium, `${c.product_code} ${c.plan_code} age ${c.age}`).toBeNull()
      }
    })

    it('counts GST once: the total a client pays matches the calculator', () => {
      // One priced case, end to end: net line + 9% GST should land back on the calculator figure
      // for an inclusive insurer, and on figure x 1.09 for an exclusive one.
      const c = calc.cases.find(x => x.expected != null && !x.renewal_only && x.relationship === 'self')!
      const table: RateTableInfo = { rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday', rates: calc.rates, rules: calc.rules }
      const q = computeQuote(
        [{ name: 'm', category: 'All', relationship: 'self', age: c.age, occupation_class: c.occupation_class ?? '1' }],
        [table], { [calc.rate_table_id]: { [c.product_code]: { All: c.plan_code } } }, [c.product_code], 0.09, '2026-10-01')
      const total = q.per_insurer[0].total
      const want = inclusive ? c.expected! : c.expected! * 1.09
      expect(Math.abs(total - want)).toBeLessThanOrEqual(0.02)
    })
  })
}

describe('what the calculators taught the engine', () => {
  it('prices a QBE spouse and child at the employee rate for hospital cover', () => {
    const c = (qbe as unknown as Calc)
    const self = linePremium(c, { product_code: 'Group Hospital & Surgical (GHS)', plan_code: 'Plan 1 · Private 1-bedded', age: 40, relationship: 'self', expected: 0, renewal_only: false }, 'renewal').premium
    const spouse = linePremium(c, { product_code: 'Group Hospital & Surgical (GHS)', plan_code: 'Plan 1 · Private 1-bedded', age: 40, relationship: 'spouse', expected: 0, renewal_only: false }, 'renewal').premium
    expect(self).toBe(1537.2)
    expect(spouse).toBe(self)
  })

  it('does not cover a QBE dependant under personal accident', () => {
    const r = linePremium(qbe as unknown as Calc, { product_code: 'Group Personal Accident (GPA)', plan_code: 'Plan 1', age: 40, relationship: 'spouse', occupation_class: '1', expected: null, renewal_only: false }, 'renewal')
    expect(r.premium).toBeNull()
  })

  it('needs an occupation class for personal accident rather than guessing one', () => {
    const calc = qbe as unknown as Calc
    const table: RateTableInfo = { rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday', rates: calc.rates, rules: calc.rules }
    const q = computeQuote([{ name: 'm', category: 'All', relationship: 'self', age: 40 }], [table],
      { [calc.rate_table_id]: { 'Group Personal Accident (GPA)': { All: 'Plan 1' } } }, ['Group Personal Accident (GPA)'], 0.09, '2026-10-01')
    expect(q.lines[0].premium).toBeNull()
    expect(q.lines[0].note).toBe('occupation class needed')
  })

  it('applies QBE\'s 20% co-insurance as 0.8 x the rate', () => {
    const c = qbe as unknown as Calc
    const full = linePremium(c, { product_code: 'Group Hospital & Surgical (GHS)', plan_code: 'Plan 1 · Private 1-bedded', age: 30, relationship: 'self', expected: 0, renewal_only: false }, 'renewal').premium!
    const coins = linePremium(c, { product_code: 'Group Hospital & Surgical (GHS)', plan_code: 'Plan 1 · Private 1-bedded · 20% co-insurance', age: 30, relationship: 'self', expected: 0, renewal_only: false }, 'renewal').premium!
    expect(coins).toBe(round2(full * 0.8))
  })

  it('refuses an Income child over 24, and accepts one at 24', () => {
    const c = income as unknown as Calc
    const at = (age: number) => linePremium(c, { product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 1', age, relationship: 'child', expected: 0, renewal_only: false }, 'renewal')
    expect(at(24).premium).not.toBeNull()
    expect(at(25).premium).toBeNull()
    expect(at(25).note).toBe('child over 24 not eligible')
  })

  it('strips Income\'s inclusive GST, so S$857.83 is the price a client pays, not the price before tax', () => {
    const c = income as unknown as Calc
    const net = linePremium(c, { product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 1', age: 25, relationship: 'self', expected: 0, renewal_only: false }, 'renewal').premium!
    expect(net).toBe(round2(857.83 / 1.09))
  })
})

describe('figures pinned outside the fixtures', () => {
  // The tests above take GST treatment from the same file they check, so a wrong treatment there
  // would be self-consistent and pass. These anchors come from the insurers' own sheets instead:
  // Income's Rates!H18 "Inclusive of 9% GST" and GHS Plan 1 age 0-30 of S$857.83; QBE's Table!B49
  // "Rates above exclude GST" and Plan 1 private 1-bedded age 0-25 of S$908.88.
  const one = (calc: Calc, product: string, plan: string, age: number) => {
    const t: RateTableInfo = { rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday', rates: calc.rates, rules: calc.rules }
    return computeQuote([{ name: 'm', category: 'All', relationship: 'self', age }], [t],
      { [calc.rate_table_id]: { [product]: { All: plan } } }, [product], 0.09, '2026-10-01').per_insurer[0].total
  }
  it('Income: the client pays S$857.83, the calculator figure, not 9% more', () => {
    expect(one(income as unknown as Calc, 'Group Hospital and Surgical (GHS)', 'Plan 1', 25)).toBe(857.83)
  })
  it('QBE: the client pays S$908.88 plus 9% GST', () => {
    expect(one(qbe as unknown as Calc, 'Group Hospital & Surgical (GHS)', 'Plan 1 · Private 1-bedded', 25)).toBe(round2(908.88 + round2(908.88 * 0.09)))
  })
  it('records which cell each GST treatment was read from', () => {
    expect((income as unknown as Calc).rules.gst_treatment.treatment).toBe('inclusive')
    expect((qbe as unknown as Calc).rules.gst_treatment.treatment).toBe('exclusive')
  })
})

describe('GST follows the product, not the insurer', () => {
  // Life insurance is an exempt supply in Singapore. The engine used to apply one GST setting per
  // insurer, so Income's term life showed S$344.04 plus S$30.96 of GST that does not exist.
  it('treats term life and critical illness as exempt, everything else as taxable', () => {
    expect(gstApplies('Group Term Life (GTL)')).toBe(false)
    expect(gstApplies('Group Critical Illness (Accelerated) (GCI)')).toBe(false)
    expect(gstApplies('GTL + GACI')).toBe(false)                     // AIA's bundle: both life
    expect(gstApplies('Group Hospital and Surgical (GHS)')).toBe(true)
    expect(gstApplies('Group Personal Accident (GPA)')).toBe(true)
    expect(gstApplies('Group Dental (GD)')).toBe(true)
  })

  it('Income term life: the client pays S$375, with no GST in it', () => {
    const calc = income as unknown as Calc
    const t: RateTableInfo = { rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday', rates: calc.rates, rules: calc.rules }
    const q = computeQuote([{ name: 'm', category: 'All', relationship: 'self', age: 25 }], [t],
      { [calc.rate_table_id]: { 'Group Term Life (GTL)': { All: 'Plan 1' } } }, ['Group Term Life (GTL)'], 0.09, '2026-10-01')
    expect(q.per_insurer[0].gst).toBe(0)
    expect(q.per_insurer[0].total).toBe(375)
  })

  it('charges GST on the hospital line and not on the life line of the same quote', () => {
    const calc = income as unknown as Calc
    const t: RateTableInfo = { rate_table_id: calc.rate_table_id, insurer_name: calc.insurer, age_basis: 'last_birthday', rates: calc.rates, rules: calc.rules }
    const q = computeQuote([{ name: 'm', category: 'All', relationship: 'self', age: 25 }], [t],
      { [calc.rate_table_id]: { 'Group Term Life (GTL)': { All: 'Plan 1' }, 'Group Hospital and Surgical (GHS)': { All: 'Plan 1' } } },
      ['Group Term Life (GTL)', 'Group Hospital and Surgical (GHS)'], 0.09, '2026-10-01')
    expect(q.per_insurer[0].total).toBeCloseTo(375 + 857.83, 1)     // both exactly what the calculator says
    expect(q.per_insurer[0].gst).toBeCloseTo(857.83 - 857.83 / 1.09, 1)
  })

  it('adds no GST to life cover at an insurer with no GST rule at all', () => {
    const rates: RateRow[] = [{ product_code: 'GTL + GACI', member_type: null, plan_code: 'P1', band_label: 'All', age_min: 0, age_max: null, premium: 200 }]
    const t: RateTableInfo = { rate_table_id: 'aia', insurer_name: 'AIA', age_basis: 'last_birthday', rates }
    const q = computeQuote([{ name: 'm', category: 'All', relationship: 'self', age: 30 }], [t], { aia: { 'GTL + GACI': { All: 'P1' } } }, ['GTL + GACI'], 0.09, '2026-10-01')
    expect(q.per_insurer[0].total).toBe(200)
  })
})
