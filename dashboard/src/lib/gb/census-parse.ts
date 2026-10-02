/**
 * A census as clients actually send it, read by rule.
 *
 * The minimum is a name and a date of birth per person. Everything else is optional and found by
 * its header, whatever the client called it: "Employee Name", "Date of birth", "Staff/dependant",
 * "Category of staff", "Local or Foreign workers (WP/SP)". The header row need not be first —
 * client templates put a company name and a blank row above it.
 *
 * Dates of birth are read day first (parseBirthDate), so "5-Jul-87" is 5 July 1987 and 05/07/1987
 * is never 7 May. A date that cannot be read is listed, never guessed.
 *
 * No model. Pure; the route hands it text.
 */
import { parseBirthDate, ageLastBirthday, todaySGT, type CalendarDate } from '../dates/dob'
import type { Member } from '../gb-quote'

/** CSV or tab-separated text into rows, honouring quotes ("Tan, Wei Ming"). */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter(r => r.some(c => c !== ''))
}

type Col = 'name' | 'dob' | 'age' | 'relationship' | 'category' | 'occupation' | 'pass'

const HEADERS: [Col, RegExp][] = [
  ['dob', /date\s*of\s*birth|^d\.?o\.?b\.?$|birth\s*date|\bdob\b/i],
  ['occupation', /occupation\s*class|occ\.?\s*class/i],
  ['age', /^age\b|\bage\s*(last|next|as)/i],
  ['relationship', /relation|staff\s*\/\s*dep|member\s*type|^type$|dependant|dependent|^status$/i],
  ['pass', /foreign|work\s*permit|pass\s*type|wp\s*\/\s*sp|local\s*or/i],
  ['category', /categor|grade|designation|^band$|^class$|plan\s*type|^tier$/i],
  // Last, so "Name of Company" and "Company name" do not win: a name column says whose name.
  ['name', /^(employee|staff|member|insured|full)?\s*'?s?\s*name$|^name\s*of\s*(employee|staff|member|insured)|^employee$|^name$/i],
]

function columnsOf(header: string[]): Partial<Record<Col, number>> {
  const out: Partial<Record<Col, number>> = {}
  header.forEach((h, i) => {
    const t = h.replace(/\s+/g, ' ').trim()
    if (!t || /company/i.test(t)) return
    for (const [col, re] of HEADERS) {
      if (out[col] == null && re.test(t)) { out[col] = i; break }
    }
  })
  return out
}

function relationshipOf(raw: string, age: number | null): 'self' | 'spouse' | 'child' {
  const t = raw.toLowerCase()
  if (/spouse|wife|husband|partner/.test(t)) return 'spouse'
  if (/child|son\b|daughter|kid/.test(t)) return 'child'
  // "Dependant" says only that this is not the employee. Over 25 is read as a spouse, which is
  // how Singapore group schedules cap a child.
  if (/depend/.test(t)) return age != null && age <= 25 ? 'child' : 'spouse'
  return 'self'
}

/** An Excel serial date (days from 1899-12-30), as some exports leave it. */
function fromSerial(raw: string): CalendarDate | null {
  if (!/^\d{5}(\.0+)?$/.test(raw)) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86_400_000)
  const y = d.getUTCFullYear()
  return y > 1900 && y < 2100 ? { y, m: d.getUTCMonth() + 1, d: d.getUTCDate() } : null
}

export type CensusRead = {
  members: Member[]
  /** "Row 7, Tan Ah Kow: \"31/02/1980\"" — dates that could not be read. */
  unread: string[]
  /** Which header each field was found under, so the broker can see what was read. */
  found: Partial<Record<Col, string>>
  /** Why nothing could be read, when nothing could. */
  error?: string
}

export function censusFromRows(rows: string[][], today: CalendarDate = todaySGT()): CensusRead {
  // The header is the first row, among the first 15, naming both a person and a birth date or age.
  let h = -1, cols: Partial<Record<Col, number>> = {}
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const c = columnsOf(rows[i])
    if (c.name != null && (c.dob != null || c.age != null)) { h = i; cols = c; break }
  }
  if (h < 0) return { members: [], unread: [], found: {}, error: 'No header row with a name and a date of birth (or age) column in the first 15 rows.' }

  const found = Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, rows[h][i as number]])) as CensusRead['found']
  const members: Member[] = []
  const unread: string[] = []
  let lastCategory = 'Default'
  for (let r = h + 1; r < rows.length; r++) {
    const cell = (c: Col) => (cols[c] != null ? (rows[r][cols[c]!] ?? '').trim() : '')
    const name = cell('name')
    if (!name || /^(total|sub-?total|grand total)\b/i.test(name)) continue

    const rawDob = cell('dob')
    const d = rawDob ? (parseBirthDate(rawDob, today) ?? fromSerial(rawDob)) : null
    if (rawDob && !d) unread.push(`Row ${r + 1}, ${name}: "${rawDob}"`)
    const statedAge = cell('age') && /^\d{1,3}$/.test(cell('age')) ? Number(cell('age')) : null
    const ageNow = d ? ageLastBirthday(d, today) : statedAge
    const relationship = relationshipOf(cell('relationship'), ageNow)

    // Dependants take the employee's category above them. A work permit or S Pass is added to
    // the category ("Staff · WP") rather than replacing it: it decides foreign-worker cover, and
    // the staff grade still decides everything else.
    let category = cell('category')
    if (relationship === 'self') {
      if (category) lastCategory = category; else category = lastCategory
      const pass = cell('pass')
      if (/\b(wp|sp|work\s*permit|s[\s-]*pass)\b/i.test(pass)) category = `${category} · ${pass.toUpperCase()}`
    } else if (!category) category = lastCategory.replace(/ · .*$/, '')

    members.push({
      name, relationship, category: category || 'Default',
      dob: d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null,
      age: d ? null : statedAge,
      occupation_class: cell('occupation') || null,
    })
  }
  if (!members.length) return { members, unread, found, error: 'A header row was found but no people under it.' }
  return { members, unread, found }
}
