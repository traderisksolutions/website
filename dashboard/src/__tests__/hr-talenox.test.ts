/**
 * HR Connect: the Talenox connector maps the vendor's record to ours, follows pages, drops
 * sensitive fields and never keeps the token. No network: fetch is injected.
 */
import { describe, it, expect } from 'vitest'
import { fetchTalenox, TALENOX_EMPLOYEES_URL, mapTalenoxEmployee } from '@/lib/hr/talenox'
import { HrConnectorError } from '@/lib/hr/connectors'
import sample from '@/lib/hr/talenox-sample.json'

const TODAY = { y: 2026, m: 10, d: 19 }
const TOKEN = 'tlx_sample_token_not_real'

type Call = { url: string; init?: { method?: string; headers?: Record<string, string> } }

/** A fetch that serves the sample's pages by ?page=, recording each call. */
function sampleFetch(calls: Call[] = []) {
  const impl = async (url: string, init?: Call['init']) => {
    calls.push({ url, init })
    const page = Number(new URL(url).searchParams.get('page') ?? '1')
    const body = sample.pages[page - 1]
    if (!body) return { ok: false, status: 404, text: async () => '{"error":"no such page"}' }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  }
  return { impl, calls }
}

describe('fetchTalenox', () => {
  it('follows page / total_pages and returns every employee', async () => {
    const { impl, calls } = sampleFetch()
    const read = await fetchTalenox(TOKEN, impl, TODAY)
    expect(calls.map(c => c.url)).toEqual([TALENOX_EMPLOYEES_URL, `${TALENOX_EMPLOYEES_URL}?page=2`])
    expect(read.source).toBe('talenox')
    expect(read.meta).toMatchObject({ pages: 2, count: 3, endpoint: TALENOX_EMPLOYEES_URL })
    expect(read.employees.map(e => e.key)).toEqual(['10231', '10232', '10233'])
    expect(read.dependants).toEqual([])
    expect(read.skipped).toEqual([])
  })

  it('sends the token as a bearer header and keeps it nowhere else', async () => {
    const { impl, calls } = sampleFetch()
    const read = await fetchTalenox(TOKEN, impl, TODAY)
    for (const c of calls) {
      expect(c.init?.method).toBe('GET')
      expect(c.init?.headers?.Authorization).toBe(`Bearer ${TOKEN}`)
    }
    expect(JSON.stringify(read)).not.toContain(TOKEN)
  })

  it('maps names, dates, gender, category, work pass and status', async () => {
    const { impl } = sampleFetch()
    const read = await fetchTalenox(TOKEN, impl, TODAY)
    const [lim, nurul, arjun] = read.employees
    expect(lim).toMatchObject({
      name: 'Wei Ming Lim', dob: '1988-03-14', gender: 'M', category: 'Operations Manager',
      workPass: 'Singapore Citizen', hireDate: '2019-07-01', status: 'active', occupationClass: null, issues: [],
    })
    expect(nurul).toMatchObject({ name: 'Nurul Aisyah binte Rahman', dob: '1992-11-02', gender: 'F', workPass: 'Permanent Resident', status: 'active' })
    expect(nurul.category).toBe('Senior Accounts Executive')   // the current job, not the first
    expect(arjun).toMatchObject({ name: 'Arjun Pillai', dob: '1985-06-30', workPass: 'Employment Pass', status: 'inactive' })
    expect(arjun.issues).toEqual(['Inactive: resigned 2024-12-31'])
  })

  it('drops identity, pay, bank and contact fields from raw', async () => {
    const { impl } = sampleFetch()
    const read = await fetchTalenox(TOKEN, impl, TODAY)
    const text = JSON.stringify(read)
    for (const secret of ['S8812345A', 'S9212345B', 'G1234567X', '0123456789', '7200', '4800', '6500', '@example.com', '9123 4567', 'Sample Road']) {
      expect(text).not.toContain(secret)
    }
    const raw = read.employees[0].raw as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(['birthdate', 'department', 'employee_id', 'first_name', 'gender', 'hired_date', 'id', 'immigration_status', 'job_title', 'last_name', 'nationality', 'resign_date'])
  })

  it('a resignation date still in the future leaves the employee active', () => {
    const e = mapTalenoxEmployee({ id: 1, name: 'Soon Leaving', birthdate: '1990-01-01', gender: 'F', resign_date: '2026-12-31' }, 0, TODAY)
    expect(e.status).toBe('active')
    expect(e.issues).toEqual([])
  })

  it('accepts a bare array with no pagination hints', async () => {
    const read = await fetchTalenox(TOKEN, async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ id: 7, name: 'Solo Person', dob: '01/02/1990', gender: 'male' }]) }), TODAY)
    expect(read.meta.pages).toBe(1)
    expect(read.employees[0]).toMatchObject({ key: '7', name: 'Solo Person', dob: '1990-02-01', gender: 'M' })
  })

  it('follows a next link when the response gives one', async () => {
    const urls: string[] = []
    const read = await fetchTalenox(TOKEN, async (url: string) => {
      urls.push(url)
      const body = url.includes('cursor=abc')
        ? { data: [{ id: 2, name: 'Second' }], next: null }
        : { data: [{ id: 1, name: 'First' }], next: `${TALENOX_EMPLOYEES_URL}?cursor=abc` }
      return { ok: true, status: 200, text: async () => JSON.stringify(body) }
    }, TODAY)
    expect(urls).toHaveLength(2)
    expect(read.employees.map(e => e.name)).toEqual(['First', 'Second'])
  })

  it('reports a rejected token as such', async () => {
    const p = fetchTalenox(TOKEN, async () => ({ ok: false, status: 401, text: async () => '{"error":"Unauthorized"}' }), TODAY)
    await expect(p).rejects.toThrowError(HrConnectorError)
    await expect(p).rejects.toMatchObject({ message: 'Talenox rejected the token', status: 401 })
  })

  it('reports other failures with the status', async () => {
    await expect(fetchTalenox(TOKEN, async () => ({ ok: false, status: 503, text: async () => 'busy' }), TODAY))
      .rejects.toMatchObject({ message: 'Talenox returned 503', status: 503 })
    await expect(fetchTalenox(TOKEN, async () => ({ ok: true, status: 200, text: async () => '<html>login</html>' }), TODAY))
      .rejects.toThrowError(/not JSON/)
    await expect(fetchTalenox(TOKEN, async () => { throw new Error('ECONNREFUSED') }, TODAY))
      .rejects.toThrowError(/could not be reached/)
    await expect(fetchTalenox('   ', async () => { throw new Error('should not be called') }, TODAY))
      .rejects.toMatchObject({ status: 400 })
  })

  it('skips a record with no name and says so', async () => {
    const read = await fetchTalenox(TOKEN, async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ employees: [{ id: 9, birthdate: '1990-01-01' }] }) }), TODAY)
    expect(read.employees).toEqual([])
    expect(read.skipped).toEqual([{ key: '9', reason: 'No name on the Talenox record' }])
  })
})
