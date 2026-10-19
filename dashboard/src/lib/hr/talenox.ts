/**
 * HR Connect: the employee list straight from Talenox.
 *
 * HR pastes an API token from Talenox (Profile → API tokens). We call GET /api/v2/employees once,
 * follow pagination when the response says there is more, map the fields we price on, and drop
 * everything that identifies, pays or contacts a person. The token is used for these requests and
 * nothing else: it is not stored, not logged, not placed in meta.
 *
 * Talenox's field names have shifted between versions, so every field is read from a list of
 * candidate keys. A key we do not know is kept in `raw` (minus sensitive keys) for audit.
 */
import type { HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isPastOrToday, isoDate, normaliseGender, normaliseStatus, pick, rowIssues, stripSensitive } from './connectors'
import { todaySGT, type CalendarDate } from '../dates/dob'

export const TALENOX_EMPLOYEES_URL = 'https://api.talenox.com/api/v2/employees'
const MAX_PAGES = 50

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)

/** The array of employee records in a Talenox page, wherever it was put. */
function employeesOf(body: unknown): Rec[] {
  if (Array.isArray(body)) return body.filter(isRec)
  if (!isRec(body)) return []
  for (const k of ['employees', 'data', 'results', 'items', 'records']) {
    const v = body[k]
    if (Array.isArray(v)) return v.filter(isRec)
    if (isRec(v) && Array.isArray(v.employees)) return (v.employees as unknown[]).filter(isRec)
  }
  return []
}

/** The URL of the next page, or null. Accepts a `next` link, or page / total_pages counters. */
function nextPageUrl(body: unknown, current: string): string | null {
  if (!isRec(body)) return null
  const meta = isRec(body.meta) ? body.meta : isRec(body.pagination) ? body.pagination : body
  const next = meta.next ?? meta.next_page_url ?? meta.next_url
  if (typeof next === 'string' && next) return next.startsWith('http') ? next : new URL(next, TALENOX_EMPLOYEES_URL).toString()
  const page = Number(meta.page ?? meta.current_page)
  const total = Number(meta.total_pages ?? meta.pages ?? meta.last_page)
  if (Number.isFinite(page) && Number.isFinite(total) && page >= 1 && page < total) {
    const u = new URL(current)
    u.searchParams.set('page', String(page + 1))
    return u.toString()
  }
  return null
}

/** Job title from the places Talenox has kept it: a flat key or the current job record. */
function categoryOf(r: Rec): string | null {
  const flat = asText(pick(r, 'job_title', 'designation', 'position', 'title'))
  if (flat) return flat
  const job = pick(r, 'current_job', 'job')
  if (isRec(job)) { const t = asText(pick(job, 'title', 'job_title', 'designation')); if (t) return t }
  const jobs = r.jobs
  if (Array.isArray(jobs) && jobs.length) {
    const cur = jobs.find(j => isRec(j) && (j.current === true || j.end_date == null)) ?? jobs[jobs.length - 1]
    if (isRec(cur)) { const t = asText(pick(cur, 'title', 'job_title', 'designation')); if (t) return t }
  }
  return asText(pick(r, 'department'))
}

export function mapTalenoxEmployee(r: Rec, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const id = asText(pick(r, 'id', 'employee_id', 'employee_no', 'uuid')) ?? `talenox-${index + 1}`
  const name = asText(pick(r, 'name', 'full_name', 'display_name'))
    ?? asText(`${asText(pick(r, 'first_name', 'firstname', 'given_name')) ?? ''} ${asText(pick(r, 'last_name', 'lastname', 'surname', 'family_name')) ?? ''}`.trim())
    ?? ''
  const dobRaw = pick(r, 'birthdate', 'date_of_birth', 'dob', 'birth_date', 'birthday')
  const dob = isoDate(dobRaw, today)
  const gender = normaliseGender(pick(r, 'gender', 'sex'))
  const statusRaw = pick(r, 'status', 'employment_status', 'employee_status')
  const resign = isoDate(pick(r, 'resign_date', 'resignation_date', 'termination_date', 'last_day'), today)
  let status: HrEmployee['status'] = statusRaw != null ? normaliseStatus(statusRaw) : 'active'
  if (resign && isPastOrToday(resign, today)) status = 'inactive'
  else if (statusRaw == null && resign) status = 'active'  // future-dated resignation: still on cover today

  return {
    key: id,
    name,
    dob,
    gender,
    category: categoryOf(r),
    workPass: asText(pick(r, 'immigration_status', 'nationality_status', 'pass_type', 'citizenship', 'work_pass', 'residency_status', 'nationality')),
    hireDate: isoDate(pick(r, 'hired_date', 'hire_date', 'join_date', 'start_date', 'joined_date'), today),
    status,
    occupationClass: null,
    issues: rowIssues({ dob, dobRaw, gender, status, statusRaw: resign && status === 'inactive' ? `resigned ${resign}` : statusRaw }),
    raw: stripSensitive(r),
  }
}

/**
 * Fetch every employee for the token. Throws HrConnectorError: 401 → the token was rejected;
 * any other non-2xx → the status; unreachable host or non-JSON body → a plain message.
 */
export async function fetchTalenox(token: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, today: CalendarDate = todaySGT()): Promise<HrRead> {
  const t = String(token ?? '').trim()
  if (!t) throw new HrConnectorError('Paste the Talenox API token first.', 400)

  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  let url: string | null = TALENOX_EMPLOYEES_URL
  let pages = 0

  while (url && pages < MAX_PAGES) {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } })
    } catch {
      throw new HrConnectorError('Talenox could not be reached. Try again in a minute.')
    }
    if (res.status === 401) throw new HrConnectorError('Talenox rejected the token', 401)
    if (res.status === 403) throw new HrConnectorError('Talenox refused this token access to employees. Check the token has the Employees permission.', 403)
    if (!res.ok) throw new HrConnectorError(`Talenox returned ${res.status}`, res.status)

    let body: unknown
    try { body = JSON.parse(await res.text()) }
    catch { throw new HrConnectorError('Talenox returned a response that was not JSON.', res.status) }

    pages += 1
    const records = employeesOf(body)
    if (pages === 1 && !records.length && !Array.isArray(body) && !(isRec(body) && Object.values(body).some(Array.isArray))) {
      throw new HrConnectorError('Talenox returned no employee list for this token.', res.status)
    }
    for (let i = 0; i < records.length; i++) {
      const e = mapTalenoxEmployee(records[i], employees.length + i, today)
      if (!e.name) { skipped.push({ key: e.key, reason: 'No name on the Talenox record' }); continue }
      if (seen.has(e.key)) continue
      seen.add(e.key)
      employees.push(e)
    }
    const next = nextPageUrl(body, url)
    url = next && next !== url ? next : null
  }

  return {
    source: 'talenox',
    employees,
    dependants: [],
    skipped,
    meta: { endpoint: TALENOX_EMPLOYEES_URL, pages, count: employees.length, fetchedAt: new Date().toISOString() },
  }
}
