import { describe, it, expect } from 'vitest'
import { buildIdentityIndex, matchName, aliasKey, type AliasRow } from '@/lib/crm/identity'
import type { Company } from '@/lib/crm/types'

const co = (id: string, name: string): Company => ({
  id, name, kind: 'client', stage: 'client', stage_changed_at: null, owner_email: null, domains: [],
  domain: null, type: null, industry: null, address: null, notes: null, source: null,
  ai_brief: null, ai_brief_at: null, ai_brief_model: null, created_at: '', updated_at: '',
})
const alias = (companyId: string, text: string): AliasRow => ({ id: `a-${text}`, company_id: companyId, alias: text, alias_norm: aliasKey(text), source: 'ai' })

// The real spellings that appeared in TRS subject lines.
const COMPANIES = [
  co('mm', 'Mister Mobile Trading Pte Ltd'),
  co('hw', 'Healthway Medical Corporation Limited'),
  co('fg', 'Fong Group 2023 Pte Ltd'),
  co('fs', 'Fong Seng Fast Food Pte Ltd'),
  co('cw', 'China International Water & Electric Corporation (Singapore) Pte Ltd'),
  co('cj', 'China Jingye Engineering Corporation Limited Singapore Branch'),
  co('qp', 'QuantuPeak Management Pte Ltd'),
]
const index = buildIdentityIndex(COMPANIES, [alias('mm', 'Mister Mobile Yishun')])

describe('matchName — one company, many spellings', () => {
  it('matches the exact name', () => {
    expect(matchName('Mister Mobile Trading Pte Ltd', index)).toMatchObject({ companyId: 'mm', strength: 'exact' })
  })

  it('matches a spelling confirmed earlier, through the alias list', () => {
    expect(matchName('Mister Mobile Yishun', index)).toMatchObject({ companyId: 'mm', strength: 'alias' })
  })

  it('matches a shorter name contained in the full one', () => {
    const m = matchName('Mister Mobile', index)
    expect(m?.companyId).toBe('mm')
    expect(m!.score).toBeGreaterThanOrEqual(0.8)
  })

  it('treats Healthway Medical Group as the Healthway company', () => {
    const m = matchName('Healthway Medical Group', index)
    expect(m?.companyId).toBe('hw')
    expect(m!.score).toBeGreaterThanOrEqual(0.8)
  })

  it('ignores case, punctuation and legal suffixes', () => {
    expect(matchName('QUANTUPEAK MANAGEMENT (S) PTE. LTD.', index)?.companyId).toBe('qp')
    expect(matchName('Quantupeak Management', index)?.companyId).toBe('qp')
  })
})

describe('matchName — companies that must stay apart', () => {
  it('keeps the two Fong companies separate', () => {
    expect(matchName('Fong Seng Fast Food Pte Ltd', index)?.companyId).toBe('fs')
    expect(matchName('Fong Group 2023 Pte Ltd', index)?.companyId).toBe('fg')
  })

  it('keeps the two China companies separate despite shared words', () => {
    const m = matchName('China Jingye Engineering Corporation Limited Singapore Branch', index)
    expect(m?.companyId).toBe('cj')
    const weak = matchName('China Construction Holdings Pte Ltd', index)
    expect(weak === null || weak.score < 0.8).toBe(true)
  })

  it('does not match on a common word alone', () => {
    const m = matchName('Medical Group Pte Ltd', index)
    expect(m === null || m.score < 0.8).toBe(true)
    expect(matchName('Singapore Holdings Pte Ltd', index)).toBeNull()
  })

  it('ignores names too short to identify anyone', () => {
    expect(matchName('AB', index)).toBeNull()
    expect(matchName('', index)).toBeNull()
  })
})

describe('aliasKey', () => {
  it('reduces a name to its distinctive core', () => {
    expect(aliasKey('Mister Mobile Trading Pte. Ltd.')).toBe('mister mobile trading')
    expect(aliasKey('QuantuPeak Management (S) Pte Ltd')).toBe('quantupeak management s')
  })
})

describe('plural folding — the duplicate that nearly got created', () => {
  it('treats Keller Foundation and Keller Foundations as one company', () => {
    const idx = buildIdentityIndex([co('kf', 'Keller Foundations (S E Asia) Pte Ltd')], [])
    const m = matchName('Keller Foundation', idx)
    expect(m?.companyId).toBe('kf')
    expect(m!.score).toBeGreaterThanOrEqual(0.8)
  })
  it('still keeps genuinely different names apart', () => {
    const idx = buildIdentityIndex([co('a', 'Samwoh Corporation Pte Ltd'), co('b', 'Sanwa Engineering Pte Ltd')], [])
    expect(matchName('Sanwa Engineering Pte Ltd', idx)?.companyId).toBe('b')
    const m = matchName('Samwoh Corporation Pte Ltd', idx)
    expect(m?.companyId).toBe('a')
  })
})
