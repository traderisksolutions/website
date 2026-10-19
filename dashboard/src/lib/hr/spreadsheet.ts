/**
 * HR Connect: an employee list as HR exports it from payroll or keeps it in Excel.
 *
 * CSV, TSV or XLSX. The header row is found by its columns, not its position, and each column is
 * recognised by what HR called it: "Employee Name", "Full name", "DOB", "Date of birth",
 * "Pass type", "Grade", "Join date". A column named for pay, identity numbers or contact details
 * is dropped before anything is kept. Dates are read day-first, never month-first; a date that
 * cannot be read is reported, not guessed.
 *
 * Dependants may be in the same file. A `Relationship` column with spouse / child marks them, and
 * they attach to their employee by the `Employee name` or `Employee ID` column when the file has
 * one, otherwise to the employee row above them.
 *
 * Pure. The route hands it the file bytes.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')
import { parseDelimited } from '../gb/census-parse'
import { ageLastBirthday, parseCalendarDate, todaySGT, type CalendarDate } from '../dates/dob'
import type { HrDependant, HrEmployee, HrRead } from './types'
import { HrConnectorError, asText, isSensitiveKey, isoDate, isPastOrToday, normaliseGender, normaliseStatus, rowIssues } from './connectors'

type Field = 'name' | 'firstName' | 'lastName' | 'dob' | 'gender' | 'category' | 'workPass' | 'hireDate'
  | 'status' | 'employeeId' | 'relationship' | 'parentName' | 'parentId' | 'resignDate'

/** Exact matches after normalisation (lower case, punctuation and extra spaces removed). */
const EXACT: Record<Field, string[]> = {
  name: ['name', 'employee name', 'full name', 'staff name', 'employee', 'member name', 'insured name', 'name of employee', 'name of staff', 'dependant name', 'dependent name', 'person', 'name of insured'],
  firstName: ['first name', 'given name', 'firstname', 'given names', 'forename'],
  lastName: ['last name', 'surname', 'family name', 'lastname'],
  dob: ['dob', 'd o b', 'date of birth', 'birth date', 'birthday', 'birthdate', 'date of birth dd mm yyyy', 'dob dd mm yyyy', 'date of birth ddmmyyyy'],
  gender: ['gender', 'sex'],
  category: ['category', 'grade', 'designation', 'job title', 'title', 'level', 'employee type', 'category of staff', 'staff category', 'position', 'job grade', 'plan', 'plan type', 'band', 'class', 'tier', 'rank', 'employee category', 'job', 'occupation', 'role'],
  workPass: ['pass', 'work pass', 'pass type', 'nationality status', 'residency', 'citizenship', 'immigration status', 'work pass type', 'residency status', 'local or foreign', 'local foreign', 'nationality', 'pr citizen', 'citizen pr', 'wp sp', 'employment pass type'],
  hireDate: ['hire date', 'join date', 'date joined', 'start date', 'employment date', 'date of joining', 'hired date', 'date hired', 'joined', 'commencement date', 'date of employment', 'date of hire', 'joining date'],
  status: ['status', 'employment status', 'employee status', 'active', 'staff status'],
  employeeId: ['employee id', 'staff id', 'id', 'emp id', 'employee no', 'staff no', 'employee number', 'staff number', 'emp no', 'payroll id', 'personnel no'],
  relationship: ['relationship', 'relation', 'relationship to employee', 'member type', 'staff dependant', 'staff dependent', 'employee dependant', 'employee dependent', 'dependant type', 'dependent type', 'type', 'insured type', 'relationship to staff'],
  parentName: ['employee name', 'staff name', 'principal name', 'name of employee', 'name of staff', 'parent employee', 'employee'],
  parentId: [],
  resignDate: ['resign date', 'resignation date', 'termination date', 'last day', 'last working day', 'cessation date', 'end date', 'date left', 'date resigned', 'date of resignation', 'leaving date', 'exit date'],
}

/** Looser matches, for "Date of Birth (DD/MM/YYYY)" and "Employee Name (as per NRIC)". Only distinctive phrases. */
const CONTAINS: [Field, RegExp][] = [
  ['dob', /\b(date of birth|birth date|birthdate|dob)\b/],
  ['firstName', /\b(first name|given name)\b/],
  ['lastName', /\b(last name|surname|family name)\b/],
  ['hireDate', /\b(hire date|join date|date joined|start date|employment date|date of joining|hired date|date of hire|joining date)\b/],
  ['resignDate', /\b(resign(ation)? date|termination date|last (working )?day|cessation date|date left)\b/],
  ['workPass', /\b(work pass|pass type|immigration status|nationality status|residency|citizenship|local or foreign|wp sp)\b/],
  ['relationship', /\b(relationship|relation|member type|dependant type|dependent type)\b/],
  ['employeeId', /\b(employee (id|no|number)|staff (id|no|number)|emp (id|no))\b/],
  ['status', /\b(employment status|employee status)\b/],
  ['category', /\b(category|grade|designation|job title|employee type)\b/],
  ['gender', /\b(gender|sex)\b/],
  ['name', /\b(employee name|full name|staff name|member name|name of employee|dependant name|dependent name)\b/],
]

export const normaliseHeader = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').replace(/\s+/g, ' ').trim()

type Columns = Partial<Record<Field, number>>

/** Which field each header is, if any. A header that matches two fields keeps the first that is still free. */
function columnsOf(header: unknown[]): { cols: Columns; discarded: string[]; unmatched: string[] } {
  const cols: Columns = {}
  const discarded: string[] = []
  const unmatched: string[] = []
  const norm = header.map(normaliseHeader)
  const take = (f: Field, i: number) => { if (cols[f] == null) { cols[f] = i; return true } return false }

  // Headers that say "employee name" are kept aside: they are the person's name unless the file
  // has another name column, in which case they name a dependant's employee.
  const employeeNameCols: number[] = []
  norm.forEach((t, i) => {
    if (!t) return
    if (isSensitiveKey(String(header[i]))) { discarded.push(String(header[i])); return }
    if (/\bcompany\b/.test(t) && !/\bemployee\b/.test(t)) { unmatched.push(String(header[i])); return }
    if (EXACT.parentName.includes(t)) { employeeNameCols.push(i); return }
    for (const f of Object.keys(EXACT) as Field[]) {
      if (f === 'parentName' || f === 'parentId') continue
      if (EXACT[f].includes(t) && take(f, i)) return
    }
    for (const [f, re] of CONTAINS) if (re.test(t) && take(f, i)) return
    unmatched.push(String(header[i]))
  })
  for (const i of employeeNameCols) {
    if (cols.name == null) cols.name = i
    else if (cols.parentName == null) cols.parentName = i
    else unmatched.push(String(header[i]))
  }
  return { cols, discarded, unmatched }
}

function relationshipOf(raw: string, age: number | null): 'employee' | 'spouse' | 'child' | null {
  const t = raw.trim().toLowerCase()
  if (!t) return 'employee'
  if (/spouse|wife|husband|partner/.test(t)) return 'spouse'
  if (/child|son\b|daughter|kid|dependant child|dependent child/.test(t)) return 'child'
  if (/^(employee|self|staff|principal|main|member|insured|emp|e|s|own|primary|worker)$/.test(t)) return 'employee'
  // "Dependant" alone: a Singapore group schedule caps a child at 25, so over that is a spouse.
  if (/depend/.test(t)) return age != null && age <= 25 ? 'child' : 'spouse'
  return null
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return isoDate(v) ?? ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  return String(v).trim()
}

/** The first row, among the first 20, that names a person (a name column, or first and last name). */
function findHeader(rows: unknown[][]): { index: number; cols: Columns; discarded: string[]; unmatched: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i]
    if (!r || r.filter(c => cellText(c)).length < 2) continue
    const found = columnsOf(r)
    const hasName = found.cols.name != null || (found.cols.firstName != null && found.cols.lastName != null)
    const hasMore = ['dob', 'gender', 'category', 'workPass', 'hireDate', 'status', 'employeeId', 'relationship'].some(f => found.cols[f as Field] != null)
    if (hasName && hasMore) return { index: i, ...found }
  }
  return null
}

function rowsFromXlsx(buf: Buffer): { sheet: string; rows: unknown[][] }[] {
  // Date cells arrive as Excel serials and are turned into calendar dates by arithmetic (isoDate →
  // fromSerial). With cellDates the sheet gives JS Dates at local midnight, which read a day early
  // on a UTC+8 machine once converted through UTC; the serial has no such ambiguity.
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false })
  return wb.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' })
    return { sheet: name, rows: rows.filter(r => Array.isArray(r) && r.some(c => cellText(c) !== '')) }
  })
}

function rowsFromText(buf: Buffer): unknown[][] {
  const text = buf.toString('utf8').replace(/^﻿/, '')
  return parseDelimited(text)
}

const isSpreadsheetName = (filename: string) => /\.(xlsx|xlsm|xls|ods)$/i.test(filename)
const looksLikeZip = (buf: Buffer) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
const looksLikeOle = (buf: Buffer) => buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf

/**
 * Read an uploaded employee list. Throws HrConnectorError (status 422) when no header row with a
 * name column and at least one other recognised column can be found; the message is safe to show.
 */
export function readSpreadsheet(buf: Buffer, filename: string, today: CalendarDate = todaySGT()): HrRead {
  if (!buf || !buf.length) throw new HrConnectorError('The file is empty.', 422)

  let candidates: { sheet: string; rows: unknown[][] }[]
  if (isSpreadsheetName(filename) || looksLikeZip(buf) || looksLikeOle(buf)) {
    try { candidates = rowsFromXlsx(buf) }
    catch { throw new HrConnectorError('The file could not be opened as a spreadsheet. Save it as .xlsx or .csv and try again.', 422) }
  } else {
    candidates = [{ sheet: 'CSV', rows: rowsFromText(buf) }]
  }

  // First sheet with at least two rows and a header we recognise.
  let sheet = '', rows: unknown[][] = [], header: ReturnType<typeof findHeader> = null
  for (const c of candidates) {
    if (c.rows.length < 2) continue
    const h = findHeader(c.rows)
    if (h) { sheet = c.sheet; rows = c.rows; header = h; break }
  }
  if (!header) {
    throw new HrConnectorError('No header row with a name column and a date of birth, gender or category column was found. Check the first sheet has one row of column titles.', 422)
  }

  const { cols, discarded, unmatched } = header
  const headerRow = rows[header.index]
  const cell = (r: unknown[], f: Field) => (cols[f] != null ? cellText(r[cols[f]!]) : '')
  const rawOf = (r: unknown[], f: Field) => (cols[f] != null ? r[cols[f]!] : undefined)
  const nameOf = (r: unknown[]) => {
    const n = cell(r, 'name')
    if (n) return n
    return `${cell(r, 'firstName')} ${cell(r, 'lastName')}`.replace(/\s+/g, ' ').trim()
  }
  const keepColumns = headerRow.map((h, i) => ({ h: String(h ?? '').trim(), i })).filter(({ h }) => h && !isSensitiveKey(h))
  const rawRecord = (r: unknown[]) => {
    const out: Record<string, unknown> = {}
    for (const { h, i } of keepColumns) {
      const v = r[i]
      if (v == null || v === '') continue
      out[h] = v instanceof Date ? (isoDate(v) ?? v.toISOString()) : v
    }
    return out
  }
  const hasRelationship = cols.relationship != null

  const employees: HrEmployee[] = []
  const dependants: HrDependant[] = []
  const skipped: HrRead['skipped'] = []
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim()
  // A dependant row with no explicit parent attaches to the nearest employee row above it.
  const precedingEmployee: (string | null)[] = []
  const pendingDependants: { r: number; key: string; name: string; relationship: 'spouse' | 'child'; dob: string | null; dobRaw: unknown; gender: 'M' | 'F' | null; parentName: string; parentId: string }[] = []

  let lastEmployeeKey: string | null = null
  for (let r = header.index + 1; r < rows.length; r++) {
    const row = rows[r]
    const key = `row-${r + 1}`
    precedingEmployee[r] = lastEmployeeKey
    const name = nameOf(row)
    if (!name) { skipped.push({ key, reason: 'No name' }); continue }
    if (/^(sub-?total|total|grand total)\b/i.test(name)) { skipped.push({ key, reason: 'Totals row' }); continue }

    const dobRaw = rawOf(row, 'dob')
    const dob = isoDate(dobRaw, today)
    const dobCal = dob ? parseCalendarDate(dob) : null
    const age = dobCal ? ageLastBirthday(dobCal, today) : null
    const gender = normaliseGender(cell(row, 'gender'))

    const relationship = hasRelationship ? relationshipOf(cell(row, 'relationship'), age) : 'employee'
    if (relationship == null) { skipped.push({ key, reason: `Relationship not recognised: ${cell(row, 'relationship')}` }); continue }

    if (relationship !== 'employee') {
      pendingDependants.push({ r, key, name, relationship, dob, dobRaw, gender, parentName: cell(row, 'parentName'), parentId: cell(row, 'employeeId') })
      continue
    }

    const statusRaw = cell(row, 'status')
    let status = cols.status != null ? normaliseStatus(statusRaw) : 'active'
    const resign = isoDate(rawOf(row, 'resignDate'), today)
    if (resign && isPastOrToday(resign, today)) status = 'inactive'
    const employeeId = cell(row, 'employeeId')

    const e: HrEmployee = {
      key, name, dob, gender,
      category: asText(cell(row, 'category')),
      workPass: asText(cell(row, 'workPass')),
      hireDate: isoDate(rawOf(row, 'hireDate'), today),
      status,
      occupationClass: null,
      issues: rowIssues({ dob, dobRaw, gender, status, statusRaw: resign && status === 'inactive' ? `left ${resign}` : statusRaw }),
      raw: rawRecord(row),
    }
    if (cols.hireDate != null && cell(row, 'hireDate') && !e.hireDate) e.issues.push(`Hire date unreadable: ${cell(row, 'hireDate')}`)
    employees.push(e)
    lastEmployeeKey = key
    if (employeeId) byId.set(employeeId.toLowerCase(), key)
    byName.set(normName(name), key)
  }

  for (const d of pendingDependants) {
    let parent: string | undefined
    if (d.parentId) parent = byId.get(d.parentId.toLowerCase())
    if (!parent && d.parentName) parent = byName.get(normName(d.parentName))
    if (!parent && !d.parentId && !d.parentName) parent = precedingEmployee[d.r] ?? undefined
    if (!parent) {
      const ref = d.parentName || d.parentId
      skipped.push({ key: d.key, reason: ref ? `No employee named ${ref} for ${d.relationship} ${d.name}` : `No employee row above ${d.relationship} ${d.name}` })
      continue
    }
    const issues = rowIssues({ dob: d.dob, dobRaw: d.dobRaw, gender: d.gender, status: 'active' })
    dependants.push({ key: d.key, employeeKey: parent, name: d.name, relationship: d.relationship, dob: d.dob, gender: d.gender, issues })
  }

  const columns: Record<string, string> = {}
  for (const [f, i] of Object.entries(cols)) if (i != null) columns[f] = String(headerRow[i as number] ?? '').trim()

  return {
    source: 'csv',
    employees,
    dependants,
    skipped,
    meta: {
      filename,
      sheet,
      headerRow: header.index + 1,
      rows: rows.length - header.index - 1,
      columns,
      ignored: [...unmatched, ...discarded],
      discarded,
      ...(cols.status == null ? { statusAssumed: 'active' } : {}),
      ...(hasRelationship ? {} : { dependants: 'none in file' }),
    },
  }
}
