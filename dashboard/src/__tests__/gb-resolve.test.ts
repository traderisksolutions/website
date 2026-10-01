/**
 * The resolver is checked against the labels three real insurers actually printed — every
 * distinct product_code in gb_rates as at 2 Oct 2026 — not against invented strings. These are
 * the cases the earlier one-to-one mapping could not express, so they are the cases worth
 * pinning down.
 */
import { describe, it, expect } from 'vitest'
import { resolveProduct, resolveBenefit, norm } from '@/lib/gb/resolve'
import { BENEFITS, PRODUCTS, roomTierRank } from '@/lib/gb/canon'

describe('norm', () => {
  it('keeps word boundaries that the old normaliser destroyed', () => {
    // Stripping punctuation outright gave "gtlgaci", against which every \b pattern failed.
    expect(norm('GTL + GACI')).toBe('gtl gaci')
    expect(norm('GHS+EMM')).toBe('ghs emm')
    expect(norm('GP COPAY S$0 + SP')).toBe('gp copay s 0 sp')
  })
})

describe('resolveProduct — the 17 labels AIA, Income and QBE actually printed', () => {
  const cases: [string, string[]][] = [
    ['GHS+EMM',                                    ['GHS', 'EMM']],
    ['GHS-FW',                                     ['GHS_FW']],
    ['GTL',                                        ['GTL']],
    ['GTL + GACI',                                 ['GTL', 'GCI']],
    ['GADD',                                       ['GADD']],
    ['GP',                                         ['GOPC']],
    ['GP COPAY S$0 + SP',                          ['GOPC', 'GOSC']],
    ['GP COPAY S$5 + SP',                          ['GOPC', 'GOSC']],
    ['DENTAL',                                     ['GD']],
    ['Group Hospital and Surgical (GHS)',          ['GHS']],
    ['Group Hospital & Surgical (GHS)',            ['GHS']],
    ['Group Term Life (GTL)',                      ['GTL']],
    ['Group Critical Illness (Accelerated) (GCI)', ['GCI']],
    ['Group Personal Accident (GPA)',              ['GPA']],
    ['Group Outpatient Primary Care (GOPC)',       ['GOPC']],
    ['Group Outpatient Specialist Care (GOSC)',    ['GOSC']],
    ['Group Dental (GD)',                          ['GD']],
  ]
  for (const [label, expected] of cases) {
    it(`${label} -> ${expected.join('+')}`, () => {
      expect(resolveProduct(label).codes).toEqual(expected)
    })
  }

  it('resolves every one of them without leftover wording', () => {
    for (const [label] of cases) expect(resolveProduct(label).via).toBe('rule')
  })

  it('treats a bundle as two covers, which is the whole reason codes is an array', () => {
    expect(resolveProduct('GHS+EMM').codes).toHaveLength(2)
    expect(resolveProduct('GTL + GACI').codes).toHaveLength(2)
  })

  it('reports the foreign-worker product alone, never also plain GHS', () => {
    expect(resolveProduct('GHS-FW').codes).toEqual(['GHS_FW'])
    expect(resolveProduct('GHS-FW').variant.member_scope).toBe('foreign_worker')
  })

  it('keeps the co-payment as a variant rather than inventing a product for it', () => {
    const a = resolveProduct('GP COPAY S$0 + SP')
    const b = resolveProduct('GP COPAY S$5 + SP')
    expect(a.codes).toEqual(b.codes)                 // same cover
    expect(a.variant.co_payment).toBe('S$0')          // different tier
    expect(b.variant.co_payment).toBe('S$5')
  })

  it('does not confuse GADD with Group Dental', () => {
    expect(resolveProduct('GADD').codes).toEqual(['GADD'])
    expect(resolveProduct('GADD').codes).not.toContain('GD')
  })

  it('returns nothing, rather than a guess, for wording it has never seen', () => {
    const r = resolveProduct('Group Widget Protection Scheme')
    expect(r.codes).toEqual([])
    expect(r.via).toBe('none')
  })
})

describe('resolveBenefit — the 28 benefit rows already extracted', () => {
  const cases: [string | null, string, string[], string][] = [
    ['Critical Illness', 'Angioplasty Advance Benefit',              ['GCI'],  'GCI_ANGIOPLASTY'],
    ['Critical Illness', 'Critical Illness Benefit',                 ['GCI'],  'GCI_SUM_ASSURED'],
    ['Accident',         'Major Burns',                              ['GADD'], 'GADD_MAJOR_BURNS'],
    ['Accident',         'Children Education Fund',                  ['GADD'], 'GADD_EDUCATION'],
    ['GHS Coverage',     'Hospital Confinement',                     ['GHS'],  'GHS_ROOM_BOARD'],
    ['EMM Coverage',     'Extended Major Medical',                   ['EMM'],  'EMM_ANNUAL_LIMIT'],
    ['TPD',              'Total & Permanent Disability',             ['GTL'],  'GTL_TPD'],
    ['Death',            'Death',                                    ['GTL'],  'GTL_DEATH'],
    ['Terminal Illness', 'Terminal Illness',                         ['GTL'],  'GTL_TERMINAL'],
    ['Allowance',        'Compassionate Death/TPD Allowance',        ['GTL'],  'GTL_COMPASSIONATE'],
    ['Hospital',         'Room and Board',                           ['GHS'],  'GHS_ROOM_BOARD'],
    ['Hospital',         'Miscarriage Benefit',                      ['GHS'],  'GHS_MISCARRIAGE'],
    ['Hospital',         'Intensive Care Unit / High Dependency',    ['GHS'],  'GHS_ICU'],
    ['Hospital',         'Emergency Accidental Out-patient',         ['GHS'],  'GHS_EMERG_ACC_OP'],
    ['Other',            'Rehabilitation Benefits',                  ['GHS'],  'GHS_REHAB'],
    ['Other',            'Home Nursing Care',                        ['GHS'],  'GHS_HOME_NURSING'],
    ['Other',            'Death Benefit',                            ['GHS'],  'GHS_DEATH'],
    ['Other',            'Outpatient Kidney Dialysis',               ['GHS'],  'GHS_OP_KIDNEY'],
    ['Other',            'Outpatient Cancer Treatment',              ['GHS'],  'GHS_OP_CANCER'],
    ['Other',            'Surgical Implants',                        ['GHS'],  'GHS_IMPLANTS'],
    ['Other',            'Inpatient Psychiatric Treatment',          ['GHS'],  'GHS_PSYCH'],
    ['Overall',          'Overall Annual Limit',                     ['GHS'],  'GHS_ANNUAL_LIMIT'],
    ['Group basic Hospital & Surgical benefits', 'Annual Policy Limit (APL)', ['GHS'], 'GHS_ANNUAL_LIMIT'],
    ['Other',            'Outpatient Dental Treatment (due to accident)', ['GHS'], 'GHS_EMERG_DENTAL'],
  ]
  for (const [cat, name, products, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(resolveBenefit(cat, name, products).code).toBe(expected)
    })
  }

  it('maps all four spellings of the hospital & surgical category onto one annual-limit line', () => {
    // These four categories are the reason nothing could be compared before.
    const spellings = ['GHS Coverage', 'Hospital', 'Overall', 'Group basic Hospital & Surgical benefits']
    const codes = spellings.map(c => resolveBenefit(c, 'Annual Policy Limit', ['GHS']).code)
    expect(new Set(codes).size).toBe(1)
    expect(codes[0]).toBe('GHS_ANNUAL_LIMIT')
  })

  it('reads "annual limit" as a different line depending on the product', () => {
    expect(resolveBenefit(null, 'Annual Limit', ['GHS']).code).toBe('GHS_ANNUAL_LIMIT')
    expect(resolveBenefit(null, 'Dental Annual Limit', ['GD']).code).toBe('GD_ANNUAL_LIMIT')
    expect(resolveBenefit(null, 'Specialist Annual Limit', ['GOSC']).code).toBe('GOSC_ANNUAL_LIMIT')
  })

  it('never returns a line belonging to a product that was not quoted', () => {
    expect(resolveBenefit('Hospital', 'Room and Board', ['GTL']).code).toBeNull()
  })
})

describe('canon integrity', () => {
  it('every benefit belongs to a declared product', () => {
    const products = new Set(PRODUCTS.map(p => p.code))
    for (const b of BENEFITS) expect(products.has(b.productCode)).toBe(true)
  })
  it('has no duplicate codes', () => {
    expect(new Set(BENEFITS.map(b => b.code)).size).toBe(BENEFITS.length)
    expect(new Set(PRODUCTS.map(p => p.code)).size).toBe(PRODUCTS.length)
  })
  it('ranks ward classes by privacy, best first', () => {
    expect(roomTierRank('1 Bed')!).toBeLessThan(roomTierRank('4 Bed')!)
    expect(roomTierRank('2-Bedded')!).toBeLessThan(roomTierRank('Class B2')!)
    expect(roomTierRank('something else')).toBeNull()
  })
})

describe('benefit scope widened by the row\'s own wording', () => {
  it('finds the EMM line on a row AIA filed under GHS', () => {
    // The real row: product_code "GHS", category "EMM Coverage", name "Extended Major Medical".
    // Scoped by the filed product alone it resolves to nothing; the category names the product.
    expect(resolveBenefit('EMM Coverage', 'Extended Major Medical', ['GHS']).code).toBeNull()
    expect(resolveBenefit('EMM Coverage', 'Extended Major Medical', ['GHS', 'EMM']).code).toBe('EMM_ANNUAL_LIMIT')
    expect(resolveProduct('EMM Coverage').codes).toEqual(['EMM'])
  })
  it('bare categories name no product, so the widening stays narrow', () => {
    for (const c of ['Hospital', 'Other', 'Overall', 'Death', 'TPD', 'Allowance', 'Accident']) {
      expect(resolveProduct(c).codes).toEqual([])
    }
  })
})

describe('lines added from the first canonical scan (2 Oct 2026)', () => {
  const cases: [string, string][] = [
    ['Ambulance Charges',        'GHS_AMBULANCE'],
    ['Short Stay Ward',          'GHS_SHORT_STAY'],
    ['Parent Accommodation',     'GHS_PARENT_ACCOM'],
    ['Medical Report Fees',      'GHS_MEDICAL_REPORT'],
    ['Emergency Assistance',     'GHS_EMERG_ASSIST'],
    ['Dread Disease Recuperation Benefit', 'GHS_DREAD_DISEASE'],
    ['Hospital Cash Downgrade Benefit',    'GHS_CASH_DOWNGRADE'],
  ]
  for (const [name, code] of cases) {
    it(`${name} -> ${code}`, () => expect(resolveBenefit(null, name, ['GHS']).code).toBe(code))
  }

  it('reads a daily cash Confinement Benefit as cash, not as room & board', () => {
    // Both patterns match the word "confinement"; the longer match has to win or a daily cash
    // payment lands in the ward-class row and gets ranked against "1 Bed".
    expect(resolveBenefit(null, 'Confinement Benefit [Daily cash benefit per day starting on day 4]', ['GHS']).code)
      .toBe('GHS_CONFINEMENT_CASH')
    expect(resolveBenefit('GHS Coverage', 'Hospital Confinement', ['GHS']).code).toBe('GHS_ROOM_BOARD')
  })
})

describe('a label that lists several products', () => {
  // AIA's rate table is one brochure covering nine products, labelled as a single string.
  const AIA = 'GTL · GHS+EMM · GHS-FW · GTL + GACI · GP · GP COPAY S$0 + SP · GP COPAY S$5 + SP · GADD · DENTAL'

  it('reports every product in the list', () => {
    const codes = resolveProduct(AIA).codes
    for (const c of ['GHS', 'EMM', 'GHS_FW', 'GTL', 'GCI', 'GOPC', 'GOSC', 'GADD', 'GD']) {
      expect(codes).toContain(c)
    }
  })

  it('keeps GHS even though GHS-FW is also named', () => {
    // The whole-label supersede dropped GHS here, so the annual scan ran against AIA's brochure
    // with no hospital & surgical lines in its prompt and reported its room & board as unmatched.
    expect(resolveProduct(AIA).codes).toContain('GHS')
    expect(resolveProduct(AIA).codes).toContain('GHS_FW')
  })

  it('still reports GHS_FW alone when the label names only that', () => {
    expect(resolveProduct('GHS-FW').codes).toEqual(['GHS_FW'])
    expect(resolveProduct('Group Hospital & Surgical — Foreign Worker').codes).toEqual(['GHS_FW'])
  })
})
