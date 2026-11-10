import { describe, expect, it } from 'vitest'
import { censusMembers, censusSignal, isSheetFile } from '@/lib/chief/census'

const EMPYRION = `Sheet: GHS SG 
Name of Company :  Empyrion DC Pte Ltd,,,,Policy Period  :  ,,
,,,,Existing Insurer ,QBE,
,,,,,,
Sno. ,Employee Name  ,Staff/dependent ,Date of birth ,Gender  ,Local or Foreign workers (WP/SP) ,Plan Entitlement   
1,Fong Meng Wah Mark,Staff,1974-09-03,Male,Local,
2,William Heng Wo Ziang,Staff,1972-10-28,Male,Local,
3,"Yong Khai Si, Kay (Rong Kaixi)",Staff,1991-09-30,Female,Local,
4,,,,,,
5,,,,,,

Sheet: GHS SG  (2)
Name of Company :  Dodid Pte Ltd,,,,Policy Period  :  ,,
,,,,Existing Insurer ,Singlife,
,,,,,,
Sno. ,Employee Name  ,Staff/dependent ,Date of birth ,Gender  ,Local or Foreign workers (WP/SP) ,Plan Entitlement   
1,Danial Bin Roslan,Staff,1986-12-27,Male,Local,
2,,,,,,
`

describe('census signal', () => {
  it('counts the members per sheet, ignoring the numbered blank rows', () => {
    const s = censusSignal(EMPYRION)!
    expect(s.rows).toBe(4)
    expect(s.sheets.map(x => [x.name, x.rows, x.company, x.insurer])).toEqual([
      ['GHS SG', 3, 'Empyrion DC Pte Ltd', 'QBE'],
      ['GHS SG  (2)', 1, 'Dodid Pte Ltd', 'Singlife'],
    ])
  })
  it('reads ages when there is no birth date', () => {
    const s = censusSignal('Sheet: Staff\nName,Age,Gender,Relationship\nTan Ah Kow,43,M,Employee\nLim Mei,39,F,Spouse\n')!
    expect(s.rows).toBe(2)
  })
  it('a rate table or a benefit schedule is not a census', () => {
    expect(censusSignal('Sheet: Rates\nPlan,Age band,Annual premium\nPlan 1,0-30,350\nPlan 1,31-40,420\n')).toBeNull()
    expect(censusSignal('Sheet: Summary\nGROUP EMPLOYEE BENEFITS — PREMIUM COMPARISON,,,\nInsurer,Net,GST,Total\nIncome,28549.90,2569.49,31119.39\n')).toBeNull()
    expect(censusSignal('')).toBeNull()
  })
  it('knows a spreadsheet file', () => {
    expect(isSheetFile('census.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(isSheetFile('list.csv', null)).toBe(true)
    expect(isSheetFile('policy.pdf', 'application/pdf')).toBe(false)
  })
})

describe('census members', () => {
  it('reads the main company’s rows and counts the other companies’ sheets apart', () => {
    const r = censusMembers(EMPYRION)!
    expect(r.company).toBe('Empyrion DC Pte Ltd')
    expect(r.insurer).toBe('QBE')
    expect(r.members.map(m => m.name)).toEqual(['Fong Meng Wah Mark', 'William Heng Wo Ziang', 'Yong Khai Si, Kay (Rong Kaixi)'])
    expect(r.members[0]).toEqual({ name: 'Fong Meng Wah Mark', category: 'Default', relationship: 'self', dob: '1974-09-03', age: null, occupation_class: null })
    expect(r.others).toEqual([{ company: 'Dodid Pte Ltd', rows: 1 }])
  })
  it('reads relationships, plans and ages', () => {
    const r = censusMembers('Sheet: Staff\nName,Age,Gender,Relationship,Plan\nTan Ah Kow,43,M,Employee,Plan 2\nLim Mei,39,F,Spouse,Plan 2\nTan Jun,8,M,Child,Plan 2\n')!
    expect(r.members.map(m => [m.relationship, m.age, m.category])).toEqual([['self', 43, 'Plan 2'], ['spouse', 39, 'Plan 2'], ['child', 8, 'Plan 2']])
  })
  it('a rate table reads as no members', () => {
    expect(censusMembers('Sheet: Rates\nPlan,Age band,Annual premium\nPlan 1,0-30,350\n')).toBeNull()
  })
})

describe('censusPlans', () => {
  it('reads the current programme from the plan columns of the calculator sheet', async () => {
    const { censusPlans } = await import('@/lib/chief/census')
    const text = [
      'Sheet: Census',
      'No.,Name,Category,Relationship,Date of Birth,Occ. Class,Age (Last B\'day),Age (Next B\'day),Hospital & Surgical,Major Medical,Outpatient GP,Outpatient Specialist,Dental,Term Life,Critical Illness,Personal Accident',
      '1,"Yong Khai Si, Kay",,EE,1991-09-30,1,35,36,Plan 5 (GRH 1-bed),Plan 5,Plan 1B ($10 co-pay),Plan 4,,,,',
      '2,Chan Pui Min,,EE,1991-05-08,1,35,36,Plan 5 (GRH 1-bed),Plan 5,Plan 1B ($10 co-pay),Plan 4,,,,',
      '3,Michael Tang,,EE,1953-02-27,1,73,74,Plan 5 (GRH 1-bed),Plan 5,Plan 1B ($10 co-pay),Plan 4,,,,',
    ].join('\n')
    const p = censusPlans(text)!
    expect(p.covers).toEqual(['GHS', 'EMM', 'GOPC', 'GOSC'])
    expect(p.current).toMatchObject({ ward: 'G1', gmm: true, gp: 'copay', sp: 'entry', dental: null, deps: 'none' })
    expect(p.sample.GHS).toBe('Plan 5 (GRH 1-bed)')
  })
  it('is null for a census with no plan columns', async () => {
    const { censusPlans } = await import('@/lib/chief/census')
    expect(censusPlans('Sheet: A\nName,Relationship,Date of Birth\nA B,Employee,01/02/1990\n')).toBeNull()
  })
})
