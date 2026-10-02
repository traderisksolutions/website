/**
 * The group benefits agent's deterministic edges: what it accepts from the model's read, and
 * which insurer label it prices a cover under. The model call itself is not tested here.
 */
import { describe, it, expect } from 'vitest'
import { normaliseRead, titleFor, defaultEffectiveDate, DEFAULT_TARGET, isForeignWorkerCategory } from '@/lib/gb/intake'

describe('normaliseRead', () => {
  it('reads dates of birth day first, and lists the ones it cannot read rather than guessing', () => {
    const r = normaliseRead({
      is_group_benefits_request: true,
      members: [
        { name: 'A', relationship: 'self', dob: '12/09/1972' },
        { name: 'B', relationship: 'spouse', dob: '09-31-1980' },
        { name: 'C', relationship: 'employee', age: 41 },
        { name: '  ', relationship: 'self' },
      ],
    })
    expect(r.members.map(m => [m.name, m.relationship, m.dob, m.age])).toEqual([
      ['A', 'self', '1972-09-12', null],
      ['B', 'spouse', null, null],
      ['C', 'self', null, 41],
    ])
    expect(r.unreadDates).toEqual(['B: "09-31-1980"'])
    expect(r.members[0].category).toBe('Default')
  })

  it('keeps only canonical covers, once each, and defaults to GHS when none is named', () => {
    expect(normaliseRead({ products: [{ code: 'GTL', requirement: ' S$100k ' }, { code: 'GTL' }, { code: 'XYZ' }] }).products)
      .toEqual([{ code: 'GTL', requirement: 'S$100k' }])
    expect(normaliseRead({}).products).toEqual([{ code: 'GHS', requirement: null }])
  })

  it('reads a written start date and a renewal', () => {
    const r = normaliseRead({ is_group_benefits_request: true, effective_date: '1 November 2026', basis: 'renewal' })
    expect(r.effectiveDate).toBe('2026-11-01')
    expect(r.basis).toBe('renewal')
    expect(r.isRequest).toBe(true)
  })
})

describe('titleFor', () => {
  it('prefers the label for exactly that cover over a bundle', () => {
    expect(titleFor('GTL', ['GTL + GACI', 'GTL', 'GADD'])).toBe('GTL')
  })
  it('uses a bundle when it is the only label pricing the cover', () => {
    expect(titleFor('GHS', ['GHS+EMM', 'GTL', 'GP COPAY S$0 + SP'])).toBe('GHS+EMM')
    expect(titleFor('GOSC', ['GHS+EMM', 'GP COPAY S$0 + SP'])).toBe('GP COPAY S$0 + SP')
  })
  it('takes the bundle that covers more of the request, and never prices a cover twice', () => {
    const aia = ['GP', 'GP COPAY S$0 + SP', 'GTL', 'GTL + GACI', 'GHS+EMM']
    expect(titleFor('GOPC', aia, ['GOPC', 'GOSC'])).toBe('GP COPAY S$0 + SP')
    expect(titleFor('GOSC', aia, ['GOPC', 'GOSC'], new Set(['GOPC', 'GOSC']))).toBeNull()
    expect(titleFor('GTL', aia, ['GTL', 'GCI'])).toBe('GTL + GACI')
    expect(titleFor('GTL', aia, ['GTL'])).toBe('GTL')
    expect(titleFor('GOPC', aia, ['GOPC'])).toBe('GP')
  })
  it('returns null when the insurer does not price the cover', () => {
    expect(titleFor('GD', ['Hospital & Surgical', 'Term Life'])).toBeNull()
  })
})

describe('defaults', () => {
  it('starts a draft on the first of a month', () => {
    expect(defaultEffectiveDate()).toMatch(/^\d{4}-\d{2}-01$/)
  })
  it('has a stated default for every cover', () => {
    for (const c of ['GHS', 'EMM', 'GHS_FW', 'GTL', 'GCI', 'GPA', 'GADD', 'GOPC', 'GOSC', 'GD']) expect(DEFAULT_TARGET[c]).toBeTruthy()
  })
})

describe('isForeignWorkerCategory', () => {
  it('knows the ways a census marks foreign workers', () => {
    for (const c of ['Work permit', 'WP', 'S Pass', 'S-Pass holders', 'Foreign workers', 'FW']) expect(isForeignWorkerCategory(c)).toBe(true)
    for (const c of ['Local', 'Staff', 'Management', 'EP', 'Default']) expect(isForeignWorkerCategory(c)).toBe(false)
  })
})

