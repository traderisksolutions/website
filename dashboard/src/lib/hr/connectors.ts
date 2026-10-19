/**
 * HR Connect: what the three readers share.
 *
 * A spreadsheet, a Talenox export and a Workday response spell gender, status and dates in their
 * own way. Everything here turns those spellings into the two or three values HrEmployee allows,
 * and never guesses: a value that is not recognised comes back null or 'unknown', and the row
 * carries an issue the HR page shows.
 *
 * Pure. No network, no database, no logging.
 */
import { parseBirthDate, fromDate, todaySGT, type CalendarDate } from '../dates/dob'

/** A connector could not complete: wrong token, refused user, vendor error. The message is safe to show HR. */
export class HrConnectorError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'HrConnectorError'
    this.status = status
  }
}

/** M, F, male, female, man, woman, 男, 女, Workday's Gender_Code "Male"/"Female". Anything else is null. */
export function normaliseGender(raw: unknown): 'M' | 'F' | null {
  const t = String(raw ?? '').trim().toLowerCase()
  if (!t) return null
  if (t === 'm' || t === 'male' || t === 'man' || t === '男' || t === 'lelaki' || t === 'laki-laki') return 'M'
  if (t === 'f' || t === 'female' || t === 'woman' || t === '女' || t === 'perempuan' || t === 'wanita') return 'F'
  return null
}

/**
 * active / current / employed / confirmed / probation → active;
 * inactive / terminated / resigned / left / ceased / ended / retired / deceased → inactive;
 * Workday's wd:Active 1/0 and true/false. Anything else is 'unknown'.
 */
export function normaliseStatus(raw: unknown): 'active' | 'inactive' | 'unknown' {
  if (raw === true || raw === 1) return 'active'
  if (raw === false || raw === 0) return 'inactive'
  const t = String(raw ?? '').trim().toLowerCase()
  if (!t) return 'unknown'
  if (t === '1' || t === 'true' || t === 'y' || t === 'yes') return 'active'
  if (t === '0' || t === 'false' || t === 'n' || t === 'no') return 'inactive'
  if (/^(in-?active|terminat|resign|left|ceas|end|retir|deceas|dismiss|exit|former|separat|off-?boarded)/.test(t)) return 'inactive'
  if (/^(active|current|employed|confirmed|probation|permanent|contract|full[- ]?time|part[- ]?time|on ?leave|hired)/.test(t)) return 'active'
  return 'unknown'
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: CalendarDate) => `${d.y}-${pad(d.m)}-${pad(d.d)}`

/** An Excel serial (days from 1899-12-30) in the range a birth or hire date can occupy. */
function fromSerial(n: number): CalendarDate | null {
  if (!Number.isFinite(n) || n < 1 || n > 80_000) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
  const y = d.getUTCFullYear()
  return y >= 1900 && y <= 2200 ? { y, m: d.getUTCMonth() + 1, d: d.getUTCDate() } : null
}

/**
 * YYYY-MM-DD from whatever a reader hands over: a Date (SheetJS with cellDates), an Excel serial
 * number, an ISO date with Workday's offset suffix (1985-03-14-08:00, 1985-03-14Z), or text read
 * day-first by parseBirthDate (24/12/1971, 5-Jul-87, 05 July 1987). Null when it cannot be read
 * without guessing. Never month-first.
 */
export function isoDate(raw: unknown, today: CalendarDate = todaySGT()): string | null {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : fmt(fromDate(raw))
  if (typeof raw === 'number') { const d = fromSerial(raw); return d ? fmt(d) : null }
  let s = String(raw).trim()
  if (!s) return null
  // Workday: 1985-03-14-08:00 or 1985-03-14+08:00 or 1985-03-14Z
  s = s.replace(/^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:\d{2})$/, '$1')
  if (/^\d{5}(\.0+)?$/.test(s)) { const d = fromSerial(Number(s)); return d ? fmt(d) : null }
  const d = parseBirthDate(s, today)
  return d ? fmt(d) : null
}

/** True when an ISO date is on or before today. Used for a resign or termination date. */
export function isPastOrToday(iso: string | null, today: CalendarDate = todaySGT()): boolean {
  if (!iso) return false
  return iso <= fmt(today)
}

/**
 * Fields HR Connect never keeps: identity numbers, pay, bank, contact details. Matched on the key
 * with underscores, dots and dashes read as spaces, so `nric_number`, `Bank Account` and
 * `salary.basic` all match and `Basic` or `Final` do not.
 */
const SENSITIVE_KEY = /\b(nric|fin|passport|ic|identity|identification|national id|salary|salaries|pay|wage|wages|bank|iban|swift|address|addr|postal|phone|tel|mobile|hp|email|e mail|mail)\b/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(String(key).replace(/[_.\-/()]+/g, ' ').replace(/\s+/g, ' ').trim())
}

/** A copy of a record without any sensitive key, one level deep. Nested objects are kept as-is unless their key is sensitive. */
export function stripSensitive(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (isSensitiveKey(k)) continue
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) out[k] = stripSensitive(v as Record<string, unknown>)
    else out[k] = v
  }
  return out
}

/** The issues every reader attaches to a row, worded once so the HR page reads the same for all three sources. */
export function rowIssues(input: {
  dob: string | null; dobRaw?: unknown
  gender: 'M' | 'F' | null
  status: 'active' | 'inactive' | 'unknown'; statusRaw?: unknown
}): string[] {
  const issues: string[] = []
  const rawDob = input.dobRaw == null ? '' : String(input.dobRaw instanceof Date ? input.dobRaw.toISOString() : input.dobRaw).trim()
  if (!input.dob) issues.push(rawDob ? `Date of birth unreadable: ${rawDob}` : 'Date of birth missing')
  if (!input.gender) issues.push('Gender missing')
  if (input.status === 'inactive') {
    const rawStatus = input.statusRaw == null ? '' : String(input.statusRaw).trim()
    issues.push(rawStatus && !/^(0|false|inactive)$/i.test(rawStatus) ? `Inactive: ${rawStatus}` : 'Inactive')
  }
  return issues
}

/** The first non-empty value among several candidate keys of a vendor record, case-insensitive on the key. */
export function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  const lower = new Map(Object.keys(record).map(k => [k.toLowerCase(), k]))
  for (const k of keys) {
    const real = lower.get(k.toLowerCase())
    if (real == null) continue
    const v = record[real]
    if (v != null && v !== '') return v
  }
  return undefined
}

export const asText = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}
