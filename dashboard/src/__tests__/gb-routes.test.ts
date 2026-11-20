import { describe, expect, it } from 'vitest'
import { routeFor, routesFor } from '@/lib/gb/routes'
import type { Member } from '@/lib/gb-quote'

const emp = (n: number, dob = '1985-01-01'): Member[] => Array.from({ length: n }, (_, i) => ({ name: `E${i}`, relationship: 'self', dob, category: 'Staff' }))

describe('a route per insurer', () => {
  it('a small, young group is brochure priced at every house insurer', () => {
    const r = routesFor(['Steadfast MCare+', 'RCC Enhanced III', 'Income FlexCare', 'Singlife MyBenefits Plus', 'AIA Flexi Vital Care Plus'], emp(10), '2027-01-01')
    expect(r.map(x => x.route)).toEqual(['brochure', 'brochure', 'brochure', 'brochure', 'brochure'])
  })

  it('package limits send an insurer to quote, with the reason', () => {
    const r = routeFor('Steadfast MCare+', emp(62), '2027-01-01')
    expect(r.route).toBe('quote')
    expect(r.reasons).toEqual(['62 employees, above the package limit of 50'])
    expect(routeFor('Income FlexCare', emp(62), '2027-01-01').route).toBe('brochure')
    expect(routeFor('Income FlexCare', emp(1), '2027-01-01').reasons).toEqual(['1 employee, below the package minimum of 2'])
    expect(routeFor('AIA Flexi Vital Care Plus', emp(51), '2027-01-01').reasons).toContain('51 lives, above the package limit of 50')
  })

  it('an age past the insurer\'s limit on any cover needs a quote; one past the life-cover age is a note', () => {
    const census = [...emp(5), { name: 'Old', relationship: 'self', dob: '1955-01-01', category: 'Staff' }]
    expect(routeFor('Steadfast MCare+', census, '2027-01-01').reasons).toEqual(['1 life aged 70 or over needs underwriting'])
    const income = routeFor('Income FlexCare', census, '2027-01-01')
    expect(income.route).toBe('brochure')
    expect(income.notes[0]).toMatch(/1 employee aged 65 or over needs a health declaration/)
  })

  it('a rate-card warning and an unknown product are reasons', () => {
    expect(routeFor('Singlife MyBenefits Plus', emp(5), '2026-11-01', ['Rates from 1 Dec 2026']).reasons).toEqual(['Rates from 1 Dec 2026'])
    expect(routeFor('Great Eastern', emp(5), '2027-01-01').reasons).toEqual(['No card in the house workbook'])
  })
})
