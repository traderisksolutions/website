/**
 * Reads movements out of a spreadsheet's rows, without a model. Pure: the caller turns the file
 * into rows (read-xlsx.ts). Handles the layouts clients and insurers use:
 *   - a movement list with an action column (Add/Delete, A/D, Addition/Deletion, Join/Leave)
 *   - a joiner list (date of joining, no action column) or a leaver list (last day / termination)
 *   - the insurers' own templates (QBE MBRIPF, GE FWMI, Income Step3), which are movement lists
 *   - a vehicle schedule with an action column (fleet endorsements)
 * A sheet that is a full member listing (names with no action and no join/leave date) is NOT a
 * movement list and returns nothing; the model is not asked either, since there is nothing to ask.
 */
import { parseWrittenDate } from '@/lib/admin/b/dates'
import type { ParsedMovement, MovementType } from './types'

type Col = 'action' | 'name' | 'dob' | 'gender' | 'relationship' | 'effective' | 'last_day' | 'employment' | 'plan' | 'category' | 'id' | 'vehicle' | 'remarks' | 'employee'
const HEADERS: [Col, RegExp][] = [
  ['action', /^(action|action code|addition ?\/ ?deletion|add ?\/ ?delete|record type|type of movement|movement|transaction|status \(add)/i],
  ['vehicle', /(vehicle|registration|reg\.? ?no|plate)/i],
  ['name', /^(name|full name|employee name|member name|name of (worker|employee|insured|member)|staff name|name as (in|per)|insured name)/i],
  ['employee', /(employee'?s? (nric|fin)|principal|for dependants|employee of)/i],
  ['dob', /(date of birth|dob|birth)/i],
  ['gender', /^(gender|sex)/i],
  ['relationship', /(relationship|relation|dependant type)/i],
  ['last_day', /(last day|date of (resignation|termination|cessation|leaving)|termination date|resignation date|cessation|date left|leaving date)/i],
  ['employment', /(date of (employment|joining|hire|commencement)|employment date|joining date|join date|date joined|start date|commencement)/i],
  ['effective', /(effective|wef|w\.e\.f|inception date|cover (start|from))/i],
  ['plan', /^(plan|plan no|plan code|plan type)/i],
  ['category', /(category|cat\.?|class|grade|occupation|designation|job title)/i],
  ['id', /(nric|fin|passport|identification|id no|work permit)/i],
  ['remarks', /(remarks?|notes?|comments?)/i],
]
const ACTION: [RegExp, 'join' | 'leave' | 'change'][] = [
  [/^(a|add|added|addition|new|join|joiner|include|inclusion|n)$/i, 'join'],
  [/^(d|del|delete|deleted|deletion|remove|removal|leave|leaver|resign|resigned|terminate|terminated|termination|exclude|exclusion|withdraw|cancel)$/i, 'leave'],
  [/^(c|change|changed|amend|amendment|update|upgrade|downgrade|transfer)$/i, 'change'],
]
const cell = (v: unknown): string => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim()
const dateCell = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = cell(v)
  if (!s) return null
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); return d.toISOString().slice(0, 10) }  // Excel serial
  return parseWrittenDate(s)
}
const dayAfter = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10) }
const actionOf = (s: string): 'join' | 'leave' | 'change' | null => {
  const t = s.trim().replace(/\s*-.*$/, '')
  for (const [re, k] of ACTION) if (re.test(t)) return k
  return null
}

/** Finds the header row: the first row with a name (or vehicle) column and at least one other known column. */
export function detectHeader(rows: unknown[][]): { row: number; cols: Partial<Record<Col, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const cols: Partial<Record<Col, number>> = {}
    ;(rows[r] ?? []).forEach((v, i) => {
      const h = cell(v).replace(/[*\n]/g, ' ').replace(/\s+/g, ' ').trim()
      if (!h || h.length > 80) return
      for (const [col, re] of HEADERS) if (cols[col] == null && re.test(h)) { cols[col] = i; return }
    })
    if ((cols.name != null || cols.vehicle != null) && Object.keys(cols).length >= 2) return { row: r, cols }
  }
  return null
}

export function parseMovementRows(rows: unknown[][], filename: string): ParsedMovement[] {
  const head = detectHeader(rows)
  if (!head) return []
  const { cols } = head
  const isVehicle = cols.vehicle != null && cols.name == null
  const get = (row: unknown[], c: Col) => (cols[c] == null ? '' : cell(row[cols[c]!]))
  const getDate = (row: unknown[], c: Col) => (cols[c] == null ? null : dateCell(row[cols[c]!]))
  const out: ParsedMovement[] = []
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const name = isVehicle ? get(row, 'vehicle') : get(row, 'name')
    if (!name || name.length < 2 || /^(total|count|no\.?|s\/n|remarks?)$/i.test(name)) continue
    const action = cols.action != null ? actionOf(get(row, 'action')) : null
    const lastDay = getDate(row, 'last_day')
    const employment = getDate(row, 'employment')
    const effective = getDate(row, 'effective')
    let kind = action
    if (!kind) {
      if (lastDay) kind = 'leave'
      else if (cols.action == null && (effective || employment)) kind = 'join'
      else continue   // a plain listing: no action, no movement date
    }
    const eff = kind === 'leave' ? (effective ?? (lastDay ? dayAfter(lastDay) : null)) : (effective ?? employment)
    const detail: Record<string, unknown> = {}
    const dob = getDate(row, 'dob'); if (dob) detail.dob = dob
    const g = get(row, 'gender'); if (g) detail.gender = g
    const plan = get(row, 'plan'); if (plan) detail.plan = plan
    const cat = get(row, 'category'); if (cat) detail.category = cat
    if (employment) detail.employment_date = employment
    if (lastDay) detail.last_day = lastDay
    const emp = get(row, 'employee'); if (emp) detail.employee_name = emp
    const rem = get(row, 'remarks'); if (rem) detail.note = rem.slice(0, 200)
    const rel = get(row, 'relationship')
    const movement_type: MovementType = isVehicle ? 'vehicle' : 'member'
    out.push({
      kind, movement_type, name: name.slice(0, 200), effective_on: eff, last_day: lastDay,
      relationship: rel ? rel.toLowerCase() : 'employee', detail, source: `sheet:${filename}`,
      quote: `row ${r + 1}: ${[get(row, 'action'), name, lastDay ?? effective ?? employment ?? ''].filter(Boolean).join(' · ')}`,
    })
  }
  return out
}
