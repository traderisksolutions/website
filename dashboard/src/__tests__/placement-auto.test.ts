import { describe, it, expect } from 'vitest'
import { shouldAutoPlace, pickDefaultContacts, AUTO_PLACE_CONFIDENCE } from '@/lib/placement/auto'
import type { InsurerRoute } from '@/lib/placement/store'

const ok = { category: 'rfq', confidence: 0.9, companyKind: 'client', hasOpenPlacement: false }

describe('shouldAutoPlace', () => {
  it('fires for a confident rfq from a client with no open placement', () => {
    expect(shouldAutoPlace(ok)).toBe(true)
    expect(shouldAutoPlace({ ...ok, confidence: AUTO_PLACE_CONFIDENCE })).toBe(true)
  })

  it('needs category rfq — group benefits has its own agent, the rest is not a request', () => {
    for (const category of ['group_benefits', 'claim', 'renewal', 'general', 'other', null, undefined]) {
      expect(shouldAutoPlace({ ...ok, category })).toBe(false)
    }
  })

  it('needs confidence at or above the threshold, as a real number', () => {
    expect(shouldAutoPlace({ ...ok, confidence: 0.69 })).toBe(false)
    expect(shouldAutoPlace({ ...ok, confidence: null })).toBe(false)
    expect(shouldAutoPlace({ ...ok, confidence: undefined })).toBe(false)
    expect(shouldAutoPlace({ ...ok, confidence: Number.NaN })).toBe(false)
  })

  it('needs a client or insurer company on the thread', () => {
    expect(shouldAutoPlace({ ...ok, companyKind: 'insurer' })).toBe(true)
    expect(shouldAutoPlace({ ...ok, companyKind: 'prospect' })).toBe(false)
    expect(shouldAutoPlace({ ...ok, companyKind: null })).toBe(false)
    expect(shouldAutoPlace({ ...ok, companyKind: undefined })).toBe(false)
  })

  it('does not place the same thread twice', () => {
    expect(shouldAutoPlace({ ...ok, hasOpenPlacement: true })).toBe(false)
  })
})

const route = (o: Partial<InsurerRoute> & { contact_id: string }): InsurerRoute => ({
  insurer_name: 'Allianz', insurer_company_id: null, email: `${o.contact_id}@example.sg`, name: null, product_line: 'public_liability', ...o,
})

describe('pickDefaultContacts', () => {
  it('returns nothing for no routes', () => {
    expect(pickDefaultContacts([])).toEqual([])
  })

  it('picks one contact per insurer, insurers in name order', () => {
    const routes = [
      route({ contact_id: 'c1', insurer_name: 'Chubb', name: 'Zoe Tan' }),
      route({ contact_id: 'c2', insurer_name: 'Allianz', name: 'Ben Zhong' }),
      route({ contact_id: 'c3', insurer_name: 'Chubb', name: 'Amy Lim' }),
      route({ contact_id: 'c4', insurer_name: 'Allianz', name: 'Carl Ng' }),
    ]
    expect(pickDefaultContacts(routes)).toEqual(['c2', 'c3'])
  })

  it('prefers the first by name; a named contact beats an unnamed one; email breaks the tie', () => {
    expect(pickDefaultContacts([
      route({ contact_id: 'c1', name: null, email: 'a@allianz.sg' }),
      route({ contact_id: 'c2', name: 'Mei Lin', email: 'z@allianz.sg' }),
    ])).toEqual(['c2'])
    expect(pickDefaultContacts([
      route({ contact_id: 'c1', name: null, email: 'z@allianz.sg' }),
      route({ contact_id: 'c2', name: null, email: 'a@allianz.sg' }),
    ])).toEqual(['c2'])
    expect(pickDefaultContacts([
      route({ contact_id: 'c1', name: 'Ben' }),
      route({ contact_id: 'c2', name: 'ben' }),
    ])).toEqual(['c1'])
  })

  it('treats the same insurer in different case as one insurer', () => {
    expect(pickDefaultContacts([
      route({ contact_id: 'c1', insurer_name: 'AIG', name: 'Bob' }),
      route({ contact_id: 'c2', insurer_name: 'aig', name: 'Al' }),
    ])).toEqual(['c2'])
  })

  it('keeps only the product line asked for when one is given', () => {
    const routes = [
      route({ contact_id: 'c1', product_line: 'public_liability', name: 'Al' }),
      route({ contact_id: 'c2', product_line: 'professional_indemnity', name: 'Al' }),
      route({ contact_id: 'c3', insurer_name: 'Chubb', product_line: 'professional_indemnity', name: 'Al' }),
    ]
    expect(pickDefaultContacts(routes, 'professional_indemnity')).toEqual(['c2', 'c3'])
    expect(pickDefaultContacts(routes, 'directors_officers')).toEqual([])
  })
})
