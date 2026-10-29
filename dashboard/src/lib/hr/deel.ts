/**
 * HR Connect: the employee list from Deel.
 *
 * A Deel admin creates an API token (Apps & Integrations → Developer → Access tokens) with the
 * people:read scope and gives it to HR. GET /rest/v2/people, 100 at a time, Bearer token. Used for
 * these requests only: not stored, not logged, not placed in meta.
 *
 * Deel lists everyone the organisation pays: employees, EOR hires and contractors, in every
 * country. Contractors and people outside Singapore are kept but flagged, so HR removes them on
 * review if they are not to be insured. Deel keeps no dependants in the people record.
 */
import type { HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isPastOrToday, isoDate, normaliseGender, rowIssues, stripSensitive } from './connectors'
import { deepPick, defaultFetch, isRec, vendorJson, type FetchLike, type Rec } from './vendor'
import { todaySGT, type CalendarDate } from '../dates/dob'

export const DEEL_API = 'https://api.letsdeel.com/rest/v2'
const PAGE = 100
const MAX_PAGES = 30

const INACTIVE = /terminat|offboard|inactive|cancel|ended|archived/i

export function mapDeelPerson(r: Rec, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const id = asText(deepPick(r, 'id', 'hris_profile_id')) ?? `deel-${index + 1}`
  const name = asText(`${asText(deepPick(r, 'first_name')) ?? ''} ${asText(deepPick(r, 'last_name')) ?? ''}`.trim()) ?? asText(deepPick(r, 'full_name', 'preferred_name', 'name')) ?? ''
  const dobRaw = deepPick(r, 'birth_date', 'date_of_birth', 'dob')
  const dob = isoDate(dobRaw, today)
  const gender = normaliseGender(deepPick(r, 'gender', 'sex'))
  const statusRaw = deepPick(r, 'hiring_status', 'employment_status', 'status')
  const end = isoDate(deepPick(r, 'termination_date', 'end_date'), today)
  let status: HrEmployee['status'] = statusRaw == null ? 'active' : INACTIVE.test(String(statusRaw)) ? 'inactive' : 'active'
  if (end && isPastOrToday(end, today)) status = 'inactive'
  const issues = rowIssues({ dob, dobRaw, gender, status, statusRaw })
  const type = String(deepPick(r, 'hiring_type', 'employment_type', 'contract_type') ?? '')
  if (/contractor/i.test(type)) issues.push('Contractor in Deel, not an employee')
  const country = asText(deepPick(r, 'country', 'work_country', 'country_code'))
  if (country && !/^(SG|SGP|Singapore)$/i.test(country)) issues.push(`Works in ${country}`)
  const dept = deepPick(r, 'department')
  return {
    key: id, name, dob, gender,
    category: asText(deepPick(r, 'job_title', 'title')) ?? (isRec(dept) ? asText(dept.name) : asText(dept)),
    workPass: null,
    hireDate: isoDate(deepPick(r, 'start_date', 'hiring_date'), today),
    status, occupationClass: null,
    issues: [...new Set(issues)],
    raw: stripSensitive(r),
  }
}

export async function fetchDeel(token: string, fetchImpl: FetchLike = defaultFetch, today: CalendarDate = todaySGT()): Promise<HrRead> {
  const tok = String(token ?? '').trim()
  if (!tok) throw new HrConnectorError('Paste the Deel API token first.', 400)
  const headers = { Authorization: `Bearer ${tok}`, Accept: 'application/json' }
  const records: Rec[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await vendorJson('Deel', `${DEEL_API}/people?limit=${PAGE}&offset=${page * PAGE}`, { method: 'GET', headers }, fetchImpl, {
      unauthorized: 'Deel rejected the API token',
      forbidden: 'The Deel token cannot read people. Create it with the people:read scope.',
    })
    const data = (isRec(body) && Array.isArray(body.data) ? body.data : []).filter(isRec)
    records.push(...data)
    const total = isRec(body) && isRec(body.page) ? Number(body.page.total_rows) : NaN
    if (data.length < PAGE || (Number.isFinite(total) && records.length >= total)) break
  }
  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  records.forEach((rec, i) => {
    const e = mapDeelPerson(rec, i, today)
    if (!e.name) { skipped.push({ key: e.key, reason: 'No name on the Deel record' }); return }
    if (seen.has(e.key)) return
    seen.add(e.key); employees.push(e)
  })
  return { source: 'deel', employees, dependants: [], skipped, meta: { endpoint: `${DEEL_API}/people`, count: employees.length, fetchedAt: new Date().toISOString() } }
}
