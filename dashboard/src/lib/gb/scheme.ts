/**
 * The scheme file (docs/eb-v2.md section 2, P2 and P4): one record per client per plan year with
 * the census and last year's policy as read, so a quotation for that year opens filled in and
 * nobody reads the same file twice. Pure: the plan year, the census checks and the changes from
 * the previous plan year's census. Server reads and writes are in scheme-store.ts.
 *
 * Checks are by code, from the census alone:
 *   duplicate     the same person twice (name and date of birth)
 *   no_age        no date of birth and no age: priced nowhere
 *   child_19_25   a child 19 to 25: covered only as a full-time student
 *   child_over_25 a child over 25: over every house insurer's limit
 *   employee_u16  an employee under 16
 *   employee_70   an employee 70 or over: most insurers underwrite or refuse
 *   relationship  neither employee, spouse nor child
 */
import { memberAge, type Member } from '@/lib/gb-quote'
import { planYearOf } from '@/lib/filing/tree'

/** The plan year a quotation with this start date prices: 2027–28. */
export const planYearFor = (effectiveDate: string | null | undefined): string | null => planYearOf(effectiveDate)

/** The plan year before: 2026–27 for 2027–28. */
export function previousPlanYear(planYear: string): string | null {
  const m = /^(\d{4})–\d{2}$/.exec(planYear)
  return m ? planYearOf(`${Number(m[1]) - 1}-01-01`) : null
}

export const CHECKS = {
  duplicate: 'Same person twice',
  no_age: 'No date of birth or age',
  child_19_25: 'Child 19 to 25 (full-time student only)',
  child_over_25: 'Child over 25',
  employee_u16: 'Employee under 16',
  employee_70: 'Employee 70 or over',
  relationship: 'Relationship not employee, spouse or child',
} as const
export type CheckKey = keyof typeof CHECKS
export type CensusCheck = { key: CheckKey; label: string; names: string[] }

const rel = (m: Member): 'self' | 'spouse' | 'child' | null => {
  const r = String(m.relationship ?? '').toLowerCase().trim()
  if (r === 'self' || r === 'employee' || r === 'member' || r === 'principal') return 'self'
  if (r === 'spouse' || r === 'husband' || r === 'wife') return 'spouse'
  if (r === 'child' || r === 'son' || r === 'daughter') return 'child'
  return null
}

const nameKey = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** A person across two censuses: name and date of birth, or name alone when no date is given. */
export const personKey = (m: Pick<Member, 'name' | 'dob'>) => `${nameKey(m.name)}|${(m.dob ?? '').slice(0, 10)}`

export function censusChecks(members: readonly Member[], effectiveDate: string): CensusCheck[] {
  const hits = new Map<CheckKey, string[]>()
  const add = (k: CheckKey, name: string) => hits.set(k, [...(hits.get(k) ?? []), name || 'Unnamed'])
  const seen = new Map<string, number>()
  for (const m of members) {
    const k = `${personKey(m)}|${rel(m) ?? ''}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
    if (seen.get(k) === 2) add('duplicate', m.name)
    const r = rel(m)
    if (!r) add('relationship', m.name)
    const age = memberAge(m, effectiveDate, 'last_birthday')
    if (age == null) { add('no_age', m.name); continue }
    if (r === 'child' && age > 25) add('child_over_25', m.name)
    else if (r === 'child' && age >= 19) add('child_19_25', m.name)
    if (r === 'self' && age < 16) add('employee_u16', m.name)
    if (r === 'self' && age >= 70) add('employee_70', m.name)
  }
  return (Object.keys(CHECKS) as CheckKey[]).filter(k => hits.has(k)).map(k => ({ key: k, label: CHECKS[k], names: hits.get(k)! }))
}

export type CensusChanges = {
  previous: number; now: number
  joiners: string[]; leavers: string[]
  /** Category moved: "Name: Staff → Manager". */
  moved: string[]
}

/** This census against the previous plan year's: who joined, who left, who changed category. */
export function censusChanges(previous: readonly Member[], now: readonly Member[]): CensusChanges {
  const before = new Map(previous.map(m => [personKey(m), m]))
  const after = new Map(now.map(m => [personKey(m), m]))
  const joiners: string[] = [], leavers: string[] = [], moved: string[] = []
  for (const [k, m] of after) {
    const p = before.get(k)
    if (!p) joiners.push(m.name)
    else if ((p.category ?? '').trim().toLowerCase() !== (m.category ?? '').trim().toLowerCase()) moved.push(`${m.name}: ${p.category || '—'} → ${m.category || '—'}`)
  }
  for (const [k, m] of before) if (!after.has(k)) leavers.push(m.name)
  return { previous: previous.length, now: now.length, joiners, leavers, moved }
}
