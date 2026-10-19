/**
 * HR Connect: an uploaded employee list is read by what HR called the columns, dates day-first,
 * and nothing that identifies, pays or contacts a person is kept.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')
import { readSpreadsheet } from '@/lib/hr/spreadsheet'
import { HrConnectorError } from '@/lib/hr/connectors'

const TODAY = { y: 2026, m: 10, d: 19 }
const csv = (text: string) => Buffer.from(text.trim() + '\n', 'utf8')

describe('readSpreadsheet: CSV', () => {
  const read = readSpreadsheet(csv(`
Staff Name,D.O.B,Sex,Grade,Pass Type,Date Joined,Employment Status,Staff ID,NRIC,Monthly Salary,Email
Tan Ah Kow,24/12/1971,M,Manager,Citizen,01/03/2015,Active,S001,S7112345A,8500,tan@example.com
Lim Mei Ling,12/09/1972,Female,Staff,PR,15-Jun-2019,Active,S002,S7212345B,4200,lim@example.com
Rajesh Kumar,31/02/1980,M,Staff,Employment Pass,2021-01-04,Resigned,S003,G1234567X,5100,raj@example.com
Siti Nur,,,Work Permit,WP,1/7/2024,Active,S004,,1800,
`), 'staff.csv', TODAY)

  it('finds each column by its synonym, case and punctuation ignored', () => {
    expect(read.meta.columns).toEqual({
      name: 'Staff Name', dob: 'D.O.B', gender: 'Sex', category: 'Grade', workPass: 'Pass Type',
      hireDate: 'Date Joined', status: 'Employment Status', employeeId: 'Staff ID',
    })
    expect(read.source).toBe('csv')
    expect(read.meta.filename).toBe('staff.csv')
  })

  it('reads dates day-first: 12/09/1972 is 12 September', () => {
    expect(read.employees[0].dob).toBe('1971-12-24')
    expect(read.employees[1].dob).toBe('1972-09-12')
    expect(read.employees[0].hireDate).toBe('2015-03-01')
    expect(read.employees[1].hireDate).toBe('2019-06-15')
    expect(read.employees[2].hireDate).toBe('2021-01-04')
    expect(read.employees[3].hireDate).toBe('2024-07-01')
  })

  it('reports an impossible date instead of guessing', () => {
    const r = read.employees[2]
    expect(r.dob).toBeNull()
    expect(r.issues).toContain('Date of birth unreadable: 31/02/1980')
  })

  it('normalises gender, status and work pass', () => {
    expect(read.employees.map(e => e.gender)).toEqual(['M', 'F', 'M', null])
    expect(read.employees.map(e => e.status)).toEqual(['active', 'active', 'inactive', 'active'])
    expect(read.employees[2].issues).toContain('Inactive: Resigned')
    expect(read.employees[3].issues).toEqual(['Date of birth missing', 'Gender missing'])
    expect(read.employees[0].workPass).toBe('Citizen')
    expect(read.employees[3].category).toBe('Work Permit')
    expect(read.employees[0].occupationClass).toBeNull()
  })

  it('discards identity, pay and contact columns before anything is kept', () => {
    expect(read.meta.discarded).toEqual(['NRIC', 'Monthly Salary', 'Email'])
    expect(read.meta.ignored).toEqual(expect.arrayContaining(['NRIC', 'Monthly Salary', 'Email']))
    const text = JSON.stringify(read)
    expect(text).not.toContain('S7112345A')
    expect(text).not.toContain('8500')
    expect(text).not.toContain('tan@example.com')
    expect(read.employees[0].raw).toEqual({
      'Staff Name': 'Tan Ah Kow', 'D.O.B': '24/12/1971', Sex: 'M', Grade: 'Manager', 'Pass Type': 'Citizen',
      'Date Joined': '01/03/2015', 'Employment Status': 'Active', 'Staff ID': 'S001',
    })
  })

  it('keys rows by their line in the file and has no dependants without a relationship column', () => {
    expect(read.employees.map(e => e.key)).toEqual(['row-2', 'row-3', 'row-4', 'row-5'])
    expect(read.dependants).toEqual([])
    expect(read.skipped).toEqual([])
  })
})

describe('readSpreadsheet: names, skipped rows, defaults', () => {
  it('combines first and last name when there is no single name column', () => {
    const read = readSpreadsheet(csv(`
First Name,Last Name,Date of Birth (DD/MM/YYYY),Gender
Wei Ming,Lim,05/07/1987,M
`), 'names.csv', TODAY)
    expect(read.employees[0].name).toBe('Wei Ming Lim')
    expect(read.employees[0].dob).toBe('1987-07-05')
    expect(read.meta.columns).toMatchObject({ firstName: 'First Name', lastName: 'Last Name', dob: 'Date of Birth (DD/MM/YYYY)' })
  })

  it('skips rows without a name and totals rows, with the reason', () => {
    const read = readSpreadsheet(csv(`
Employee Name,DOB,Gender
Tan Ah Kow,24/12/1971,M
,01/01/1990,F
Total,,
`), 'list.csv', TODAY)
    expect(read.employees).toHaveLength(1)
    expect(read.skipped).toEqual([{ key: 'row-3', reason: 'No name' }, { key: 'row-4', reason: 'Totals row' }])
  })

  it('treats every row as active when the file has no status column, and says so', () => {
    const read = readSpreadsheet(csv(`
Name,Birth Date,Gender
Tan Ah Kow,24/12/1971,M
`), 'list.csv', TODAY)
    expect(read.employees[0].status).toBe('active')
    expect(read.meta.statusAssumed).toBe('active')
  })

  it('marks an employee inactive when a resignation date has passed', () => {
    const read = readSpreadsheet(csv(`
Name,DOB,Gender,Last Working Day
Tan Ah Kow,24/12/1971,M,30/06/2026
Lim Mei,01/01/1990,F,31/12/2026
`), 'list.csv', TODAY)
    expect(read.employees[0].status).toBe('inactive')
    expect(read.employees[0].issues).toContain('Inactive: left 2026-06-30')
    expect(read.employees[1].status).toBe('active')
  })

  it('finds the header below a title row, and skips a sheet before it', () => {
    const read = readSpreadsheet(csv(`
ACME Pte Ltd - staff list as at Oct 2026
,,
Name,Date of birth,Gender,Designation
Tan Ah Kow,24/12/1971,M,Director
`), 'list.csv', TODAY)
    expect(read.meta.headerRow).toBe(2)   // blank-only rows are dropped before counting
    expect(read.employees[0].category).toBe('Director')
  })

  it('throws a safe error when no header row can be found', () => {
    expect(() => readSpreadsheet(csv(`a,b,c\n1,2,3`), 'junk.csv', TODAY)).toThrowError(HrConnectorError)
    try { readSpreadsheet(csv(`a,b,c\n1,2,3`), 'junk.csv', TODAY) }
    catch (e) { expect((e as HrConnectorError).status).toBe(422) }
    expect(() => readSpreadsheet(Buffer.alloc(0), 'empty.csv', TODAY)).toThrowError(/empty/)
  })
})

describe('readSpreadsheet: dependants in the same file', () => {
  it('attaches dependants to their employee by the employee name column', () => {
    const read = readSpreadsheet(csv(`
Employee Name,Employee ID,Name,Relationship,DOB,Gender,Category
Tan Ah Kow,E1,Tan Ah Kow,Employee,24/12/1971,M,Manager
Tan Ah Kow,E1,Lee Mei Hua,Spouse,03/03/1974,F,
Tan Ah Kow,E1,Tan Jun Jie,Child,15/08/2010,M,
Lim Boon Keng,E2,Lim Boon Keng,Self,02/02/1985,M,Staff
Nobody Here,E9,Orphan Kid,Child,01/01/2015,F,
Lim Boon Keng,E2,Lim Someone,Cousin,01/01/2000,M,
`), 'census.csv', TODAY)
    expect(read.meta.columns).toMatchObject({ name: 'Name', parentName: 'Employee Name', employeeId: 'Employee ID', relationship: 'Relationship' })
    expect(read.employees.map(e => e.name)).toEqual(['Tan Ah Kow', 'Lim Boon Keng'])
    expect(read.dependants).toHaveLength(2)
    expect(read.dependants[0]).toMatchObject({ name: 'Lee Mei Hua', relationship: 'spouse', dob: '1974-03-03', gender: 'F', employeeKey: read.employees[0].key, issues: [] })
    expect(read.dependants[1]).toMatchObject({ name: 'Tan Jun Jie', relationship: 'child', employeeKey: read.employees[0].key })
    expect(read.skipped).toEqual([
      { key: 'row-7', reason: 'Relationship not recognised: Cousin' },
      { key: 'row-6', reason: 'No employee named Nobody Here for child Orphan Kid' },
    ])
  })

  it('attaches by employee id when that is the only key on the dependant row', () => {
    const read = readSpreadsheet(csv(`
Employee ID,Name,Relationship,DOB
E1,Tan Ah Kow,Employee,24/12/1971
E1,Lee Mei Hua,Wife,03/03/1974
`), 'census.csv', TODAY)
    expect(read.dependants[0].employeeKey).toBe(read.employees[0].key)
    expect(read.employees[0].raw?.['Employee ID']).toBe('E1')
  })

  it('attaches to the employee row above when there is no parent column', () => {
    const read = readSpreadsheet(csv(`
Name,Relationship,DOB,Gender
Tan Ah Kow,Employee,24/12/1971,M
Lee Mei Hua,Spouse,03/03/1974,F
Lim Boon Keng,,02/02/1985,M
Lim Xiao Mei,Daughter,09/09/2012,F
`), 'census.csv', TODAY)
    expect(read.employees.map(e => e.name)).toEqual(['Tan Ah Kow', 'Lim Boon Keng'])
    expect(read.dependants.map(d => [d.name, d.employeeKey])).toEqual([['Lee Mei Hua', 'row-2'], ['Lim Xiao Mei', 'row-4']])
  })

  it('reads a bare "Dependant" by age: 25 and under is a child', () => {
    const read = readSpreadsheet(csv(`
Name,Relationship,DOB
Tan Ah Kow,Employee,24/12/1971
Tan Jun Jie,Dependant,15/08/2010
Lee Mei Hua,Dependant,03/03/1974
`), 'census.csv', TODAY)
    expect(read.dependants.map(d => d.relationship)).toEqual(['child', 'spouse'])
  })
})

describe('readSpreadsheet: XLSX', () => {
  function book(rows: unknown[][], sheet = 'Employees'): Buffer {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['nothing here']]), 'Cover')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), sheet)
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }) as Buffer
  }

  it('reads a real date cell as its calendar day, whatever its display format', () => {
    const read = readSpreadsheet(book([
      ['ACME Pte Ltd'],
      [],
      ['Employee Name', 'Date of Birth', 'Gender', 'Job Title', 'Immigration Status', 'Hire Date', 'Status', 'Employee ID', 'IC No', 'Mobile'],
      ['Tan Ah Kow', new Date(1971, 11, 24), 'M', 'Director', 'Singapore Citizen', new Date(2015, 2, 1), 'Active', 1001, 'S7112345A', '91234567'],
      ['Lim Mei Ling', '12/09/1972', 'F', 'Executive', 'S Pass', '15/06/2019', 'Terminated', 1002, 'G7212345B', '98765432'],
    ]), 'ACME staff.xlsx', TODAY)
    expect(read.meta.sheet).toBe('Employees')
    expect(read.meta.headerRow).toBe(2)
    expect(read.employees).toHaveLength(2)
    expect(read.employees[0]).toMatchObject({ name: 'Tan Ah Kow', dob: '1971-12-24', gender: 'M', category: 'Director', workPass: 'Singapore Citizen', hireDate: '2015-03-01', status: 'active' })
    expect(read.employees[1]).toMatchObject({ name: 'Lim Mei Ling', dob: '1972-09-12', hireDate: '2019-06-15', status: 'inactive', workPass: 'S Pass' })
    expect(read.employees[0].raw?.['Employee ID']).toBe(1001)
    expect(read.meta.discarded).toEqual(['IC No', 'Mobile'])
    expect(JSON.stringify(read)).not.toContain('S7112345A')
    expect(JSON.stringify(read)).not.toContain('91234567')
  })

  it('reads an .xlsx by content when the filename lies', () => {
    const read = readSpreadsheet(book([['Name', 'DOB'], ['Tan Ah Kow', new Date(1971, 11, 24)]]), 'upload.bin', TODAY)
    expect(read.employees[0].dob).toBe('1971-12-24')
  })

  it('refuses a corrupt spreadsheet with a safe message', () => {
    expect(() => readSpreadsheet(Buffer.from('PK\u0003\u0004 not really a zip'), 'broken.xlsx', TODAY)).toThrowError(/could not be opened/)
  })
})
