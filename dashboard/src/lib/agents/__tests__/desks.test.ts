import { describe, it, expect } from 'vitest'
import { deskFor, fitsLine, linesNamed } from '../desks'

describe('desks', () => {
  it('maps lines to desks, unknown to general', () => {
    expect(deskFor('foreign_worker_medical')).toBe('eb')
    expect(deskFor('professional_indemnity')).toBe('financial')
    expect(deskFor('marine_cargo')).toBe('general')
    expect(deskFor(null)).toBe('general')
  })
  it('reads the lines an email names', () => {
    expect(linesNamed('Please provide a name list of FWMI & Employee Benefits')).toEqual(['foreign_worker_medical', 'employee_benefits'])
    expect(linesNamed('Addition of 2 staff to QBE GHS')).toEqual(['employee_benefits'])
    expect(linesNamed('Kindly add PBE Axell to the WIC policy')).toEqual(['wica'])
    expect(linesNamed('Hi Nathan, please see attached')).toEqual([])
    expect(linesNamed('ECICS endorsement confirmation - Machinery All Risks & Public Liability')).toEqual(['general_liability', 'machinery_breakdown'])
    expect(linesNamed('Project RC203 Advance Payment Bond Discharge')).toEqual(['surety_bonds'])
    expect(linesNamed('Coface policy 726923 - exposure reduction')).toEqual(['trade_credit'])
  })
  it('a list marked for one member line fits only that policy; an unmarked one fits all', () => {
    expect(fitsLine('FWMI additions / Tan Ah Kow - 1 Dec', 'foreign_worker_medical')).toBe(true)
    expect(fitsLine('FWMI additions / Tan Ah Kow - 1 Dec', 'employee_benefits')).toBe(false)
    expect(fitsLine('Tan Ah Kow - 1 Dec', 'employee_benefits')).toBe(true)
    // A word from another desk does not exclude: "WIC" on a GHS list is not a GHS mark.
    expect(fitsLine('new staff (also add to WIC) Tan Ah Kow', 'employee_benefits')).toBe(true)
  })
})
