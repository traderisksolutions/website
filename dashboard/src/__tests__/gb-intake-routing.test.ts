import { describe, expect, it } from 'vitest'
import { normaliseRead, normCompany } from '@/lib/gb/intake'
import { coversToRequirement } from '@/lib/gb/ladder'

const people = [
  { name: 'A', relationship: 'self', dob: '01/02/1980' }, { name: 'B', relationship: 'spouse', dob: '01/02/1982' },
  { name: 'C', relationship: 'self', dob: '05/06/1990' },
]

describe('intake: budget, country, renewal', () => {
  it('a per-employee monthly budget becomes an annual total from the employee count', () => {
    const r = normaliseRead({ is_group_benefits_request: true, members: people, budget: { amount: 250, per: 'employee_month', as_written: 'about $250 per staff per month' } })
    expect(r.budget).toBe(250 * 12 * 2)
    expect(r.budgetText).toBe('about $250 per staff per month')
  })
  it('no budget stated stays null', () => {
    expect(normaliseRead({ is_group_benefits_request: true }).budget).toBeNull()
  })
  it('country and renewal date are read; dates day first', () => {
    const r = normaliseRead({ is_group_benefits_request: true, company_country: 'my', renewal_date: '01/03/2027' })
    expect(r.country).toBe('MY')
    expect(r.renewalDate).toBe('2027-03-01')
  })
})

describe('one company, one request', () => {
  it.each([
    ['Talent Trader Group Pte Ltd', 'TALENT TRADERS GROUP PTE. LTD'],
    ['GETSOLAR SDN BHD', 'GetSolar Sdn Bhd'],
    ['BCEI SG PTE LTD', 'BCEI SG Pte Ltd'],
  ])('%s = %s', (a, b) => expect(normCompany(a)).toBe(normCompany(b)))
  it('different companies stay apart', () => expect(normCompany('Gembridge Capital')).not.toBe(normCompany('Iconic Locations')))
})

describe('covers asked for → requirement', () => {
  it('government 1-bed, GP with co-pay, S$200k life', () => {
    const r = coversToRequirement([{ code: 'GHS', hospital: 'government', ward: 1 }, { code: 'GOPC', coPay: true }, { code: 'GTL', sumAssured: 200_000 }])
    expect(r).toMatchObject({ ward: 'G1', gp: 'copay', gtl: 200_000, sp: null, pa: null })
  })
  it('no hospital named: no hospital cover', () => {
    expect(coversToRequirement([{ code: 'GD', tier: 'top' }])).toMatchObject({ ward: null, dental: 'top' })
  })
})

import { requirementText, DEFAULT_REQUIREMENT } from '@/lib/gb/ladder'
describe('requirement grid for insurer emails', () => {
  it('covers down, categories across', () => {
    const t = requirementText([
      { name: 'Staff', requirement: { ...DEFAULT_REQUIREMENT, ward: 'G1', sp: null, gp: 'copay' } },
      { name: 'Management', requirement: { ...DEFAULT_REQUIREMENT, ward: 'P1', wardLevel: 'top', pa: 250_000 } },
    ])
    const lines = t.split('\n')
    expect(lines[2]).toMatch(/^Cover\s+Staff\s+Management$/)
    expect(t).toMatch(/Hospital & surgical\s+Government 1-bed, standard limits\s+Private 1-bed, higher limits/)
    expect(t).toMatch(/Personal accident\s+Not required\s+S\$250k, employees only/)
  })
})
