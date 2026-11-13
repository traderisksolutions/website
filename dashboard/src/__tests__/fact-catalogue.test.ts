import { describe, it, expect } from 'vitest'
import { cleanFacts, entryOf, cleanValue, catalogueFor, CATALOGUE } from '@/lib/admin/k/catalogue'

describe('fact catalogue', () => {
  it('finds the entry and slot of a concrete key', () => {
    expect(entryOf('business.name')?.entry.key).toBe('business.name')
    expect(entryOf('contact.jane@acme.example.role')).toMatchObject({ entry: { key: 'contact.{person}.role' }, slot: 'jane@acme.example' })
    expect(entryOf('terms.WC0001234.premium')).toMatchObject({ entry: { key: 'terms.{ref}.premium' }, slot: 'WC0001234' })
    expect(entryOf('company.name')).toBeNull()
    expect(entryOf('business.name.extra')).toBeNull()
  })
  it('types values: figures for money, a role from the list', () => {
    expect(cleanValue('money', 'S$12,400')).toBe('S$12,400')
    expect(cleanValue('money', 'to be advised')).toBeNull()
    expect(cleanValue('role', 'Decision maker')).toBe('decision_maker')
    expect(cleanValue('role', 'boss')).toBeNull()
    expect(cleanValue('phone', '+65 6123 4567')).toBe('+65 6123 4567')
  })
  it('a client email: keys from the catalogue, people by their address on the email, quotes word for word', () => {
    const text = 'Hi, our HR manager Jane Tan (jane@acme.example) now handles all claims. We have 42 staff across 3 sites.'
    const out = cleanFacts({ facts: [
      { key: 'contact.jane@acme.example.name', value: 'Jane Tan', quote: 'our HR manager Jane Tan (jane@acme.example)' },
      { key: 'contact.jane@acme.example.role', value: 'claims', quote: 'now handles all claims' },
      { key: 'members.headcount', value: '42', quote: 'We have 42 staff' },
      { key: 'contact.bob@acme.example.name', value: 'Bob', quote: 'our HR manager' },           // not on the email
      { key: 'company.name', value: 'Acme', quote: 'our HR manager' },                          // not a catalogue key
      { key: 'members.headcount', value: '50', quote: 'We have 50 staff' },                     // not in the email
      { key: 'terms.ghs.premium', value: 'S$1,000', quote: 'our HR manager' },                  // an insurer key
    ] }, text, 'client', ['jane@acme.example'])
    expect(out.map(f => f.key)).toEqual(['contact.jane@acme.example.name', 'contact.jane@acme.example.role', 'members.headcount'])
    expect(out[1]).toMatchObject({ topic: 'contact', value: 'claims' })
  })
  it('an insurer email: a ref must be written in the email or be a line of cover', () => {
    const text = 'Renewal terms for policy WC-0001234: premium S$12,400 before GST, excess S$500. GHS renews at +8%.'
    const out = cleanFacts({ facts: [
      { key: 'terms.WC-0001234.premium', value: 'S$12,400', quote: 'premium S$12,400 before GST' },
      { key: 'terms.WC0001234.excess', value: 'S$500', quote: 'excess S$500' },
      { key: 'terms.group_health.renewal_change', value: '+8%', quote: 'GHS renews at +8%' },
      { key: 'terms.ZZ9999999.premium', value: 'S$1', quote: 'premium S$12,400' },              // number not in the email
      { key: 'business.name', value: 'Acme', quote: 'Renewal terms' },                          // a client key
    ] }, text, 'insurer', [])
    expect(out.map(f => f.key)).toEqual(['terms.WC0001234.premium', 'terms.WC0001234.excess', 'terms.group_health.renewal_change'])
  })
  it('survives a malformed answer; the prompt lists only the reader\'s keys', () => {
    expect(cleanFacts(null, 'x', 'client', [])).toEqual([])
    expect(cleanFacts({ facts: 'no' }, 'x', 'insurer', [])).toEqual([])
    expect(catalogueFor('insurer')).toContain('terms.{ref}.premium')
    expect(catalogueFor('insurer')).not.toContain('business.name')
    expect(new Set(CATALOGUE.map(e => e.key)).size).toBe(CATALOGUE.length)
  })
})
