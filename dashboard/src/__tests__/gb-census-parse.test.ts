/**
 * Reading a census by rule. The fixtures are the shapes real clients sent in 2026: QuantuPeak's
 * template (company line above the header, "5-Jul-87"), a bare name + DOB sheet, and quoted CSV.
 */
import { describe, it, expect } from 'vitest'
import { parseDelimited, censusFromRows } from '@/lib/gb/census-parse'

const today = { y: 2026, m: 10, d: 2 }

describe('parseDelimited', () => {
  it('honours quotes and doubled quotes', () => {
    expect(parseDelimited('name,dob\n"Tan, Wei Ming",05/07/1987\n"O""Neil",1990-01-02\n'))
      .toEqual([['name', 'dob'], ['Tan, Wei Ming', '05/07/1987'], ['O"Neil', '1990-01-02']])
  })
  it('reads tab-separated text pasted from Excel', () => {
    expect(parseDelimited('Name\tDate of Birth\nA\t1/2/1980')).toEqual([['Name', 'Date of Birth'], ['A', '1/2/1980']])
  })
})

describe('censusFromRows', () => {
  it('reads name and date of birth alone, day first', () => {
    const r = censusFromRows(parseDelimited('Employee Name,Date of Birth\nTan Wei Ming,05/07/1987\nLim Mei,1990-12-01\n'), today)
    expect(r.members).toEqual([
      { name: 'Tan Wei Ming', relationship: 'self', category: 'Default', dob: '1987-07-05', age: null, occupation_class: null },
      { name: 'Lim Mei', relationship: 'self', category: 'Default', dob: '1990-12-01', age: null, occupation_class: null },
    ])
    expect(r.found).toEqual({ name: 'Employee Name', dob: 'Date of Birth' })
  })

  it('reads the QuantuPeak template: header below a company line, two-digit years, a work-pass column', () => {
    const csv = [
      'Name of Company : ,QuantuPeak Management Pte Ltd,,,Period of Insurance :  ,,',
      ',,,,,,',
      'Sno. ,Employee Name  ,Staff/dependant ,Date of birth ,Gender  ,Local or Foreign workers (WP/SP) ,Category of staff ',
      '1,Yeo Hui Yi,Staff,5-Jul-87,Female,Local,',
      '2,Wang Xin (Vincent),Staff,20-Dec-86,Male,WP,',
      '3,,,,,,',
    ].join('\n')
    const r = censusFromRows(parseDelimited(csv), today)
    expect(r.members.map(m => [m.name, m.relationship, m.dob, m.category])).toEqual([
      ['Yeo Hui Yi', 'self', '1987-07-05', 'Default'],
      ['Wang Xin (Vincent)', 'self', '1986-12-20', 'Default · WP'],
    ])
  })

  it('keeps the staff grade beside a work pass, and dependants take the grade', () => {
    const csv = 'Employee Name,Staff/dependant,Date of birth,Local or Foreign workers (WP/SP),Category of staff\nA,Staff,5-Jul-87,Local,Manager\nB,Dependant,2-Mar-85,Local,\nC,Staff,30-Apr-90,WP,Staff\nD,Staff,9-Jan-83,WP,\n'
    const r = censusFromRows(parseDelimited(csv), today)
    expect(r.members.map(m => [m.name, m.relationship, m.category])).toEqual([
      ['A', 'self', 'Manager'], ['B', 'spouse', 'Manager'], ['C', 'self', 'Staff · WP'], ['D', 'self', 'Staff · WP'],
    ])
  })

  it('lets dependants take the employee category, and reads "dependant" by age', () => {
    const csv = 'Name,DOB,Relationship,Grade\nA,01/01/1980,Employee,Manager\nB,01/01/1982,Dependant,\nC,01/01/2015,Dependant,\n'
    const r = censusFromRows(parseDelimited(csv), today)
    expect(r.members.map(m => [m.name, m.relationship, m.category])).toEqual([
      ['A', 'self', 'Manager'], ['B', 'spouse', 'Manager'], ['C', 'child', 'Manager'],
    ])
  })

  it('lists dates it cannot read and keeps a stated age', () => {
    const r = censusFromRows(parseDelimited('Name,Date of birth,Age\nX,31/02/1980,44\nY,,30\n'), today)
    expect(r.unread).toEqual(['Row 2, X: "31/02/1980"'])
    expect(r.members.map(m => [m.name, m.dob, m.age])).toEqual([['X', null, 44], ['Y', null, 30]])
  })

  it('reads an Excel serial date and skips total rows', () => {
    const r = censusFromRows(parseDelimited('Name,DOB\nZ,31963\nTotal,\n'), today)
    expect(r.members).toHaveLength(1)
    expect(r.members[0].dob).toBe('1987-07-05')
  })

  it('says why when there is no usable header', () => {
    expect(censusFromRows(parseDelimited('foo,bar\n1,2\n'), today).error).toMatch(/No header row/)
  })
})
