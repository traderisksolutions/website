/**
 * The pure parts of the company spine: which product lines carry members, and which bound
 * policy a debit note attaches to instead of creating a second row.
 */
import { describe, it, expect } from 'vitest'
import { isEbLine, pickBoundPolicy, type BoundPolicyLike } from '@/lib/policies/spine'

describe('isEbLine', () => {
  it('is true for the two employment-benefits lines only', () => {
    expect(isEbLine('employee_benefits')).toBe(true)
    expect(isEbLine('group_health')).toBe(true)
    expect(isEbLine('group_travel')).toBe(false)
    expect(isEbLine('wica')).toBe(false)
    expect(isEbLine('professional_indemnity')).toBe(false)
    expect(isEbLine('')).toBe(false)
  })
})

const eb: BoundPolicyLike  = { id: 'eb',  label: 'Employee Benefits Insurance',   class_of_insurance: null, product_line: 'employee_benefits' }
const pi: BoundPolicyLike  = { id: 'pi',  label: 'Professional Indemnity (PI)',   class_of_insurance: null, product_line: 'professional_indemnity' }
const ghs: BoundPolicyLike = { id: 'ghs', label: 'Group Hospital & Surgical',     class_of_insurance: 'Group Hospital and Surgical', product_line: 'group_health' }

describe('pickBoundPolicy', () => {
  it('returns null when the company has no bound policy', () => {
    expect(pickBoundPolicy([], 'Professional Indemnity')).toBeNull()
    expect(pickBoundPolicy([], null)).toBeNull()
  })

  it('matches the note class against the label', () => {
    expect(pickBoundPolicy([eb, pi], 'Professional Indemnity')).toBe('pi')
    expect(pickBoundPolicy([eb, pi], 'Employee Benefits')).toBe('eb')
  })

  it('matches the note class against class_of_insurance', () => {
    expect(pickBoundPolicy([pi, ghs], 'Group Hospital & Surgical')).toBe('ghs')
  })

  it('matches the note class against the product line label when the label is custom', () => {
    const custom: BoundPolicyLike = { id: 'c', label: 'Office cover 2027', class_of_insurance: null, product_line: 'professional_indemnity' }
    expect(pickBoundPolicy([eb, custom], 'Professional Indemnity Insurance')).toBe('c')
  })

  it('takes the only bound policy when nothing matches by class', () => {
    expect(pickBoundPolicy([pi], 'Directors and Officers')).toBe('pi')
    expect(pickBoundPolicy([pi], null)).toBe('pi')
  })

  it('refuses to guess between several bound policies when nothing matches', () => {
    expect(pickBoundPolicy([eb, pi], 'Directors and Officers')).toBeNull()
    expect(pickBoundPolicy([eb, pi], null)).toBeNull()
  })

  it('takes the first match in the order given (newest bind first)', () => {
    const older: BoundPolicyLike = { id: 'old', label: 'Professional Indemnity (PI)', class_of_insurance: null, product_line: 'professional_indemnity' }
    expect(pickBoundPolicy([pi, older], 'Professional Indemnity')).toBe('pi')
    expect(pickBoundPolicy([older, pi], 'Professional Indemnity')).toBe('old')
  })
})
