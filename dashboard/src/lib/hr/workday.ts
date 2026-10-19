/**
 * HR Connect: the employee list from a client's Workday tenant.
 *
 * The client's Workday administrator creates an integration system user (ISU) with Get access to
 * the Worker Data: Public Worker Reports and Person Data: Date of Birth domains, and HR enters the
 * tenant host, tenant id, user and password on the public page. We call the Human_Resources web
 * service's Get_Workers operation (SOAP, WS-Security UsernameToken), 200 workers a page, until
 * Total_Pages is reached, and map each wd:Worker to an HrEmployee.
 *
 * The XML is read with tolerant regex helpers, not a parser: the response is large, flat in the
 * parts we need, and adding an XML dependency for six fields is not worth it. The namespace
 * prefix (wd:, ns0:) is not assumed. The password is used for the request and nothing else: never
 * in meta, never in an error, never logged.
 */
import type { HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isoDate, normaliseGender, normaliseStatus, rowIssues } from './connectors'
import { todaySGT, type CalendarDate } from '../dates/dob'

export type WorkdayCredentials = { tenantHost: string; tenant: string; username: string; password: string }

export const WORKDAY_SERVICE = 'Human_Resources'
export const WORKDAY_VERSION = 'v42.0'
export const WORKDAY_PAGE_SIZE = 200
const MAX_PAGES = 500

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function workdayEndpoint(tenantHost: string, tenant: string): string {
  const host = String(tenantHost).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new HrConnectorError('Enter the tenant host as Workday shows it, for example wd3.myworkday.com.', 400)
  const t = String(tenant).trim()
  if (!/^[a-z0-9_-]+$/i.test(t)) throw new HrConnectorError('Enter the tenant id as it appears in the Workday URL, for example acme_corp.', 400)
  return `https://${host}/ccx/service/${t}/${WORKDAY_SERVICE}/${WORKDAY_VERSION}`
}

/** One Get_Workers request for one page. Exported so the test can check the envelope. */
export function getWorkersEnvelope(creds: WorkdayCredentials, page: number, count = WORKDAY_PAGE_SIZE): string {
  const user = `${creds.username.trim()}@${creds.tenant.trim()}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wd="urn:com.workday/bsvc">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${xmlEscape(user)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${xmlEscape(creds.password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <wd:Get_Workers_Request wd:version="${WORKDAY_VERSION}">
      <wd:Response_Filter>
        <wd:Page>${page}</wd:Page>
        <wd:Count>${count}</wd:Count>
      </wd:Response_Filter>
      <wd:Response_Group>
        <wd:Include_Reference>true</wd:Include_Reference>
        <wd:Include_Personal_Information>true</wd:Include_Personal_Information>
        <wd:Include_Employment_Information>true</wd:Include_Employment_Information>
        <wd:Include_Compensation>false</wd:Include_Compensation>
        <wd:Include_Organizations>false</wd:Include_Organizations>
        <wd:Include_Roles>false</wd:Include_Roles>
      </wd:Response_Group>
    </wd:Get_Workers_Request>
  </soapenv:Body>
</soapenv:Envelope>`
}

// ---- tolerant XML helpers -------------------------------------------------------------------

const NS = '(?:[A-Za-z_][\\w.-]*:)?'
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every <prefix:Tag ...>…</prefix:Tag> block, outermost occurrences, in document order. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${NS}${esc(tag)}(?=[\\s>/])[^>]*?(?:/>|>([\\s\\S]*?)<\\/${NS}${esc(tag)}\\s*>)`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[0])
  return out
}

/** The first <prefix:Tag …>…</prefix:Tag> block, or null. */
export function xmlBlock(xml: string, tag: string): string | null {
  return xmlBlocks(xml, tag)[0] ?? null
}

export function xmlDecode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim()
}

/** Text content of the first <prefix:Tag>…</prefix:Tag>, decoded. Null when absent or empty. */
export function xmlText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${NS}${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${NS}${esc(tag)}\\s*>`).exec(xml)
  if (!m) return null
  const t = xmlDecode(m[1])
  return t ? t : null
}

/** Value of an attribute on the opening tag of the first <prefix:Tag>, prefix on the attribute optional. */
export function xmlAttr(xml: string, tag: string, attr: string): string | null {
  const open = new RegExp(`<${NS}${esc(tag)}(\\s[^>]*)?>`).exec(xml)
  if (!open || !open[1]) return null
  const m = new RegExp(`(?:^|\\s)${NS}${esc(attr)}\\s*=\\s*"([^"]*)"`).exec(open[1])
  return m ? xmlDecode(m[1]) : null
}

/** The <wd:ID wd:type="X">value</wd:ID> of the given type inside a reference block. */
export function xmlIdOfType(xml: string, type: string): string | null {
  const re = new RegExp(`<${NS}ID\\s[^>]*${NS}type\\s*=\\s*"${esc(type)}"[^>]*>([\\s\\S]*?)<\\/${NS}ID\\s*>`)
  const m = re.exec(xml)
  return m ? xmlDecode(m[1]) || null : null
}

// ---- mapping ---------------------------------------------------------------------------------

export function mapWorkdayWorker(worker: string, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const ref = xmlBlock(worker, 'Worker_Reference') ?? ''
  const data = xmlBlock(worker, 'Worker_Data') ?? worker
  const workerId = xmlText(data, 'Worker_ID') ?? xmlIdOfType(ref, 'Employee_ID') ?? xmlIdOfType(ref, 'Contingent_Worker_ID') ?? xmlIdOfType(ref, 'WID') ?? `workday-${index + 1}`

  const personal = xmlBlock(data, 'Personal_Data') ?? ''
  const legal = xmlBlock(xmlBlock(personal, 'Name_Data') ?? personal, 'Legal_Name_Data') ?? ''
  const detail = xmlBlock(legal, 'Name_Detail_Data') ?? legal
  const first = xmlText(detail, 'First_Name')
  const last = xmlText(detail, 'Last_Name')
  const formatted = xmlAttr(detail, 'Name_Detail_Data', 'Formatted_Name') ?? xmlAttr(legal, 'Name_Detail_Data', 'Formatted_Name')
  // Formatted_Name keeps the order the person uses (Tan Siew Mei); first + last would invert a
  // Chinese name. Fall back to first + last only when Workday gives no formatted name.
  const name = formatted || [first, last].filter(Boolean).join(' ').trim() || xmlText(worker, 'Descriptor') || ''

  const dobRaw = xmlText(personal, 'Birth_Date')
  const dob = isoDate(dobRaw, today)
  const genderRef = xmlBlock(personal, 'Gender_Reference')
  const genderRaw = genderRef ? (xmlIdOfType(genderRef, 'Gender_Code') ?? xmlAttr(genderRef, 'Gender_Reference', 'Descriptor') ?? xmlText(genderRef, 'Descriptor')) : null
  const gender = normaliseGender(genderRaw)

  const employment = xmlBlock(data, 'Employment_Data') ?? ''
  const statusData = xmlBlock(employment, 'Worker_Status_Data') ?? ''
  const activeRaw = xmlText(statusData, 'Active')
  const terminatedRaw = xmlText(statusData, 'Terminated')
  let status: HrEmployee['status'] = activeRaw != null ? normaliseStatus(activeRaw) : 'unknown'
  if (status === 'unknown' && terminatedRaw != null) status = normaliseStatus(terminatedRaw) === 'active' ? 'inactive' : 'active'
  const terminationDate = isoDate(xmlText(statusData, 'Termination_Date'), today)
  const hireDate = isoDate(xmlText(statusData, 'Hire_Date') ?? xmlText(statusData, 'Original_Hire_Date') ?? xmlText(employment, 'Hire_Date'), today)

  const position = xmlBlock(employment, 'Position_Data') ?? ''
  const category = xmlText(position, 'Position_Title') ?? xmlText(position, 'Business_Title')
    ?? xmlText(xmlBlock(position, 'Job_Profile_Summary_Data') ?? '', 'Job_Profile_Name')
    ?? xmlAttr(position, 'Job_Profile_Reference', 'Descriptor')

  // Work pass: citizenship status, else visa type, else nationality. Workday tenants differ in which they fill.
  const citizenship = xmlAttr(personal, 'Citizenship_Status_Reference', 'Descriptor') ?? xmlText(xmlBlock(personal, 'Citizenship_Status_Reference') ?? '', 'Descriptor')
  const visa = xmlAttr(personal, 'Visa_Type_Reference', 'Descriptor') ?? xmlText(xmlBlock(personal, 'Visa_Type_Reference') ?? '', 'Descriptor')
  const nationality = xmlAttr(personal, 'Nationality_Reference', 'Descriptor') ?? xmlAttr(personal, 'Primary_Nationality_Reference', 'Descriptor')
  const workPass = asText(citizenship) ?? asText(visa) ?? asText(nationality)

  return {
    key: workerId,
    name,
    dob,
    gender,
    category: asText(category),
    workPass,
    hireDate,
    status,
    occupationClass: null,
    issues: rowIssues({ dob, dobRaw, gender, status, statusRaw: terminationDate ? `terminated ${terminationDate}` : activeRaw }),
    // The parsed fields only: the full XML carries national ids and addresses we do not keep.
    raw: {
      workerId, firstName: first, lastName: last, formattedName: formatted, birthDate: dobRaw, gender: genderRaw,
      active: activeRaw, terminated: terminatedRaw, terminationDate, hireDate, positionTitle: category,
      citizenshipStatus: citizenship, visaType: visa, nationality,
    },
  }
}

/** Page and Total_Pages from wd:Response_Results. */
export function pagingOf(xml: string): { page: number; totalPages: number; totalResults: number | null } {
  const results = xmlBlock(xml, 'Response_Results') ?? xml
  const page = Number(xmlText(results, 'Page') ?? 1) || 1
  const totalPages = Number(xmlText(results, 'Total_Pages') ?? 1) || 1
  const total = xmlText(results, 'Total_Results')
  return { page, totalPages, totalResults: total != null ? Number(total) : null }
}

function faultOf(xml: string): string | null {
  return xmlText(xml, 'faultstring') ?? xmlText(xml, 'Reason') ?? xmlText(xml, 'Text')
}

const REFUSED = 'Workday refused the integration user: check the user, password and the Worker Data and Date of Birth domains'

/** Fetch every worker in the tenant. The password never leaves this function except in the request body. */
export async function fetchWorkday(creds: WorkdayCredentials, fetchImpl: FetchLike = fetch as unknown as FetchLike, today: CalendarDate = todaySGT()): Promise<HrRead> {
  if (!creds?.username?.trim() || !creds?.password) throw new HrConnectorError('Enter the integration user and password.', 400)
  const endpoint = workdayEndpoint(creds.tenantHost, creds.tenant)

  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  let page = 1, totalPages = 1, fetched = 0

  do {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'Get_Workers' },
        body: getWorkersEnvelope(creds, page),
      })
    } catch {
      throw new HrConnectorError(`Workday at ${endpoint.replace(/^https:\/\//, '').split('/')[0]} could not be reached. Check the tenant host.`)
    }
    const xml = await res.text()
    if (res.status === 401 || res.status === 403) throw new HrConnectorError(REFUSED, res.status)
    if (!res.ok || /<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) {
      const fault = faultOf(xml) ?? ''
      if (/invalid username or password|authentication|not authorized|unauthorized|does not have access|permission/i.test(fault)) throw new HrConnectorError(REFUSED, res.status || 403)
      throw new HrConnectorError(fault ? `Workday returned an error: ${fault.slice(0, 200)}` : `Workday returned ${res.status}`, res.status)
    }

    fetched += 1
    const workers = xmlBlocks(xmlBlock(xml, 'Response_Data') ?? xml, 'Worker')
    for (const w of workers) {
      const e = mapWorkdayWorker(w, employees.length, today)
      if (!e.name) { skipped.push({ key: e.key, reason: 'No legal name on the Workday record' }); continue }
      if (seen.has(e.key)) continue
      seen.add(e.key)
      employees.push(e)
    }
    const paging = pagingOf(xml)
    totalPages = paging.totalPages
    page = Math.max(page, paging.page) + 1
  } while (page <= totalPages && fetched < MAX_PAGES)

  return {
    source: 'workday',
    employees,
    dependants: [],
    skipped,
    meta: {
      tenantHost: endpoint.replace(/^https:\/\//, '').split('/')[0],
      tenant: creds.tenant.trim(),
      username: creds.username.trim(),
      service: `${WORKDAY_SERVICE}/${WORKDAY_VERSION}`,
      pages: fetched,
      count: employees.length,
      fetchedAt: new Date().toISOString(),
    },
  }
}
