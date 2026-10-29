/**
 * HR Connect: the employee list from HiBob (Bob).
 *
 * The client's Bob admin creates a service user (Settings → Integrations → Service users), puts it
 * in a permission group with View on the people's fields we read, and gives HR its ID and token.
 * One POST /v1/people/search with Basic auth (ID as user, token as password) returns every active
 * employee. The token is used for this request only: not stored, not logged, not placed in meta.
 *
 * Bob omits a field the service user cannot see instead of failing, so a missing date of birth
 * usually means the permission group lacks the Personal category; the page says so.
 * Bob keeps no dependants in its standard fields; HR adds spouse and children on review.
 */
import type { HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isPastOrToday, isoDate, normaliseGender, normaliseStatus, rowIssues, stripSensitive } from './connectors'
import { basicAuth, deepPick, defaultFetch, isRec, vendorJson, type FetchLike, type Rec } from './vendor'
import { todaySGT, type CalendarDate } from '../dates/dob'

export const HIBOB_API = 'https://api.hibob.com/v1'
export const HIBOB_FIELDS = [
  'root.id', 'root.firstName', 'root.surname', 'root.displayName',
  'personal.birthDate', 'personal.gender', 'about.birthDate',
  'work.startDate', 'work.title', 'work.department', 'work.site',
  'internal.status', 'internal.terminationDate',
]

export function mapHiBobEmployee(r: Rec, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const id = asText(deepPick(r, 'id')) ?? `hibob-${index + 1}`
  const first = asText(deepPick(r, 'firstName')) ?? ''
  const last = asText(deepPick(r, 'surname', 'lastName')) ?? ''
  const name = asText(`${first} ${last}`.trim()) ?? asText(deepPick(r, 'displayName', 'fullName')) ?? ''
  const dobRaw = deepPick(r, 'birthDate', 'dateOfBirth')
  const dob = isoDate(dobRaw, today)
  const gender = normaliseGender(deepPick(r, 'gender', 'sex'))
  const end = isoDate(deepPick(r, 'terminationDate'), today)
  const statusRaw = deepPick(r, 'status', 'lifecycleStatus')
  let status: HrEmployee['status'] = statusRaw != null ? normaliseStatus(statusRaw) : 'active'
  if (end && isPastOrToday(end, today)) status = 'inactive'
  let issues = rowIssues({ dob, dobRaw, gender, status, statusRaw })
  if (dobRaw == null) issues = [...issues.filter(i => !/date of birth/i.test(i)), 'No date of birth: give the service user View on the Personal category in Bob']
  return {
    key: id, name, dob, gender,
    category: asText(deepPick(r, 'title', 'department')),
    workPass: null,
    hireDate: isoDate(deepPick(r, 'startDate', 'originalStartDate'), today),
    status, occupationClass: null,
    issues: [...new Set(issues)],
    raw: stripSensitive(r),
  }
}

export async function fetchHiBob(serviceUserId: string, token: string, fetchImpl: FetchLike = defaultFetch, today: CalendarDate = todaySGT()): Promise<HrRead> {
  const id = String(serviceUserId ?? '').trim(), tok = String(token ?? '').trim()
  if (!id || !tok) throw new HrConnectorError('Enter the service user ID and token.', 400)
  const init = (fields: string[] | null) => ({
    method: 'POST',
    headers: { Authorization: basicAuth(id, tok), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields ? { fields, showInactive: false } : { showInactive: false }),
  })
  const hints = { unauthorized: 'Bob rejected the service user ID or token', forbidden: 'The service user has no access to people. Add it to a permission group with View on people’s fields.' }
  let body: unknown
  try {
    body = await vendorJson('HiBob', `${HIBOB_API}/people/search`, init(HIBOB_FIELDS), fetchImpl, hints)
  } catch (e) {
    // A field this Bob account does not have makes the search fail; ask for Bob's default set instead.
    if (!(e instanceof HrConnectorError) || e.status !== 400) throw e
    body = await vendorJson('HiBob', `${HIBOB_API}/people/search`, init(null), fetchImpl, hints)
  }
  const records = (isRec(body) && Array.isArray(body.employees) ? body.employees : Array.isArray(body) ? body : []).filter(isRec)
  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  records.forEach((rec, i) => {
    const e = mapHiBobEmployee(rec, i, today)
    if (!e.name) { skipped.push({ key: e.key, reason: 'No name on the Bob record' }); return }
    if (seen.has(e.key)) return
    seen.add(e.key); employees.push(e)
  })
  return { source: 'hibob', employees, dependants: [], skipped, meta: { endpoint: `${HIBOB_API}/people/search`, count: employees.length, fetchedAt: new Date().toISOString() } }
}
