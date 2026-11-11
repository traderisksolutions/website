import { describe, expect, it } from 'vitest'
import { censusMembers } from '@/lib/chief/census'
import { censusFromRows } from '@/lib/gb/census-parse'

// OUE's member census, 11 Nov 2026: no name column, people numbered, dependants as "3D".
const SHEET = [
  'Sheet: OUE',
  'Member Census,,,,,,,,,,,,,',
  'Entity:,OUE Limited,,,,,,,,,,,,',
  ',,,,,,,2027-12-31,Plans,,,,,',
  'S/N,Job Level,Employment Date,Basic Salary,Nationality,Gender,Date of Birth ,Age,GP,SP,H&S*,GMM,Dental,GTL',
  '1,EVP,2006-11-30," 153,846.15 ",SINGAPOREAN,Male,1960-06-15,67,1,1,1,1,1,36',
  '1D,,,,INDONESIAN,Female,1963-02-14,64,1,1,1,1,2,',
  '2,EVP,2016-01-01," 54,166.67 ",SINGAPOREAN,Male,1962-03-09,65,1,1,1,1,1,36',
  '3,EVP,2018-10-24," 33,257.00 ",HONG KONG CHINESE,Male,1990-09-18,37,1,1,1,1,1,36',
  '3D,,,,HONG KONG CHINESE,Male,2024-06-30,3,1,1,1,1,,',
  '3D,,,,HONG KONG CHINESE,Male,2021-12-08,6,1,1,1,1,,',
  '4,Manager,2020-01-06," 8,000.00 ",SINGAPOREAN,Female,1988-04-02,38,2,2,2,2,2,24',
].join('\n')

describe('a numbered census with no name column', () => {
  it('the attachment reader numbers the people, reads dependants from the D suffix and the job level as the category', () => {
    const r = censusMembers(SHEET)!
    expect(r.members.map(m => [m.name, m.relationship, m.category])).toEqual([
      ['Member 1', 'self', 'EVP'], ['Member 1 · dependant 1', 'spouse', 'EVP'],
      ['Member 2', 'self', 'EVP'], ['Member 3', 'self', 'EVP'], ['Member 3 · dependant 1', 'child', 'EVP'], ['Member 3 · dependant 2', 'child', 'EVP'],
      ['Member 4', 'self', 'Manager'],
    ])
    expect(r.members.every(m => !/CHINESE|SINGAPOREAN/.test(m.name))).toBe(true)
  })
  it('the upload reader does the same from the rows', () => {
    const rows = SHEET.split('\n').slice(1).map(l => l.split(','))
    const r = censusFromRows(rows, { y: 2026, m: 11, d: 12 })
    expect(r.error).toBeUndefined()
    expect(r.members.map(m => [m.name, m.relationship, m.category])).toEqual([
      ['Member 1', 'self', 'EVP'], ['Member 1 · dependant 1', 'spouse', 'EVP'],
      ['Member 2', 'self', 'EVP'], ['Member 3', 'self', 'EVP'], ['Member 3 · dependant 1', 'child', 'EVP'], ['Member 3 · dependant 2', 'child', 'EVP'],
      ['Member 4', 'self', 'Manager'],
    ])
    expect(r.found.sn).toBe('S/N')
  })
})
