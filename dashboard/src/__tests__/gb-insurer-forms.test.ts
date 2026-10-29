import { describe, expect, it } from 'vitest'
import { incomeUploadRows, rccEnrolmentRows } from '@/lib/gb/insurer-forms'

const members = [
  { name: 'Ann', relationship: 'self', dob: '1980-02-01', occupation_class: '1' },
  { name: 'Ben', relationship: 'spouse', dob: '1982-03-04' },
]
const lines = [
  { member_index: 0, product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 2', premium: 400 },
  { member_index: 0, product_code: 'Group Personal Accident (GPA)', plan_code: 'Plan 2', premium: 130 },
  { member_index: 1, product_code: 'Group Hospital and Surgical (GHS)', plan_code: 'Plan 2', premium: 400 },
  { member_index: 1, product_code: 'Group Personal Accident (GPA)', plan_code: 'Plan 2', premium: 130 },
  { member_index: 0, product_code: 'Hospital & Surgical', plan_code: 'Plan 2A (PTE 1-bed)', premium: 900 },
  { member_index: 0, product_code: 'Major Medical', plan_code: 'Plan 2A/2B', premium: 30 },
]

describe('Income upload rows', () => {
  const rows = incomeUploadRows(members, lines)
  it('dates day first, relationship words, class for employees only', () => {
    expect(rows[0].slice(0, 12)).toEqual(['A - Addition', null, null, null, 'Ann', null, null, null, 'Employee', null, null, '01/02/1980'])
    expect(rows[0][18]).toBe('Class 1'); expect(rows[1][18]).toBeNull()
  })
  it('plans as Plan n; dependants never hold accident cover', () => {
    expect(rows[0][21]).toBe('Plan 2')               // GHS
    expect(rows[0][35]).toBe('Plan 2')               // GPA, employee
    expect(rows[1][35]).toBe('Not Covered')          // GPA, spouse
  })
})

describe('RCC enrolment rows', () => {
  it('RCC plan words; spouse under the employee', () => {
    const rows = rccEnrolmentRows(members, lines, '2026-10-24', 'Acme Pte Ltd')
    expect(rows[0].slice(0, 3)).toEqual([1, 'Plan 2a', 'Plan 2a'])
    expect(rows[1][rows[1].length - 9]).toBe('Ann')
  })
})
