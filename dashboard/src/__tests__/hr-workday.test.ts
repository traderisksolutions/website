/**
 * HR Connect: the Workday connector builds a Get_Workers request, pages to Total_Pages, maps each
 * wd:Worker and keeps the password out of everything it returns. No network: fetch is injected.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchWorkday, getWorkersEnvelope, mapWorkdayWorker, pagingOf, workdayEndpoint, xmlBlocks } from '@/lib/hr/workday'
import { HrConnectorError } from '@/lib/hr/connectors'

const TODAY = { y: 2026, m: 10, d: 19 }
const CREDS = { tenantHost: 'wd3.myworkday.com', tenant: 'acme_corp', username: 'ISU_TRS', password: 'S3cret-sample-password' }

const sampleXml = readFileSync(join(__dirname, '../lib/hr/workday-sample.xml'), 'utf8')
const pages = [...sampleXml.matchAll(/<page n="\d+">([\s\S]*?)<\/page>/g)].map(m => m[1].trim())

type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }

/** A fetch that serves the sample page the request asks for, recording each call. */
function sampleFetch(calls: Call[] = []) {
  const impl = async (url: string, init?: Call['init']) => {
    calls.push({ url, init })
    const page = Number(/<wd:Page>(\d+)<\/wd:Page>/.exec(init?.body ?? '')?.[1] ?? '1')
    const xml = pages[page - 1]
    if (!xml) return { ok: false, status: 500, text: async () => soapFault('Page out of range') }
    return { ok: true, status: 200, text: async () => xml }
  }
  return { impl, calls }
}

const soapFault = (text: string) => `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode><faultstring>${text}</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>`

describe('the sample', () => {
  it('has two pages with three workers', () => {
    expect(pages).toHaveLength(2)
    expect(xmlBlocks(pages[0], 'Worker')).toHaveLength(2)
    expect(xmlBlocks(pages[1], 'Worker')).toHaveLength(1)
    expect(pagingOf(pages[0])).toEqual({ page: 1, totalPages: 2, totalResults: 3 })
    expect(pagingOf(pages[1])).toEqual({ page: 2, totalPages: 2, totalResults: 3 })
  })
})

describe('getWorkersEnvelope', () => {
  it('signs in as user@tenant with a UsernameToken and asks for the page', () => {
    const xml = getWorkersEnvelope(CREDS, 3)
    expect(xml).toContain('<wsse:Username>ISU_TRS@acme_corp</wsse:Username>')
    expect(xml).toContain(`#PasswordText">${CREDS.password}</wsse:Password>`)
    expect(xml).toContain('<wd:Page>3</wd:Page>')
    expect(xml).toContain('<wd:Count>200</wd:Count>')
    expect(xml).toContain('<wd:Include_Personal_Information>true</wd:Include_Personal_Information>')
    expect(xml).toContain('<wd:Include_Employment_Information>true</wd:Include_Employment_Information>')
    expect(xml).toContain('wd:version="v42.0"')
  })

  it('escapes XML in the password', () => {
    expect(getWorkersEnvelope({ ...CREDS, password: 'a<b&"c' }, 1)).toContain('a&lt;b&amp;&quot;c</wsse:Password>')
  })
})

describe('workdayEndpoint', () => {
  it('builds the Human_Resources v42.0 URL and tolerates a scheme or path on the host', () => {
    expect(workdayEndpoint('wd3.myworkday.com', 'acme_corp')).toBe('https://wd3.myworkday.com/ccx/service/acme_corp/Human_Resources/v42.0')
    expect(workdayEndpoint('https://wd5-impl.workday.com/acme', 'acme_corp')).toBe('https://wd5-impl.workday.com/ccx/service/acme_corp/Human_Resources/v42.0')
  })
  it('refuses a host or tenant that is not one', () => {
    expect(() => workdayEndpoint('not a host', 'acme')).toThrowError(HrConnectorError)
    expect(() => workdayEndpoint('wd3.myworkday.com', 'acme corp')).toThrowError(/tenant id/)
  })
})

describe('fetchWorkday', () => {
  it('pages to Total_Pages and returns every worker', async () => {
    const { impl, calls } = sampleFetch()
    const read = await fetchWorkday(CREDS, impl, TODAY)
    expect(calls).toHaveLength(2)
    expect(calls.every(c => c.url === 'https://wd3.myworkday.com/ccx/service/acme_corp/Human_Resources/v42.0')).toBe(true)
    expect(calls.every(c => c.init?.method === 'POST')).toBe(true)
    expect(calls.map(c => /<wd:Page>(\d+)<\/wd:Page>/.exec(c.init!.body!)![1])).toEqual(['1', '2'])
    expect(read.source).toBe('workday')
    expect(read.meta).toMatchObject({ tenantHost: 'wd3.myworkday.com', tenant: 'acme_corp', username: 'ISU_TRS', service: 'Human_Resources/v42.0', pages: 2, count: 3 })
    expect(read.employees.map(e => e.key)).toEqual(['100234', '100301', '100418'])
    expect(read.skipped).toEqual([])
    expect(read.dependants).toEqual([])
  })

  it('maps legal name, birth date with its offset stripped, gender code, hire date, title and citizenship', async () => {
    const { impl } = sampleFetch()
    const read = await fetchWorkday(CREDS, impl, TODAY)
    expect(read.employees[0]).toMatchObject({
      key: '100234', name: 'Lim Wei Ming', dob: '1988-03-14', gender: 'M', category: 'Operations Manager',
      workPass: 'Citizen (Singapore)', hireDate: '2019-07-01', status: 'active', occupationClass: null, issues: [],
    })
  })

  it('flags the terminated worker inactive rather than dropping her', async () => {
    const { impl } = sampleFetch()
    const read = await fetchWorkday(CREDS, impl, TODAY)
    const tan = read.employees[1]
    expect(tan).toMatchObject({ name: 'Tan Siew Mei', dob: '1979-12-24', gender: 'F', category: 'Finance Director', workPass: 'Permanent Resident (Singapore)', hireDate: '2016-03-01', status: 'inactive' })
    expect(tan.issues).toEqual(['Inactive: terminated 2025-08-31'])
  })

  it('reports a missing birth date as an issue and reads the visa as the work pass', async () => {
    const { impl } = sampleFetch()
    const read = await fetchWorkday(CREDS, impl, TODAY)
    const raj = read.employees[2]
    expect(raj).toMatchObject({ name: 'Rajesh Kumar', dob: null, gender: 'M', category: 'Software Engineer', workPass: 'Employment Pass', hireDate: '2023-10-16', status: 'active' })
    expect(raj.issues).toEqual(['Date of birth missing'])
  })

  it('keeps the password and national id out of everything it returns', async () => {
    const { impl } = sampleFetch()
    const read = await fetchWorkday(CREDS, impl, TODAY)
    const text = JSON.stringify(read)
    expect(text).not.toContain(CREDS.password)
    expect(text).not.toContain('S8812345A')
    expect(text).not.toContain('wd:')   // raw holds parsed fields, not XML
  })

  it('reads a response whose namespace prefix is not wd', () => {
    const xml = pages[1].replace(/wd:/g, 'ns0:').replace(/xmlns:wd=/g, 'xmlns:ns0=')
    const [w] = xmlBlocks(xml, 'Worker')
    expect(mapWorkdayWorker(w, 0, TODAY)).toMatchObject({ key: '100418', name: 'Rajesh Kumar', gender: 'M', status: 'active' })
  })

  it('reports a refused integration user on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const p = fetchWorkday(CREDS, async () => ({ ok: false, status, text: async () => '' }), TODAY)
      await expect(p).rejects.toThrowError(HrConnectorError)
      await expect(p).rejects.toMatchObject({ status, message: 'Workday refused the integration user: check the user, password and the Worker Data and Date of Birth domains' })
    }
  })

  it('reads an authentication SOAP fault the same way, and other faults by their text', async () => {
    const auth = fetchWorkday(CREDS, async () => ({ ok: false, status: 500, text: async () => soapFault('invalid username or password') }), TODAY)
    await expect(auth).rejects.toThrowError(/refused the integration user/)
    const other = fetchWorkday(CREDS, async () => ({ ok: false, status: 500, text: async () => soapFault('Processing error: the tenant is locked') }), TODAY)
    await expect(other).rejects.toMatchObject({ status: 500, message: 'Workday returned an error: Processing error: the tenant is locked' })
    const noFault = fetchWorkday(CREDS, async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' }), TODAY)
    await expect(noFault).rejects.toMatchObject({ status: 502, message: 'Workday returned 502' })
  })

  it('reports a host that cannot be reached without the password', async () => {
    const p = fetchWorkday(CREDS, async () => { throw new Error(`ENOTFOUND ${CREDS.password}`) }, TODAY)
    await expect(p).rejects.toThrowError(/could not be reached/)
    await expect(p).rejects.not.toThrowError(new RegExp(CREDS.password))
  })

  it('refuses to call Workday without a user and password', async () => {
    await expect(fetchWorkday({ ...CREDS, password: '' }, async () => { throw new Error('should not be called') }, TODAY)).rejects.toMatchObject({ status: 400 })
  })
})
