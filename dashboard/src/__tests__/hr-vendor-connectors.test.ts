/**
 * HR Connect: HiBob, Deel and BambooHR connectors. No network: fetch is injected. Response shapes
 * follow each vendor's API reference; field names are matched tolerantly because vendors nest them
 * differently by account.
 */
import { describe, it, expect } from 'vitest'
import { fetchHiBob, HIBOB_API } from '@/lib/hr/hibob'
import { fetchDeel, DEEL_API } from '@/lib/hr/deel'
import { fetchBambooHR, bambooSubdomain, bambooBase } from '@/lib/hr/bamboohr'
import { deepPick } from '@/lib/hr/vendor'
import { HrConnectorError } from '@/lib/hr/connectors'

const TODAY = { y: 2026, m: 10, d: 29 }
type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }
const ok = (b: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) })
const fail = (status: number) => ({ ok: false, status, text: async () => '{}' })

describe('deepPick', () => {
  it('finds nested, flat-slash and dotted keys', () => {
    expect(deepPick({ personal: { birthDate: '1980-01-02' } }, 'birthDate')).toBe('1980-01-02')
    expect(deepPick({ '/root/firstName': 'Ann' }, 'firstName')).toBe('Ann')
    expect(deepPick({ 'root.surname': 'Lee' }, 'surname')).toBe('Lee')
    expect(deepPick({ a: { b: {} } }, 'birthDate')).toBeUndefined()
  })
})

describe('fetchHiBob', () => {
  const people = { employees: [
    { id: '301', firstName: 'Kenneth', surname: 'Parker', personal: { birthDate: '1985-02-06', gender: 'Male', nationalId: 'S8812345A' }, work: { title: 'Director', startDate: '2010-02-06' }, internal: { status: 'Active' } },
    { '/root/id': '302', '/root/firstName': 'Mei', '/root/surname': 'Tan', '/work/title': 'Analyst', '/internal/status': 'Inactive' },
  ] }
  it('reads people with Basic auth and maps them', async () => {
    const calls: Call[] = []
    const read = await fetchHiBob('SERVICE-1', 'tok_abcdefghij', async (url, init) => { calls.push({ url, init }); return ok(people) }, TODAY)
    expect(calls[0].url).toBe(`${HIBOB_API}/people/search`)
    expect(calls[0].init?.headers?.Authorization).toBe(`Basic ${Buffer.from('SERVICE-1:tok_abcdefghij').toString('base64')}`)
    expect(read.employees.map(e => [e.key, e.name, e.dob, e.gender, e.category, e.status])).toEqual([
      ['301', 'Kenneth Parker', '1985-02-06', 'M', 'Director', 'active'],
      ['302', 'Mei Tan', null, null, 'Analyst', 'inactive'],
    ])
    expect(read.employees[1].issues.some(i => /Personal category/.test(i))).toBe(true)
    expect(JSON.stringify(read)).not.toContain('S8812345A')
    expect(JSON.stringify(read)).not.toContain('tok_abcdefghij')
  })
  it('retries with the default field set when Bob rejects a field', async () => {
    const bodies: string[] = []
    const read = await fetchHiBob('SERVICE-1', 'tok_abcdefghij', async (_u, init) => { bodies.push(init?.body ?? ''); return bodies.length === 1 ? fail(400) : ok(people) }, TODAY)
    expect(JSON.parse(bodies[1])).toEqual({ showInactive: false })
    expect(read.employees).toHaveLength(2)
  })
  it('turns 401 into a message HR can act on', async () => {
    await expect(fetchHiBob('x', 'tok_abcdefghij', async () => fail(401), TODAY)).rejects.toThrow(/rejected the service user/)
  })
})

describe('fetchDeel', () => {
  it('pages through people and flags contractors and other countries', async () => {
    const calls: string[] = []
    const page1 = { data: Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, first_name: 'Staff', last_name: String(i), birth_date: '1990-05-01', hiring_status: 'active', country: 'SG', job_title: 'Engineer' })), page: { total_rows: 102 } }
    const page2 = { data: [
      { id: 'c1', full_name: 'Ravi Kumar', birth_date: '1988-03-03', hiring_type: 'contractor', country: 'IN', hiring_status: 'active' },
      { id: 'x1', first_name: 'Old', last_name: 'Hand', birth_date: '1970-01-01', hiring_status: 'terminated', country: 'SG' },
    ], page: { total_rows: 102 } }
    const read = await fetchDeel('deel_tok_123456', async url => { calls.push(url); return ok(url.includes('offset=0') ? page1 : page2) }, TODAY)
    expect(calls).toEqual([`${DEEL_API}/people?limit=100&offset=0`, `${DEEL_API}/people?limit=100&offset=100`])
    expect(read.employees).toHaveLength(102)
    const ravi = read.employees.find(e => e.key === 'c1')!
    expect(ravi.name).toBe('Ravi Kumar')
    expect(ravi.issues).toEqual(expect.arrayContaining(['Contractor in Deel, not an employee', 'Works in IN']))
    expect(read.employees.find(e => e.key === 'x1')!.status).toBe('inactive')
  })
  it('explains a token without the people scope', async () => {
    await expect(fetchDeel('deel_tok_123456', async () => fail(403), TODAY)).rejects.toThrow(/people:read/)
  })
})

describe('fetchBambooHR', () => {
  it('normalises the company name', () => {
    expect(bambooSubdomain('https://Acme.bamboohr.com/home')).toBe('acme')
    expect(() => bambooSubdomain('not a name')).toThrow(HrConnectorError)
  })
  it('reads the custom report and dependants', async () => {
    const calls: Call[] = []
    const report = { fields: [], employees: [
      { id: '7', firstName: 'Ann', lastName: 'Lee', dateOfBirth: '1984-07-09', gender: 'Female', status: 'Active', hireDate: '2015-01-05', jobTitle: 'Manager', ssn: '123' },
      { id: '8', firstName: 'Bob', lastName: 'Ng', dateOfBirth: '0000-00-00', gender: 'Male', status: 'Inactive', terminationDate: '2025-01-01' },
    ] }
    const deps = { 'Employee Dependents': [
      { id: 'd1', employeeId: '7', firstName: 'Sam', lastName: 'Lee', relationship: 'Spouse', gender: 'Male', dateOfBirth: '1983-02-02' },
      { id: 'd2', employeeId: '7', firstName: 'Kit', lastName: 'Lee', relationship: 'Daughter', dateOfBirth: '2016-03-03' },
      { id: 'd3', employeeId: '7', firstName: 'Ma', lastName: 'Lee', relationship: 'Mother', dateOfBirth: '1950-01-01' },
    ] }
    const read = await fetchBambooHR('acme', 'bamboo_key_123456', async (url, init) => { calls.push({ url, init }); return ok(url.includes('employeedependents') ? deps : report) }, TODAY)
    expect(calls[0].url).toBe(`${bambooBase('acme')}/reports/custom?format=JSON&onlyCurrent=true`)
    expect(calls[0].init?.headers?.Authorization).toBe(`Basic ${Buffer.from('bamboo_key_123456:x').toString('base64')}`)
    expect(read.employees.map(e => [e.key, e.name, e.dob, e.gender, e.status])).toEqual([['7', 'Ann Lee', '1984-07-09', 'F', 'active'], ['8', 'Bob Ng', null, 'M', 'inactive']])
    expect(read.dependants.map(d => [d.employeeKey, d.name, d.relationship, d.dob])).toEqual([['7', 'Sam Lee', 'spouse', '1983-02-02'], ['7', 'Kit Lee', 'child', '2016-03-03']])
    expect(read.meta.dependantsRead).toBe(true)
    expect(JSON.stringify(read)).not.toContain('bamboo_key_123456')
  })
  it('still returns the list when the login cannot read dependants', async () => {
    const read = await fetchBambooHR('acme', 'bamboo_key_123456', async url => url.includes('employeedependents') ? fail(403) : ok({ employees: [{ id: '7', firstName: 'Ann', lastName: 'Lee', dateOfBirth: '1984-07-09' }] }), TODAY)
    expect(read.employees).toHaveLength(1)
    expect(read.dependants).toEqual([])
    expect(read.meta.dependantsRead).toBe(false)
  })
})
