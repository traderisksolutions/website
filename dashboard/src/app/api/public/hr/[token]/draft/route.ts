/**
 * PUT /api/public/hr/[token]/draft  { employees, dependants } → HR's edits saved on the draft → { ok, counts }
 * Rows are re-shaped here: dates day-first, relationship spouse or child, nothing else trusted.
 */
import { NextRequest } from 'next/server'
import { recordEvent, saveDraft } from '@/lib/hr/links'
import { errorMessage, openLink, pjson } from '@/lib/hr/public'
import { toIsoDate } from '@/lib/dates/dob'
import type { HrDependant, HrEmployee } from '@/lib/hr/types'

export const dynamic = 'force-dynamic'

const MAX = 4000
const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const nullable = (v: unknown) => text(v) || null
const gender = (v: unknown): 'M' | 'F' | null => {
  const s = text(v).toUpperCase()
  return s.startsWith('M') ? 'M' : s.startsWith('F') ? 'F' : null
}
const dob = (v: unknown): string | null => (typeof v === 'string' ? toIsoDate(v) : null)
const status = (v: unknown): HrEmployee['status'] => (v === 'inactive' ? 'inactive' : v === 'unknown' ? 'unknown' : 'active')
const occ = (v: unknown): HrEmployee['occupationClass'] => (v === '1' || v === '2' || v === '3' ? v : null)
const raw = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined)

/** Keeps the reader's other findings, drops the date-of-birth one once a date is present. */
function issuesFor(existing: unknown, d: string | null, missingText: string): string[] {
  const kept = Array.isArray(existing) ? existing.filter((s): s is string => typeof s === 'string' && !/date of birth/i.test(s)) : []
  return d ? kept : [...kept, missingText]
}

function employee(v: unknown, i: number): HrEmployee | null {
  const o = raw(v)
  if (!o) return null
  const name = text(o.name)
  if (!name) return null
  const d = dob(o.dob)
  return {
    key: text(o.key) || `e${i + 1}`,
    name,
    dob: d,
    gender: gender(o.gender),
    category: nullable(o.category),
    workPass: nullable(o.workPass),
    hireDate: dob(o.hireDate),
    status: status(o.status),
    occupationClass: occ(o.occupationClass),
    issues: issuesFor(o.issues, d, 'Date of birth missing'),
    ...(raw(o.raw) ? { raw: raw(o.raw) } : {}),
  }
}

function dependant(v: unknown, i: number, employeeKeys: Set<string>): HrDependant | null {
  const o = raw(v)
  if (!o) return null
  const name = text(o.name)
  const employeeKey = text(o.employeeKey)
  if (!name || !employeeKeys.has(employeeKey)) return null
  const rel = text(o.relationship).toLowerCase()
  const d = dob(o.dob)
  return {
    key: text(o.key) || `d${i + 1}`,
    employeeKey,
    name,
    relationship: rel === 'spouse' ? 'spouse' : 'child',
    dob: d,
    gender: gender(o.gender),
    issues: issuesFor(o.issues, d, 'Date of birth missing'),
  }
}

export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await openLink(params.token)
  if ('response' in r) return r.response
  const b = await req.json().catch(() => null) as { employees?: unknown; dependants?: unknown } | null
  if (!b || !Array.isArray(b.employees) || !Array.isArray(b.dependants)) return pjson({ error: 'Body must carry employees and dependants' }, 400)
  if (b.employees.length > MAX || b.dependants.length > MAX) return pjson({ error: 'Over 4,000 rows' }, 400)
  const employees = b.employees.map(employee).filter((e): e is HrEmployee => !!e)
  const keys = new Set(employees.map(e => e.key))
  const dependants = b.dependants.map((d, i) => dependant(d, i, keys)).filter((d): d is HrDependant => !!d)
  try {
    await saveDraft(r.link.id, { employees, dependants }, r.link.company_id)
    await recordEvent(r.link.id, 'saved', { employees: employees.length, dependants: dependants.length })
    return pjson({ ok: true, counts: { employees: employees.length, dependants: dependants.length } })
  } catch (e) {
    return pjson({ error: errorMessage(e) }, 500)
  }
}
