import { describe, expect, it } from 'vitest'
import { movementSheet, movementSubject, sheetFormatFor } from '@/lib/policies/movement-sheet'

const ms = [
  { kind: 'join' as const, member_name: 'Alan Tan', relationship: 'employee', dob: '1990-03-12', gender: 'Male', category: 'Staff', plan_code: 'Plan 2', effective_on: '2026-11-01', employment_date: '2026-08-01' },
  { kind: 'leave' as const, member_name: 'Bea Lim', relationship: 'employee', dob: '1985-07-05', gender: 'F', category: 'Staff', plan_code: 'Plan 2', effective_on: '2026-11-15' },
]

describe('movement sheets', () => {
  it('picks the insurer format', () => {
    expect(sheetFormatFor('QBE Insurance (Singapore) Pte Ltd', 'N0018606')).toBe('qbe_emf')
    expect(sheetFormatFor('Great Eastern General Insurance', '2026-A5892331-HFW')).toBe('ge_fwmi')
    expect(sheetFormatFor('Income Insurance Limited')).toBe('income_bix')
    expect(sheetFormatFor('Singapore Life Ltd.')).toBe('general')
  })
  it('QBE EMF: action codes, dates day first, last day of service the day before deletion', () => {
    const s = movementSheet('qbe_emf', ms, 'N0018606', 'JK Wildlife Pte Ltd')
    expect(s.name).toBe('MBRIPF')
    expect(s.rows[0].slice(0, 6)).toEqual(['A', 'N0018606', 'JK Wildlife Pte Ltd', 'Alan Tan', 'M', 'M'])
    expect(s.rows[0][12]).toBe('01/11/2026')
    expect(s.rows[1][0]).toBe('D')
    expect(s.rows[1][14]).toBe('14/11/2026')
  })
  it('GE FWMI: Addition / Deletion with the last day of employment', () => {
    const s = movementSheet('ge_fwmi', ms, '2026-A5892331-HFW', 'JK Wildlife Pte Ltd')
    expect(s.rows.map(r => r[0])).toEqual(['Addition', 'Deletion'])
    expect(s.rows[1][8]).toBe('14/11/2026')
  })
  it('Income BIX record types', () => {
    expect(movementSheet('income_bix', ms, 'GHS123', 'Acme').rows.map(r => r[0])).toEqual(['A - Addition', 'D - Deletion'])
  })
  it('TRS subject line', () => {
    expect(movementSubject('QBE', 'JK Wildlife Pte Ltd', 'N0018606', { joins: 1, leaves: 1, changes: 0 }))
      .toBe('TRS (QBE) : JK Wildlife Pte Ltd Policy No: N0018606 - Member movement (1 addition, 1 deletion)')
  })
})
