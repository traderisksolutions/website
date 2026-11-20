// @vitest-environment node
/**
 * TRS EB Package Calculator V1.5 (Nathan, 17 Nov 2026) as the pricing reference: the file is
 * picked and parsed, every rule of eb-rules.md the app prices by is applied, and the workbook's
 * own worked example (10 lives, 14 Feb 2027, new business; census anonymised here) is reproduced
 * to the cent on the five medical covers. Where the filled workbook is wrong (blank occupation
 * class prices 0 without a word; AIA GP priced beside the combined GP and specialist rider) the
 * corrected behaviour is asserted and the difference written down.
 *
 * The fixture is the V1.5 file itself: its Census sheet is empty (no client data).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseWorkbook, pickWorkbookFile, workbookVersion, type Workbook } from '@/lib/gb/workbook'
import { classOf, dependantsCovered, hospitalFacts, indexRates, limitBasisOf, priceCover, sameHospital } from '@/lib/gb/compare-cover'
import { allowedPlans, applyRules, DEFAULT_RULES } from '@/lib/gb/plan-pairs'
import { priceDesign, rateWarnings } from '@/lib/gb/eb-price'
import { headcountWarnings, tierPicks } from '@/lib/gb/eb-compare'
import type { Member } from '@/lib/gb-quote'

const FILE = 'TRS EB Package Calculator V1.5.xlsx'
const wb: Workbook = parseWorkbook(readFileSync(path.join(__dirname, 'fixtures', FILE)), { name: FILE, driveFileId: null, modifiedAt: '2026-11-17' })
const idx = indexRates(wb)
const RCC = 'RCC Enhanced III', INC = 'Income FlexCare', QBE = 'Steadfast MCare+', SL = 'Singlife MyBenefits Plus', AIA = 'AIA Flexi Vital Care Plus'
const H = 'Hospital & Surgical', MM = 'Major Medical', GP = 'Outpatient GP', SP = 'Outpatient Specialist', D = 'Dental', TL = 'Term Life', CI = 'Critical Illness', PA = 'Personal Accident', EAP = 'EAP (add-on)'
const benefitsOf = (p: string) => (c: string, plan: string) => Object.fromEntries(wb.benefits.filter(b => b.insurer === p && b.cover === c && b.plan === plan).map(b => [b.id, b.value]))

describe('1 · the calculator file', () => {
  it('takes "TRS EB Package Calculator" as well as "TRS EB Calculator", highest version by number', () => {
    const f = (filename: string) => ({ filename, planYear: null })
    expect(pickWorkbookFile([f('TRS EB Calculator V1.2.xlsx'), f('TRS EB Package Calculator V1.5.xlsx'), f('Master_EB_Premium_Calculator.xlsx')])?.filename).toBe('TRS EB Package Calculator V1.5.xlsx')
    expect(pickWorkbookFile([f('TRS EB Package Calculator V1.5.xlsx'), f('TRS EB Package Calculator V1.10.xlsx'), f('TRS EB Package Calculator V1.4.2.xlsx')])?.filename).toBe('TRS EB Package Calculator V1.10.xlsx')
    expect(pickWorkbookFile([f('TRS EB Package Calculator V1.4.2.xlsx'), f('TRS EB Calculator V1.4.xlsx')])?.filename).toBe('TRS EB Package Calculator V1.4.2.xlsx')
    expect(pickWorkbookFile([f('notes.docx')])).toBeNull()
    expect(workbookVersion('TRS EB Package Calculator V1.4.2.xlsx')).toEqual([1, 4, 2])
  })
  it('parses V1.5: every Rates row, past row 871 where the Calc sheet stops for RCC, Income and Steadfast', () => {
    expect(wb.rates).toHaveLength(1673)
    for (const p of [RCC, INC, QBE, SL, AIA]) expect(wb.rates.some(r => r.insurer === p)).toBe(true)
    // Steadfast's EAP (Rates row 858) and AIA's accident rows (1635-1670) are read.
    expect(wb.rates.find(r => r.insurer === QBE && r.cover === EAP)?.net).toBe(50)
    expect(wb.rates.filter(r => r.insurer === AIA && r.cover === PA)).toHaveLength(36)
    expect(wb.lists[SL][H]).toContain('Plan 1A (Govt/Restr, 20% co-ins)')
  })
})

describe('2 · term life, critical illness and EAP priced from the workbook', () => {
  const ee: Member = { name: 'E', category: 'S', relationship: 'self', dob: '1986-06-01', occupation_class: '1' }
  const o = { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 6 }
  it('each of RCC, Income, Singlife and AIA prices term life and critical illness; Steadfast EAP S$50 an employee (Rates row 858)', () => {
    for (const p of [RCC, INC, SL, AIA]) {
      expect(priceCover(idx, p, TL, wb.lists[p][TL][0], [ee], o).premium).toBeGreaterThan(0)
      expect(priceCover(idx, p, CI, wb.lists[p][CI][0], [ee], o).premium).toBeGreaterThan(0)
    }
    expect(priceCover(idx, QBE, EAP, 'Include ($50/employee)', [ee, { ...ee, relationship: 'spouse' }], o).premium).toBe(50)
    expect(wb.lists[QBE][TL] ?? []).toEqual([])
  })
  it('critical illness: the same plan as term life at Income, Singlife and AIA; at RCC not above the term life sum', () => {
    const rule = (p: string) => DEFAULT_RULES.find(r => r.product === p && r.cover === CI)!
    expect(allowedPlans(rule(INC), 'Plan 3 ($200k)', wb.lists[INC][CI])).toEqual(['Plan 3 ($100k)'])
    expect(allowedPlans(rule(AIA), 'Plan 2 ($80k)', wb.lists[AIA][CI])).toEqual(['Plan 2 ($40k)'])
    expect(allowedPlans(rule(SL), 'Plan 4 ($200k)', wb.lists[SL][CI])).toEqual(['Plan 4 ($200k)'])
    expect(allowedPlans(rule(SL), 'Plan 6 ($500k)', wb.lists[SL][CI])[0]).toBe('Plan 5 ($300k)')          // GTL Plan 6 caps CI at Plan 5
    expect(allowedPlans(rule(RCC), 'Plan 4 ($100k)', wb.lists[RCC][CI])).toEqual(['Plan 3 ($75k)', 'Plan 4 ($50k)', 'Plan 5 ($25k)'])
    expect(applyRules(DEFAULT_RULES, RCC, { [TL]: 'Plan 5 ($50k)', [CI]: 'Plan 1 ($250k)' }, wb.lists[RCC])[CI]).toBe('Plan 4 ($50k)')
    expect(applyRules(DEFAULT_RULES, INC, { [TL]: '', [CI]: 'Plan 1 ($250k)' }, wb.lists[INC])[CI]).toBe('')
  })
})

describe('3 · AIA personal accident: employee and dependant rates (Rates!K), class never assumed', () => {
  const o = { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 6 }
  it('employee Plan 4 class 1 S$91.67 (row 1638); dependant S$52.78 (row 1656, insured at 50% of the sum)', () => {
    const ee: Member = { name: 'E', category: 'S', relationship: 'self', dob: '1980-01-01', occupation_class: '1' }
    const sp: Member = { name: 'S', category: 'S', relationship: 'spouse', dob: '1982-01-01', occupation_class: '1' }
    expect(priceCover(idx, AIA, PA, 'Plan 4 ($180k)', [ee], o).premium).toBe(91.67)
    expect(priceCover(idx, AIA, PA, 'Plan 4 ($180k)', [ee, sp], o).premium).toBe(144.45)
  })
  it('a life with no occupation class is left unpriced and counted, never priced as Class 1', () => {
    const r = priceCover(idx, AIA, PA, 'Plan 4 ($180k)', [{ name: 'E', category: 'S', relationship: 'self', dob: '1980-01-01' }], o)
    expect(r).toEqual({ premium: null, missing: 0, noClass: 1 })
    expect(classOf({ name: 'x', category: '', relationship: 'self', occupation_class: 'Class 2' })).toBe('Class 2')
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: '2027-02-14', basis: 'new_business', currentInsurer: null, categories: [{ name: 'S', members: [{ name: 'E', category: 'S', relationship: 'self', dob: '1980-01-01' }], today: {} }] })
    expect(p.notes).toContain('Occupation class missing for 1 life')
  })
})

describe('4 · GP and specialist', () => {
  it('Singlife and AIA: specialist includes GP, one or the other, never both; the one just chosen stays', () => {
    for (const p of [SL, AIA]) {
      const both = { [GP]: wb.lists[p][GP][0], [SP]: wb.lists[p][SP][0] }
      expect(applyRules(DEFAULT_RULES, p, both, wb.lists[p])[GP]).toBe('')
      expect(applyRules(DEFAULT_RULES, p, both, wb.lists[p], GP)).toMatchObject({ [GP]: wb.lists[p][GP][0], [SP]: '' })
      expect(applyRules(DEFAULT_RULES, p, { [GP]: wb.lists[p][GP][0], [SP]: '' }, wb.lists[p])[GP]).toBe(wb.lists[p][GP][0])
    }
  })
  it('AIA GP taken alone is priced (no longer 0): Plan 1 employee age 40, Rates row 1595', () => {
    const o = { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 6 }
    expect(priceCover(idx, AIA, GP, 'Plan 1 (no co-pay)', [{ name: 'E', category: 'S', relationship: 'self', dob: '1986-06-01' }], o).premium).toBe(235.18)
  })
  it('RCC: specialist needs GP', () => {
    expect(applyRules(DEFAULT_RULES, RCC, { [GP]: '', [SP]: 'Plan 1' }, wb.lists[RCC])[SP]).toBe('')
  })
  it('Same tier at Singlife and AIA takes the specialist rider and leaves GP in it', () => {
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: '2027-02-14', basis: 'new_business', currentInsurer: null, categories: [{ name: 'S', members: [{ name: 'E', category: 'S', relationship: 'self', dob: '1986-06-01' }, { name: 'F', category: 'S', relationship: 'self', dob: '1984-06-01' }], today: {} }] })
    for (const prod of [SL, AIA]) {
      expect(p.categories[0].products[prod].gp.same).toEqual({ plan: '', reason: 'in specialist' })
      expect(p.categories[0].products[prod].sp.same.plan).not.toBe('')
    }
  })
})

describe('5 · major medical ties', () => {
  const r = (p: string) => DEFAULT_RULES.find(x => x.product === p && x.cover === MM)!
  it('RCC and Singlife: same plan number, none with RCC Plan 1 or Singlife Plan 6; Singlife A-plans keep their major medical', () => {
    expect(allowedPlans(r(RCC), 'Plan 2B (PTE 1-bed, 20% co-pay)', wb.lists[RCC][MM])).toEqual(['Plan 2A/2B'])
    expect(allowedPlans(r(RCC), 'Plan 1 (PTE 1-bed)', wb.lists[RCC][MM])).toEqual([])
    expect(allowedPlans(r(SL), 'Plan 1A (Govt/Restr, 20% co-ins)', wb.lists[SL][MM])).toEqual(['Plan 1'])
    expect(allowedPlans(r(SL), 'Plan 6 (Pte 1-bed)', wb.lists[SL][MM])).toEqual([])
  })
  it('Income (Plans 2-5), AIA and Steadfast carry it in the hospital premium', () => {
    expect(r(INC)).toMatchObject({ premium: 'included', required: true })
    expect(r(AIA)).toMatchObject({ premium: 'included', required: true })
    expect(r(QBE)).toMatchObject({ premium: 'included', required: true })
  })
})

describe('6 and 8 · co-insurance and limit basis', () => {
  it('Singlife "Nil (Major Medical add-on 20%)" is no co-insurance; the A-plans are 20%', () => {
    expect(hospitalFacts(benefitsOf(SL)(H, 'Plan 5 (Pte 1-bed)'), SL, 'Plan 5 (Pte 1-bed)').coins).toBe(0)
    expect(hospitalFacts(benefitsOf(SL)(H, 'Plan 5A (Pte 1-bed, 20% co-ins)'), SL, 'Plan 5A (Pte 1-bed, 20% co-ins)').coins).toBe(20)
  })
  it('the top private 1-bed plan is annual, every lower plan per disability, FW plans annual, Steadfast annual', () => {
    expect([limitBasisOf(RCC, 'Plan 1 (PTE 1-bed)'), limitBasisOf(RCC, 'Plan 2A (PTE 1-bed)')]).toEqual(['annual', 'per_disability'])
    expect([limitBasisOf(INC, 'Plan 1 (Private 1-bed)'), limitBasisOf(INC, 'Plan 2 (Private 1-bed)'), limitBasisOf(INC, 'Plan 7 (WP/S Pass, Restr. 4-bed)')]).toEqual(['annual', 'per_disability', 'annual'])
    expect([limitBasisOf(SL, 'Plan 6 (Pte 1-bed)'), limitBasisOf(SL, 'Plan 6A (Pte 1-bed, 20% co-ins)'), limitBasisOf(SL, 'Plan 5 (Pte 1-bed)')]).toEqual(['annual', 'annual', 'per_disability'])
    expect([limitBasisOf(AIA, 'Plan 4 (Pte 1-bed)'), limitBasisOf(AIA, 'Plan 3 (Pte 1-bed)')]).toEqual(['annual', 'per_disability'])
    expect(limitBasisOf(QBE, 'Plan 5 · Govt 4-bed · 0%')).toBe('annual')
  })
  it('matching uses it: S$25,000 per disability private 1-bed is AIA Plan 3 (V1.5 benefit rows), S$250,000 a year is Plan 4', () => {
    const t = (limit: number, basis: 'annual' | 'per_disability') => ({ hospital: 'private' as const, beds: 1, limit, basis, coins: 0 })
    expect(sameHospital(benefitsOf(AIA), wb.lists[AIA][H], t(25_000, 'per_disability'), AIA)).toEqual({ plan: 'Plan 3 (Pte 1-bed)', reason: 'same' })
    expect(sameHospital(benefitsOf(AIA), wb.lists[AIA][H], t(250_000, 'annual'), AIA)).toEqual({ plan: 'Plan 4 (Pte 1-bed)', reason: 'same' })
  })
})

describe('7 and 9 · dependants, age basis, group factor, headcount', () => {
  it('dependants: RCC and Steadfast medical only; Income, Singlife and AIA every cover; EAP employees only', () => {
    expect([dependantsCovered(RCC, H), dependantsCovered(RCC, TL), dependantsCovered(QBE, PA)]).toEqual([true, false, false])
    expect([dependantsCovered(INC, TL), dependantsCovered(SL, PA), dependantsCovered(AIA, CI), dependantsCovered(QBE, EAP)]).toEqual([true, true, true, false])
  })
  it('RCC group factor on medical lines (Calc!AH2): x1.5 for one employee, x0.95 for 5-9, x0.9 for 10+', () => {
    const ee: Member = { name: 'E', category: 'S', relationship: 'self', dob: '1986-06-01' }
    const at = (n: number) => priceCover(idx, RCC, D, 'Plan 1', [ee], { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: n }).premium!
    const base = at(3)
    expect(at(1)).toBeCloseTo(base * 1.5, 2); expect(at(6)).toBeCloseTo(base * 0.95, 2); expect(at(12)).toBeCloseTo(base * 0.9, 2)
    expect(priceCover(idx, RCC, TL, 'Plan 5 ($50k)', [ee], { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 1 }).premium)
      .toBe(priceCover(idx, RCC, TL, 'Plan 5 ($50k)', [ee], { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 3 }).premium)
  })
  it('headcount is warned, not blocked: Income 2 per plan, Singlife 2 employees, AIA 5 to 50 lives', () => {
    const one: Member[] = [{ name: 'E', category: 'S', relationship: 'self', dob: '1986-06-01' }]
    const p = priceDesign({ wb, rules: DEFAULT_RULES, effectiveDate: '2027-02-14', basis: 'new_business', currentInsurer: null, categories: [{ name: 'S', members: one, today: { hs: 3 } }] })
    expect(headcountWarnings(p, SL, tierPicks(p, SL, 'same'))).toEqual(['Singlife needs 2 employees; this census has 1'])
    expect(headcountWarnings(p, AIA, tierPicks(p, AIA, 'same'))).toEqual(['AIA takes 5 to 50 lives; this census has 1'])
    expect(headcountWarnings(p, INC, tierPicks(p, INC, 'same'))[0]).toMatch(/^Income needs 2 employees per plan; Plan \d has 1$/)
    expect(headcountWarnings(p, RCC, tierPicks(p, RCC, 'same'))).toEqual([])
  })
})

describe('10 · rate version by start date (Summary!B35)', () => {
  it('V1.5 Singlife rates apply from 1 Dec 2026; an earlier start date is warned', () => {
    expect(rateWarnings(FILE, '2026-11-01')).toEqual({ [SL]: ['Rates from 1 Dec 2026; this start date needs calculator V1.4.2'] })
    expect(rateWarnings(FILE, '2026-12-01')).toEqual({})
    expect(rateWarnings('TRS EB Calculator V1.2.xlsx', '2026-11-01')).toEqual({})
  })
})

describe('the V1.5 worked example, to the cent', () => {
  // 10 lives as the filled workbook holds them (Census rows 9-18), names and dates of birth replaced:
  // ages last birthday on 14 Feb 2027 as the workbook computes them (Census!G9:G18).
  const dob = (alb: number) => `${2026 - alb}-06-01`
  const A = (alb: number): Member => ({ name: `A${alb}`, category: 'A', relationship: 'self', dob: dob(alb) })
  const B = (alb: number, rel: 'self' | 'child', cls?: string): Member => ({ name: `B${alb}${rel}`, category: 'B', relationship: rel, dob: dob(alb), ...(cls ? { occupation_class: cls } : {}) })
  const groupA = [A(39), A(39), A(34), A(29)]
  const groupB = [B(45, 'self', '1'), B(9, 'child'), B(45, 'self', '1'), B(12, 'child'), B(11, 'child'), B(10, 'child')]
  const plans: Record<string, Record<string, [string, string]>> = {          // cover → [group A plan, group B plan]
    [RCC]: { [H]: ['Plan 1 (PTE 1-bed)', 'Plan 2A (PTE 1-bed)'], [MM]: ['', 'Plan 2A/2B'], [GP]: ['Plan 1 (no co-pay)', 'Plan 1 (no co-pay)'], [SP]: ['Plan 1', 'Plan 1'], [D]: ['Plan 1', 'Plan 1'], [PA]: ['Plan 3 ($150k)', 'Plan 3 ($150k)'] },
    [INC]: { [H]: ['Plan 1 (Private 1-bed)', 'Plan 2 (Private 1-bed)'], [MM]: ['', 'Plan 2'], [GP]: ['Plan 1', 'Plan 1'], [SP]: ['Plan 1', 'Plan 1'], [D]: ['Plan 1', 'Plan 1'], [PA]: ['Plan 3 ($100k)', 'Plan 3 ($100k)'] },
    [QBE]: { [H]: ['Plan 1 · Private 1-bed · 0%', 'Plan 3 · Private 1-bed · 0%'], [MM]: ['', ''], [GP]: ['Plan 1 (no co-pay)', 'Plan 1 (no co-pay)'], [SP]: ['Plan 2 · 0%', 'Plan 2 · 0%'], [D]: ['Plan 1 · Panel', 'Plan 1 · Panel'], [PA]: ['Plan 3 ($150k)', 'Plan 3 ($150k)'] },
    [SL]: { [H]: ['Plan 6 (Pte 1-bed)', 'Plan 5 (Pte 1-bed)'], [MM]: ['', 'Plan 5'], [GP]: ['', ''], [SP]: ['Plan 6', 'Plan 6'], [D]: ['Plan 3', 'Plan 3'], [PA]: ['Plan 3 ($150k)', 'Plan 3 ($150k)'] },
    [AIA]: { [H]: ['Plan 4 (Pte 1-bed)', 'Plan 3 (Pte 1-bed)'], [MM]: ['', ''], [GP]: ['Plan 1 (no co-pay)', 'Plan 1 (no co-pay)'], [SP]: ['Plan 4 ($0 co-pay)', 'Plan 4 ($0 co-pay)'], [D]: ['Plan 1', 'Plan 1'], [PA]: ['Plan 4 ($180k)', 'Plan 4 ($180k)'] },
  }
  const o = { effectiveDate: '2027-02-14', renewal: false, employeesInCompany: 6 }
  const cover = (p: string, c: string) => {
    const [a, b] = plans[p][c]
    const ra = a ? priceCover(idx, p, c, a, groupA, o) : null, rb = b ? priceCover(idx, p, c, b, groupB, o) : null
    return { premium: Math.round(((ra?.premium ?? 0) + (rb?.premium ?? 0)) * 100) / 100, noClass: (ra?.noClass ?? 0) + (rb?.noClass ?? 0) }
  }
  // Summary!C10:G14 of the filled V1.5 (cached values), S$ a year net of GST.
  const WORKBOOK: Record<string, number[]> = {
    [RCC]: [7925.43, 227.22, 3293.84, 3447.36, 3081.23], [INC]: [6038.80, 0, 2880.00, 2040.00, 1940.00], [QBE]: [9040.00, 0, 4130.00, 3940.00, 2930.00],
    [SL]: [7557.00, 184.00, 0, 5420.00, 3130.00], [AIA]: [8013.01, 0, 2448.16, 6455.58, 3992.60],
  }
  it('hospital, major medical, GP, specialist and dental match the workbook to the cent at all five', () => {
    for (const [p, want] of Object.entries(WORKBOOK)) expect([H, MM, GP, SP, D].map(c => cover(p, c).premium), p).toEqual(want)
  })
  it('AIA: the workbook adds GP beside the combined specialist rider (S$2,448.16, Summary!B33 says not to); the rules take it out', () => {
    const ruled = applyRules(DEFAULT_RULES, AIA, Object.fromEntries(Object.entries(plans[AIA]).map(([c, [, b]]) => [c, b])), wb.lists[AIA])
    expect(ruled[GP]).toBe('')
    const total = [H, MM, SP, D].reduce((a, c) => a + cover(AIA, c).premium, 0)
    expect(Math.round(total * 100) / 100).toBe(18461.19)                    // 21,092.69 in the workbook less GP 2,448.16 and its PA 183.34
  })
  it('personal accident: the workbook prices 0 for the 4 employees with no class without a word; we leave them unpriced and count them', () => {
    expect(cover(RCC, PA)).toEqual({ premium: 111.12, noClass: 4 })            // children: RCC insures no dependant for PA
    expect(cover(INC, PA)).toEqual({ premium: 84, noClass: 8 })                // children are insured at Income, and have no class either
    expect(cover(QBE, PA)).toEqual({ premium: 46, noClass: 4 })
    expect(cover(SL, PA)).toEqual({ premium: 135, noClass: 8 })
    expect(cover(AIA, PA)).toEqual({ premium: 183.34, noClass: 8 })            // 2 x 91.67, Rates row 1638
  })
})
