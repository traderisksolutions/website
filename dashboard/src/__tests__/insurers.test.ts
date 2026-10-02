/**
 * Matching runs against the real list: the 31 insurer companies on file and the names the three
 * rate tables and the old 23-row directory actually use.
 */
import { describe, it, expect } from 'vitest'
import { matchInsurer, normInsurer, displayName, type InsurerCompany } from '@/lib/insurers'

const NAMES = ['AIA', 'AIG', 'ALLIANZ', 'APRIL', 'ATRADIUS', 'AXA XL', 'BERKLEY ASIA', 'BHSI',
  'CHINA TAPING (CTPIS)', 'CHUBB', 'CIGNA', 'COFACE', 'DELTA', 'ECICS', 'EQ', 'ERGO',
  'GREAT AMERICAN INSURANCE COMPANY', 'GREAT EASTERN', 'HLAS', 'INCOME',
  'INDIA INTERNATIONAL INSURANCE PTE LTD', 'LIBERTY', 'MAPFRE', 'MAPFRE RE', 'MSIG', 'QBE',
  'RAFFLES HEALTH INSURANCE', 'SINGAPORE LIFE LTD.', 'SOMPO', 'TOKIO MARINE INSURANCE SINGAPORE LTD.', 'ZURICH']
const LIST: InsurerCompany[] = NAMES.map((n, i) => ({ id: `c${i}`, name: n, domain: null }))
const m = (s: string) => matchInsurer(s, LIST)?.name ?? null

describe('matchInsurer', () => {
  it('finds the company for each name a rate table carries', () => {
    expect(m('AIA Singapore')).toBe('AIA')
    expect(m('Income Insurance Limited')).toBe('INCOME')
    expect(m('QBE Insurance (Singapore) Pte Ltd')).toBe('QBE')
  })

  it('finds every one of the 23 names in the old Settings directory', () => {
    const old = ['AIA', 'Allianz', 'April', 'Chubb', 'Great Eastern', 'EQ', 'QBE', 'Income', 'ERGO',
      'ECICS', 'HLAS', 'Liberty', 'AIG', 'China Taping (CTPIS)', 'MSIG', 'Sompo', 'Cigna',
      'Berkley Asia', 'Zurich', 'Delta', 'Coface', 'Atradius', 'BHSI']
    for (const n of old) expect(m(n), n).not.toBeNull()
  })

  it('does not confuse insurers whose names are close', () => {
    expect(m('AIA')).toBe('AIA')
    expect(m('AIG')).toBe('AIG')
    expect(m('Mapfre')).toBe('MAPFRE')
    expect(m('Mapfre Re')).toBe('MAPFRE RE')
    expect(m('Great American')).toBe('GREAT AMERICAN INSURANCE COMPANY')
    expect(m('Great Eastern Life')).toBe('GREAT EASTERN')
  })

  it('returns nothing, rather than a guess, for an insurer not on file', () => {
    expect(m('Prudential')).toBeNull()
    expect(m('')).toBeNull()
    expect(m('E')).toBeNull()
  })
})

describe('normInsurer / displayName', () => {
  it('drops the corporate suffixes that do not identify an insurer', () => {
    expect(normInsurer('QBE Insurance (Singapore) Pte Ltd')).toBe('qbe')
    expect(normInsurer('Income Insurance Limited')).toBe('income')
  })
  it('stops a picker shouting, without mangling acronyms', () => {
    expect(displayName('GREAT EASTERN')).toBe('Great Eastern')
    expect(displayName('AIA')).toBe('AIA')
    expect(displayName('CHINA TAPING (CTPIS)')).toBe('China Taping (CTPIS)')
    expect(displayName('Berkley Asia')).toBe('Berkley Asia')
  })
})
