/**
 * Pure census helpers shared between the "New quote" wizard and editing an already-saved quote.
 */
import type { CensusMember } from '@/lib/pm-quote'

/** Plain calendar age as of today, from a DOB — display-only convenience (pricing itself uses each
 *  insurer's own age basis / effective date via ageForBasis in pm-calc.ts, not this). */
export function ageAsOfToday(dob: string): number | null {
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const hadBirthday = today.getMonth() > d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate())
  if (!hadBirthday) age--
  return age
}

export const CENSUS_CSV_FIELDS = ['name', 'date_of_birth', 'age', 'relationship', 'employee_category'] as const
export type CensusCsvField = typeof CENSUS_CSV_FIELDS[number]
export const CENSUS_CSV_FIELD_LABEL: Record<CensusCsvField, string> = {
  name: 'Name', date_of_birth: 'Date of birth', age: 'Age', relationship: 'Relationship', employee_category: 'Employee category',
}
/** Only name is truly required — everything else can be left unmapped. */
export const CENSUS_CSV_REQUIRED: CensusCsvField[] = ['name']

const SYNONYMS: Record<CensusCsvField, string[]> = {
  name: ['name', 'full name', 'employee name', 'full_name'],
  date_of_birth: ['dob', 'date_of_birth', 'date of birth', 'birth date', 'birthdate'],
  age: ['age'],
  relationship: ['relationship', 'relation'],
  employee_category: ['employee_category', 'employee category', 'category', 'staff category', 'staff_category', 'grade', 'job grade'],
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map(s => s.trim())
}

/** Best-effort auto-guess of which uploaded column is which required field, plus a small preview
 *  so a mismap is visible before committing — used by the CSV mapping screen. Never throws on a
 *  malformed file; an empty/unparseable CSV just yields no headers and no guesses. */
export function detectCsvColumns(text: string): { headers: string[]; guesses: Record<CensusCsvField, number | null>; previewRows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const headers = lines.length ? splitCsvLine(lines[0]) : []
  const headersLower = headers.map(h => h.toLowerCase())
  const guesses = {} as Record<CensusCsvField, number | null>
  for (const field of CENSUS_CSV_FIELDS) {
    const idx = headersLower.findIndex(h => SYNONYMS[field].includes(h))
    guesses[field] = idx >= 0 ? idx : null
  }
  const previewRows = lines.slice(1, 6).map(splitCsvLine)
  return { headers, guesses, previewRows }
}

/** Parse every data row using an EXPLICIT column mapping (from the CSV mapping screen) rather than
 *  guessing header names — `mapping[field]` is a column index into each row, or unset/null to skip
 *  that field entirely (e.g. no employee_category column in this file). */
export function parseCensusCsvWithMapping(text: string, mapping: Partial<Record<CensusCsvField, number | null>>): CensusMember[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const at = (row: string[], field: CensusCsvField): string | null => {
    const idx = mapping[field]
    return idx != null && idx >= 0 ? (row[idx] || null) : null
  }
  return lines.slice(1).map(line => {
    const row = splitCsvLine(line)
    const dob = at(row, 'date_of_birth')
    const ageStr = at(row, 'age')
    const age = ageStr ? Number(ageStr) : (dob ? ageAsOfToday(dob) : null)
    return {
      name: at(row, 'name') ?? row[0] ?? '',
      date_of_birth: dob,
      age,
      relationship: at(row, 'relationship') ?? 'Self',
      employee_category: at(row, 'employee_category'),
    }
  })
}

/** Auto-detect + parse in one step (no mapping-screen confirmation) — kept for any caller that
 *  wants the old one-shot behavior; the census editor's "upload CSV" button uses the mapping
 *  screen (detectCsvColumns + parseCensusCsvWithMapping) instead so a mismatch is caught first. */
export function parseCensusCsv(text: string): CensusMember[] {
  const { guesses } = detectCsvColumns(text)
  return parseCensusCsvWithMapping(text, guesses)
}
