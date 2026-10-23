/**
 * HR Connect: the employee list straight from SimplePay (Singapore, Hong Kong, Ireland, South Africa).
 *
 * HR creates an API user in SimplePay (Settings → Users → API Users, admin or owner only) and pastes
 * its key. We list the companies the key can see; with more than one, HR picks the company. Then
 * GET /v1/clients/:id/employees once, map the fields we price on, drop everything that identifies,
 * pays or contacts a person. The key is used for these requests and nothing else: not stored, not
 * logged, not placed in meta.
 *
 * SimplePay keeps no dependants, so HR adds spouse and children on the review page. Its documented
 * employee record has no gender; it is read when present. Limit: 1,000 requests an hour per key.
 */
import type { HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isPastOrToday, isoDate, normaliseGender, normaliseStatus, pick, rowIssues, stripSensitive } from './connectors'
import { todaySGT, type CalendarDate } from '../dates/dob'

export const SIMPLEPAY_API = 'https://api.payroll.simplepay.cloud/v1'

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)

export type SimplePayCompany = { id: string; name: string }

/** SimplePay wraps each array item in its type: [{ client: {...} }], [{ employee: {...} }]. */
function unwrap(body: unknown, key: string): Rec[] {
  const list = Array.isArray(body) ? body : isRec(body) && Array.isArray(body[`${key}s`]) ? body[`${key}s`] as unknown[] : []
  return list.map(x => (isRec(x) && isRec(x[key]) ? x[key] : x)).filter(isRec)
}

async function get(path: string, key: string, fetchImpl: FetchLike): Promise<unknown> {
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(`${SIMPLEPAY_API}${path}`, { method: 'GET', headers: { Authorization: key, Accept: 'application/json' } })
  } catch {
    throw new HrConnectorError('SimplePay could not be reached. Try again in a minute.')
  }
  if (res.status === 401 || res.status === 403) throw new HrConnectorError('SimplePay rejected the API key', 401)
  if (res.status === 429) throw new HrConnectorError('SimplePay says this key has made too many requests this hour. Try again after the hour.', 429)
  if (res.status === 503) throw new HrConnectorError('SimplePay is down for maintenance. Try again in 10 minutes.', 503)
  if (!res.ok) throw new HrConnectorError(`SimplePay returned ${res.status}`, res.status)
  try { return JSON.parse(await res.text()) }
  catch { throw new HrConnectorError('SimplePay returned a response that was not JSON.', res.status) }
}

/** The companies this key can read. */
export async function listSimplePayCompanies(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<SimplePayCompany[]> {
  const key = String(apiKey ?? '').trim()
  if (!key) throw new HrConnectorError('Paste the SimplePay API key first.', 400)
  return unwrap(await get('/clients', key, fetchImpl), 'client')
    .map(c => ({ id: asText(pick(c, 'id')) ?? '', name: asText(pick(c, 'name', 'company_name')) ?? '' }))
    .filter(c => c.id)
}

export function mapSimplePayEmployee(r: Rec, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const id = asText(pick(r, 'id', 'number', 'employee_number')) ?? `simplepay-${index + 1}`
  const name = asText(`${asText(pick(r, 'first_name')) ?? ''} ${asText(pick(r, 'last_name')) ?? ''}`.trim()) ?? asText(pick(r, 'name', 'full_name')) ?? ''
  const dobRaw = pick(r, 'birthdate', 'date_of_birth', 'dob')
  const dob = isoDate(dobRaw, today)
  const gender = normaliseGender(pick(r, 'gender', 'sex'))
  const end = isoDate(pick(r, 'termination_date', 'end_date', 'service_end_date'), today)
  const statusRaw = pick(r, 'status', 'employment_status')
  let status: HrEmployee['status'] = statusRaw != null ? normaliseStatus(statusRaw) : 'active'
  if (end && isPastOrToday(end, today)) status = 'inactive'
  const issues = rowIssues({ dob, dobRaw, gender, status, statusRaw: end && status === 'inactive' ? `service ended ${end}` : statusRaw })
    .filter(i => !/gender/i.test(i) || r.gender !== undefined)  // SimplePay does not keep gender; not a problem with the row
  return {
    key: id,
    name,
    dob,
    gender,
    category: asText(pick(r, 'job_title', 'position', 'designation')),
    workPass: asText(pick(r, 'residency_status', 'immigration_status', 'work_pass', 'nationality')),
    hireDate: isoDate(pick(r, 'appointment_date', 'hire_date', 'start_date'), today),
    status,
    occupationClass: null,
    issues,
    raw: stripSensitive(r),
  }
}

/**
 * Every employee of one company. Without companyId: the key's only company, or a
 * HrConnectorError 409 carrying the list when there are several (the page asks HR to pick).
 */
export async function fetchSimplePay(apiKey: string, companyId?: string | null, fetchImpl: FetchLike = fetch as unknown as FetchLike, today: CalendarDate = todaySGT()): Promise<HrRead & { company: SimplePayCompany }> {
  const key = String(apiKey ?? '').trim()
  const companies = await listSimplePayCompanies(key, fetchImpl)
  if (!companies.length) throw new HrConnectorError('This SimplePay key has access to no company. Give the API user access to the company in SimplePay.', 403)
  let company = companyId ? companies.find(c => c.id === String(companyId)) : companies.length === 1 ? companies[0] : undefined
  if (!company) {
    if (companyId) throw new HrConnectorError('That company is not available to this key.', 404)
    throw new SimplePayChooseCompany(companies)
  }

  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  const records = unwrap(await get(`/clients/${encodeURIComponent(company.id)}/employees`, key, fetchImpl), 'employee')
  records.forEach((rec, i) => {
    const e = mapSimplePayEmployee(rec, i, today)
    if (!e.name) { skipped.push({ key: e.key, reason: 'No name on the SimplePay record' }); return }
    if (seen.has(e.key)) return
    seen.add(e.key)
    employees.push(e)
  })
  return {
    source: 'simplepay',
    company,
    employees,
    dependants: [],
    skipped,
    meta: { endpoint: `${SIMPLEPAY_API}/clients/:id/employees`, company: company.name, companyId: company.id, count: employees.length, fetchedAt: new Date().toISOString() },
  }
}

/** The key can see several companies; the page shows them and HR picks one. */
export class SimplePayChooseCompany extends HrConnectorError {
  constructor(readonly companies: SimplePayCompany[]) {
    super('Choose the company to read.', 409)
  }
}
