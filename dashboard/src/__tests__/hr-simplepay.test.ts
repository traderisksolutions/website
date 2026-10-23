/**
 * HR Connect: the SimplePay connector lists the key's companies, asks which one when there are
 * several, maps the wrapped employee records, drops sensitive fields and keeps the key nowhere.
 * No network: fetch is injected. Shapes follow SimplePay's API reference (wrapped array items).
 */
import { describe, it, expect } from 'vitest'
import { fetchSimplePay, listSimplePayCompanies, mapSimplePayEmployee, SimplePayChooseCompany, SIMPLEPAY_API } from '@/lib/hr/simplepay'
import { HrConnectorError } from '@/lib/hr/connectors'

const TODAY = { y: 2026, m: 10, d: 23 }
const KEY = 'sp_sample_key_not_real_0001'

const CLIENTS_ONE = [{ client: { id: 36818, name: 'Gembridge Pte Ltd', physical_address: { st_name: '5 North Bridge Road' } } }]
const CLIENTS_TWO = [...CLIENTS_ONE, { client: { id: 40001, name: 'Gembridge Holdings' } }]
const EMPLOYEES = [
  { employee: { id: 501, number: 'E001', first_name: 'Kenneth', last_name: 'Parker', birthdate: '1985-02-06', appointment_date: '2010-02-06', job_title: 'Director', payment_method: 'eft', bank_account: { account_number: '0123456789' }, identification_number: 'S8812345A', email: 'kenneth@example.com', physical_address: { st_name: 'North Bridge Rd' } } },
  { employee: { id: 502, first_name: 'Mei', last_name: 'Tan', birthdate: '06/05/1992', appointment_date: '2019-01-01', job_title: 'Staff', termination_date: '2025-06-30' } },
  { employee: { id: 503, first_name: '', last_name: '', birthdate: '1990-01-01' } },
]

function fakeFetch(clients: unknown, calls: { url: string; headers?: Record<string, string> }[] = []) {
  return async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers })
    if (url === `${SIMPLEPAY_API}/clients`) return { ok: true, status: 200, text: async () => JSON.stringify(clients) }
    if (url.endsWith('/employees')) return { ok: true, status: 200, text: async () => JSON.stringify(EMPLOYEES) }
    return { ok: false, status: 404, text: async () => '{"message":"not found"}' }
  }
}

describe('fetchSimplePay', () => {
  it('reads the only company and maps its employees', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = []
    const read = await fetchSimplePay(KEY, null, fakeFetch(CLIENTS_ONE, calls), TODAY)
    expect(calls.map(c => c.url)).toEqual([`${SIMPLEPAY_API}/clients`, `${SIMPLEPAY_API}/clients/36818/employees`])
    expect(calls.every(c => c.headers?.Authorization === KEY)).toBe(true)
    expect(read.source).toBe('simplepay')
    expect(read.company).toEqual({ id: '36818', name: 'Gembridge Pte Ltd' })
    expect(read.employees.map(e => [e.key, e.name, e.dob, e.category, e.hireDate, e.status])).toEqual([
      ['501', 'Kenneth Parker', '1985-02-06', 'Director', '2010-02-06', 'active'],
      ['502', 'Mei Tan', '1992-05-06', 'Staff', '2019-01-01', 'inactive'],
    ])
    expect(read.skipped).toEqual([{ key: '503', reason: 'No name on the SimplePay record' }])
    expect(read.dependants).toEqual([])
  })

  it('does not flag missing gender, which SimplePay does not keep', () => {
    const e = mapSimplePayEmployee({ id: 1, first_name: 'A', last_name: 'B', birthdate: '1990-01-01' }, 0, TODAY)
    expect(e.issues).toEqual([])
  })

  it('asks which company when the key sees several, then reads the chosen one', async () => {
    await expect(fetchSimplePay(KEY, null, fakeFetch(CLIENTS_TWO), TODAY)).rejects.toBeInstanceOf(SimplePayChooseCompany)
    try { await fetchSimplePay(KEY, null, fakeFetch(CLIENTS_TWO), TODAY) } catch (e) {
      expect((e as SimplePayChooseCompany).companies.map(c => c.name)).toEqual(['Gembridge Pte Ltd', 'Gembridge Holdings'])
    }
    const read = await fetchSimplePay(KEY, '40001', fakeFetch(CLIENTS_TWO), TODAY)
    expect(read.company.name).toBe('Gembridge Holdings')
    await expect(fetchSimplePay(KEY, '99999', fakeFetch(CLIENTS_TWO), TODAY)).rejects.toThrow('That company is not available to this key.')
  })

  it('drops identity, pay, bank and contact fields and never keeps the key', async () => {
    const read = await fetchSimplePay(KEY, null, fakeFetch(CLIENTS_ONE), TODAY)
    const text = JSON.stringify(read)
    for (const secret of ['0123456789', 'S8812345A', '@example.com', 'North Bridge Rd', KEY]) expect(text).not.toContain(secret)
  })

  it('reports a rejected key, the hourly limit and maintenance plainly', async () => {
    const status = (s: number) => async () => ({ ok: false, status: s, text: async () => '{"message":"x"}' })
    await expect(listSimplePayCompanies(KEY, status(401))).rejects.toThrow('SimplePay rejected the API key')
    await expect(listSimplePayCompanies(KEY, status(429))).rejects.toThrow(/too many requests/)
    await expect(listSimplePayCompanies(KEY, status(503))).rejects.toThrow(/maintenance/)
    await expect(listSimplePayCompanies('  ')).rejects.toBeInstanceOf(HrConnectorError)
  })
})
