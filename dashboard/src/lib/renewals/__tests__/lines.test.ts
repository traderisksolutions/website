import { describe, expect, it } from 'vitest'
import spellings from './fixtures/line-spellings.json'
import { LINES, isLineCode, lineFor, lineName, lineOfPolicy, spellingKey, spellingOf } from '../lines'

type Row = { spelling: string; is_eb: boolean; product_line: string | null; count: number }
const rows = spellings as Row[]

describe('lineFor', () => {
  it.each([
    ['Employee Benefits - GHS, GMM, GP, SP, Dental, GPA', 'eb'],
    ['Group Hospital & Surgical Plan , Group GP, SP Outpatient Plans', 'eb'],
    ['FOREIGN WORKER MEDICAL', 'fwm'],
    ['FWMI for <person>', 'fwm'],
    ['Work Injury Compensation', 'wica'],
    ["Workmen's Comp / WIC", 'wica'],
    ["Project Employers' Liability", 'wica'],
    ['WIC Insurance, Public Liability', 'wica'],
    ['Public Liability, Work Injury Compensation', 'pl'],
    ['Public Liabity & Fire Insurance', 'pl'],
    ['Fire & Public Liability', 'property'],
    ["Contractors' All Risks, Project Employer's Liability", 'car'],
    ["Contractor's All Risks", 'car'],
    ['Contractors’ All Risk', 'car'],
    ["Erection All Risks; Project Employer's Liability", 'car'],
    ['D&0/PI/ Crime Insurance', 'do'],
    ['B.Spoke Insurance (Professional Indemnity and D&O)', 'pi'],
    ['Asset Manager Liability Insurance', 'pi'],
    ['Group Business Travel', 'group_travel'],
    ['Chubb TravelPro', 'travel'],
    ['Motor Policy - Commercial Fleet', 'motor'],
    ['Private Motor Car (Comprehensive)', 'motor'],
    ['PERFORMANCE BOND', 'bonds'],
    ['Secuirty Bond for <person>', 'bonds'],
    ['Good In Transit', 'marine'],
    ["Freight Forwarder's Liability, Goods-in-Transit, Fidelity Guarantee", 'marine'],
    ['GE BizSupreme for Stall', 'business_package'],
    ['F&B All Risks & WIC', 'business_package'],
    ['Maid Insurance Package', 'domestic_helper'],
    ['Cyber Liability Insurance', 'cyber'],
    ['GATLB', 'other'],
    ['', 'other'],
  ])('%s → %s', (s, code) => expect(lineFor(s)).toBe(code))
})

describe('the real spellings (fixture, names removed)', () => {
  const OTHER = new Set(['GATLB', 'WCODC', 'EXCESS PROTECTOR INSURANCE', 'Excess Protector Insurance'])
  it('carries every policy on the register and no person names', () => {
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(460)
    expect(rows.filter(r => / for [A-Z][a-z]+ [A-Z][a-z]+$/.test(r.spelling))).toEqual([])
  })
  it('maps every spelling to a line; only the unknown few go to Other', () => {
    const other = rows.filter(r => lineOfPolicy({ class_of_insurance: r.spelling, product_line: r.product_line, is_eb: r.is_eb }) === 'other').map(r => r.spelling)
    expect(other.filter(s => !OTHER.has(s))).toEqual([])
  })
  it('puts every flagged Employment Benefits policy on Employment Benefits', () => {
    for (const r of rows.filter(r => r.is_eb)) expect(lineOfPolicy({ class_of_insurance: r.spelling, product_line: r.product_line, is_eb: true })).toBe('eb')
  })
})

describe('lineOfPolicy and keys', () => {
  it('uses the product line slug when the words name nothing', () => {
    expect(lineOfPolicy({ class_of_insurance: 'Policy', product_line: 'surety_bonds' })).toBe('bonds')
    expect(lineOfPolicy({ class_of_insurance: null, product_line: 'iar_fire' })).toBe('property')
  })
  it('keys a spelling by lower case and single spaces', () => {
    expect(spellingKey('  Foreign  Worker MEDICAL ')).toBe('foreign worker medical')
    expect(spellingOf({ class_of_insurance: ' ', product_line: 'wica' })).toBe('wica')
  })
  it('names every line and knows its codes', () => {
    expect(LINES).toHaveLength(19)
    expect(lineName('car')).toBe('Contractors’ All Risks')
    expect(isLineCode('eb')).toBe(true)
    expect(isLineCode('nope')).toBe(false)
  })
})
