import { describe, it, expect } from 'vitest'
import { planFacts, seedFacts } from '../knowledge'
import { factsFromDocument } from '../policy-reader'
import type { FactInput } from '../handoffs'

const fact = (key: string, value: string, company_id = 'c1'): FactInput => ({ company_id, topic: 'cover', key, value, source_kind: 'policy' })

describe('planFacts — supersede, never overwrite', () => {
  it('skips a fact already current with the same value (spacing and case ignored)', () => {
    const p = planFacts([fact('policy.X.insurer', 'QBE  Insurance')], [{ id: 'f1', company_id: 'c1', key: 'policy.X.insurer', value: 'qbe insurance', source_id: null }])
    expect(p.insert).toEqual([])
  })
  it('inserts a changed value and marks the old row superseded', () => {
    const p = planFacts([fact('policy.X.period', '2026-11-01 to 2027-10-31')], [{ id: 'f1', company_id: 'c1', key: 'policy.X.period', value: '2025-11-01 to 2026-10-31', source_id: 'p0' }])
    expect(p.insert).toHaveLength(1)
    expect(p.supersede.get(0)).toEqual(['f1'])
  })
  it('keeps facts of other companies apart and drops duplicates within the batch', () => {
    const p = planFacts([fact('k', 'v', 'c1'), fact('k', 'v', 'c1'), fact('k', 'v', 'c2')], [{ id: 'f1', company_id: 'c2', key: 'k', value: 'other', source_id: null }])
    expect(p.insert.map(f => f.company_id)).toEqual(['c1', 'c2'])
    expect(p.supersede.get(0)).toEqual([])
    expect(p.supersede.get(1)).toEqual(['f1'])
  })
  it('several values one email states under one key all stand; a later email replaces them', () => {
    const one = (v: string, src: string): FactInput => ({ ...fact('terms.car.premium', v), source_kind: 'email', source_id: src })
    const current = [{ id: 'f1', company_id: 'c1', key: 'terms.car.premium', value: 'S$690', source_id: 'm1' }]
    expect(planFacts([one('S$1,362.60', 'm1')], current).supersede.get(0)).toEqual([])
    expect(planFacts([one('S$700', 'm2')], current).supersede.get(0)).toEqual(['f1'])
  })
})

describe('seedFacts', () => {
  it('states cover, insureds and acts-for contacts with their sources', () => {
    const facts = seedFacts(
      { id: 'c1', company_name: 'Acme Pte Ltd', uen: '201500001A', parent_id: 'g1', relation: 'subsidiary' },
      [{ id: 'p1', policy_number: 'WC-0001234', insurer: 'Example Insurance', class_of_insurance: 'WICA', start_date: '2025-11-01', end_date: '2026-10-31', lifecycle: 'live' }],
      [{ policy_id: 'p9', company_id: 'c1', role: 'named_insured' }],
      [{ contact_id: 'k1', scope: ['claims'], status: 'active', contacts: { email: 'Pat@Acme.example', first_name: 'Pat', last_name: 'Lim' } }],
    )
    const by = Object.fromEntries(facts.map(f => [f.key, f]))
    expect(by['business.uen'].value).toBe('201500001A')
    expect(by['business.parent'].value).toBe('g1')
    expect(by['policy.WC0001234.insurer'].value).toBe('Example Insurance')
    expect(by['policy.WC0001234.period'].value).toBe('2025-11-01 to 2026-10-31')
    expect(by['policy.WC0001234.insurer'].source_id).toBe('p1')
    expect(by['policy.p9.insured'].value).toBe('named_insured')
    expect(by['contact.pat@acme.example.acts_for'].value).toBe('claims')
    expect(by['contact.pat@acme.example.name'].value).toBe('Pat Lim')
  })
})


describe('factsFromDocument', () => {
  it('turns a classified cover document into cover facts quoting the file', () => {
    const facts = factsFromDocument({ id: 'd1', company_id: 'c1', policy_id: 'p1', doc_type: 'policy_schedule', title: 'WICA schedule', filename: 'Schedule WC-0001234.pdf', policy_number: 'WC-0001234', insurer_name: 'Example Insurance', class_of_insurance: 'WICA', period_from: '2026-11-01', period_to: '2027-10-31', premium_text: 'SGD 1,090.00', received_at: '2026-10-30T02:00:00Z', confidence: 0.9 })
    expect(facts.map(f => f.key)).toEqual(['policy.WC0001234.number', 'policy.WC0001234.insurer', 'policy.WC0001234.class', 'policy.WC0001234.period', 'policy.WC0001234.premium', 'policy.WC0001234.document.policy_schedule'])
    expect(facts[0].quote).toBe('WICA schedule — Schedule WC-0001234.pdf')
    expect(facts[0].confidence).toBe('high')
    expect(facts[0].source_date).toBe('2026-10-30')
  })
  it('states nothing for a document with no company or no policy', () => {
    expect(factsFromDocument({ id: 'd', company_id: null })).toEqual([])
    expect(factsFromDocument({ id: 'd', company_id: 'c1' })).toEqual([])
  })
})
