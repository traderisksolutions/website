/**
 * HR Connect: the employee list from BambooHR.
 *
 * HR gives the company's BambooHR subdomain (the part before .bamboohr.com) and an API key
 * created under their own login (profile menu → API Keys); the key reads what that login can see.
 * BambooHR's API takes the key as the Basic-auth user with any password. Two reads:
 *
 *   POST /v1/reports/custom?format=JSON   the fields we price on, every employee
 *   GET  /v1/employeedependents           spouse and children, when the login has
 *                                         benefits-administration access; skipped otherwise
 *
 * The key is used for these requests only: not stored, not logged, not placed in meta.
 * BambooHR's developer terms are written for apps the customer installs; a customer typing their
 * own key into this page is the customer's choice, and the page says the key can be deleted after.
 */
import type { HrDependant, HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isPastOrToday, isoDate, normaliseGender, normaliseStatus, rowIssues, stripSensitive } from './connectors'
import { basicAuth, deepPick, defaultFetch, dependantRelationship, isRec, vendorJson, type FetchLike, type Rec } from './vendor'
import { todaySGT, type CalendarDate } from '../dates/dob'

export const BAMBOO_FIELDS = ['id', 'firstName', 'lastName', 'displayName', 'dateOfBirth', 'gender', 'status', 'employmentHistoryStatus', 'hireDate', 'terminationDate', 'jobTitle', 'department', 'location']

/** "acme", "acme.bamboohr.com" or "https://acme.bamboohr.com/home" → "acme". */
export function bambooSubdomain(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.bamboohr\.com$/, '')
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) throw new HrConnectorError('Enter the BambooHR company name as it appears before .bamboohr.com', 400)
  return s
}

export const bambooBase = (sub: string): string => `https://api.bamboohr.com/api/gateway.php/${sub}/v1`

export function mapBambooEmployee(r: Rec, index: number, today: CalendarDate = todaySGT()): HrEmployee {
  const id = asText(deepPick(r, 'id', 'employeeId')) ?? `bamboohr-${index + 1}`
  const name = asText(`${asText(deepPick(r, 'firstName')) ?? ''} ${asText(deepPick(r, 'lastName')) ?? ''}`.trim()) ?? asText(deepPick(r, 'displayName')) ?? ''
  const dobRaw = deepPick(r, 'dateOfBirth', 'birthDate')
  const dob = isoDate(dobRaw === '0000-00-00' ? null : dobRaw, today)
  const gender = normaliseGender(deepPick(r, 'gender'))
  const end = isoDate(deepPick(r, 'terminationDate') === '0000-00-00' ? null : deepPick(r, 'terminationDate'), today)
  const statusRaw = deepPick(r, 'status', 'employmentHistoryStatus')
  let status: HrEmployee['status'] = statusRaw != null ? normaliseStatus(statusRaw) : 'active'
  if (end && isPastOrToday(end, today)) status = 'inactive'
  const issues = rowIssues({ dob, dobRaw, gender, status, statusRaw })
  return {
    key: id, name, dob, gender,
    category: asText(deepPick(r, 'jobTitle', 'department')),
    workPass: null,
    hireDate: isoDate(deepPick(r, 'hireDate') === '0000-00-00' ? null : deepPick(r, 'hireDate'), today),
    status, occupationClass: null,
    issues: [...new Set(issues)],
    raw: stripSensitive(r),
  }
}

export function mapBambooDependants(body: unknown, employeeKeys: Set<string>, today: CalendarDate = todaySGT()): HrDependant[] {
  const list = isRec(body) ? (Object.values(body).find(Array.isArray) as unknown[] | undefined) ?? [] : Array.isArray(body) ? body : []
  const out: HrDependant[] = []
  list.filter(isRec).forEach((d, i) => {
    const relationship = dependantRelationship(deepPick(d, 'relationship'))
    const employeeKey = asText(deepPick(d, 'employeeId'))
    if (!relationship || !employeeKey || !employeeKeys.has(employeeKey)) return
    const name = asText(`${asText(deepPick(d, 'firstName')) ?? ''} ${asText(deepPick(d, 'lastName')) ?? ''}`.trim()) ?? ''
    const dobRaw = deepPick(d, 'dateOfBirth', 'birthDate')
    const dob = isoDate(dobRaw === '0000-00-00' ? null : dobRaw, today)
    const gender = normaliseGender(deepPick(d, 'gender'))
    const issues: string[] = []
    if (!dob) issues.push('Date of birth missing')
    out.push({ key: asText(deepPick(d, 'id')) ?? `bamboohr-dep-${i + 1}`, employeeKey, name, relationship, dob, gender, issues })
  })
  return out
}

export async function fetchBambooHR(company: string, apiKey: string, fetchImpl: FetchLike = defaultFetch, today: CalendarDate = todaySGT()): Promise<HrRead> {
  const sub = bambooSubdomain(company)
  const key = String(apiKey ?? '').trim()
  if (!key) throw new HrConnectorError('Paste the BambooHR API key first.', 400)
  const headers = { Authorization: basicAuth(key, 'x'), Accept: 'application/json', 'Content-Type': 'application/json' }
  const hints = { unauthorized: 'BambooHR rejected the API key', forbidden: 'This BambooHR login cannot run reports. Use a key created by an administrator.' }
  const report = await vendorJson('BambooHR', `${bambooBase(sub)}/reports/custom?format=JSON&onlyCurrent=true`, { method: 'POST', headers, body: JSON.stringify({ title: 'TRS employee list', fields: BAMBOO_FIELDS }) }, fetchImpl, hints)
  const records = (isRec(report) && Array.isArray(report.employees) ? report.employees : []).filter(isRec)
  const employees: HrEmployee[] = []
  const skipped: HrRead['skipped'] = []
  const seen = new Set<string>()
  records.forEach((rec, i) => {
    const e = mapBambooEmployee(rec, i, today)
    if (!e.name) { skipped.push({ key: e.key, reason: 'No name on the BambooHR record' }); return }
    if (seen.has(e.key)) return
    seen.add(e.key); employees.push(e)
  })

  // Dependants need benefits-administration access; without it the list still goes through.
  let dependants: HrDependant[] = []
  let dependantsRead = false
  try {
    const body = await vendorJson('BambooHR', `${bambooBase(sub)}/employeedependents`, { method: 'GET', headers }, fetchImpl, hints)
    dependants = mapBambooDependants(body, seen, today)
    dependantsRead = true
  } catch (e) {
    if (!(e instanceof HrConnectorError)) throw e
  }
  return {
    source: 'bamboohr', employees, dependants, skipped,
    meta: { endpoint: `${bambooBase(sub)}/reports/custom`, company: sub, count: employees.length, dependantsRead, fetchedAt: new Date().toISOString() },
  }
}
