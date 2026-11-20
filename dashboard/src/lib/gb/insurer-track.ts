/**
 * Each insurer on a kept quotation (docs/eb-v2.md P5, G26; route override, G24): its route, where
 * the request stands, and the date each step was taken. Pure; tested in gb-insurer-track.test.ts.
 */
import type { Member } from '@/lib/gb-quote'
import type { Snapshot } from './eb-proposal'
import { routeFor, ROUTE_PRODUCTS, type Route } from './routes'

export const INSURER_STATUSES = ['not_asked', 'requested', 'chased', 'quoted', 'declined', 'revised'] as const
export type InsurerStatus = typeof INSURER_STATUSES[number]
export const STATUS_LABEL: Record<InsurerStatus, string> = {
  not_asked: 'Not asked', requested: 'Requested', chased: 'Chased', quoted: 'Quoted', declined: 'Declined', revised: 'Revised',
}
export const isInsurerStatus = (v: unknown): v is InsurerStatus => typeof v === 'string' && (INSURER_STATUSES as readonly string[]).includes(v)

/** The date column a status stamps; Not asked stamps none. */
export const STAMP: Record<InsurerStatus, string | null> = {
  not_asked: null, requested: 'requested_at', chased: 'chased_at', quoted: 'quoted_at', declined: 'declined_at', revised: 'revised_at',
}

export type TrackedInsurer = {
  insurer: string; route: Route; computed: Route; reasons: string[]; route_override: boolean; override_reason: string | null
  status: InsurerStatus; requested_at: string | null; chased_at: string | null; quoted_at: string | null; declined_at: string | null; revised_at: string | null
  note: string | null; updated_by: string | null; updated_at: string | null
}
export type TrackRow = Partial<Omit<TrackedInsurer, 'computed' | 'reasons'>> & { insurer: string }

/** The house product behind a column: itself, a copy's product, or none (an insurer's own schedule). */
export const houseProduct = (s: Pick<Snapshot, 'columnProducts'>, column: string): string | null => {
  const p = s.columnProducts?.[column] ?? column.replace(/\s*·\s*copy.*$/i, '')
  return ROUTE_PRODUCTS.includes(p) ? p : null
}

/** One row per insurer column of the quotation: the computed route, then what was kept. */
export function trackedInsurers(s: Pick<Snapshot, 'products' | 'members' | 'effectiveDate' | 'columnProducts'> & { categories?: Pick<Snapshot['categories'][number], 'name' | 'employees'>[] }, kept: readonly TrackRow[]): TrackedInsurer[] {
  // A quotation re-priced from an old one keeps headcount per category but no census: the
  // employees stand in, without ages, and the route says so.
  const fromCounts = !(s.members ?? []).length && (s.categories ?? []).some(c => c.employees > 0)
  const members: Member[] = fromCounts
    ? (s.categories ?? []).flatMap(c => Array.from({ length: c.employees }, (_, i) => ({ name: `${c.name} ${i + 1}`, category: c.name, relationship: 'self', dob: null, age: null })))
    : (s.members ?? []).map(m => ({ name: m.name, category: m.category, relationship: m.relationship, dob: m.dob, age: m.age }))
  const byName = new Map(kept.map(k => [k.insurer, k]))
  const seen = new Set<string>()
  return s.products.flatMap(column => {
    const house = houseProduct(s, column)
    const insurer = house ?? column
    if (seen.has(insurer)) return []
    seen.add(insurer)
    const r = house ? routeFor(house, members, s.effectiveDate) : { route: 'quote' as Route, reasons: ['The insurer\'s own schedule'] }
    if (house && fromCounts) r.reasons.push('No census on this quotation: headcount from its categories, ages not checked')
    const k = byName.get(insurer)
    const overridden = !!k?.route_override && (k.route === 'brochure' || k.route === 'quote')
    return [{
      insurer, computed: r.route, route: overridden ? k!.route! : r.route, reasons: r.reasons,
      route_override: overridden, override_reason: overridden ? k?.override_reason ?? null : null,
      status: isInsurerStatus(k?.status) ? k!.status! : 'not_asked',
      requested_at: k?.requested_at ?? null, chased_at: k?.chased_at ?? null, quoted_at: k?.quoted_at ?? null, declined_at: k?.declined_at ?? null, revised_at: k?.revised_at ?? null,
      note: k?.note ?? null, updated_by: k?.updated_by ?? null, updated_at: k?.updated_at ?? null,
    }]
  })
}

export type TrackChange = { status?: InsurerStatus; route?: Route | null; override_reason?: string | null; note?: string | null }

/** The columns a change writes: a new status stamps its date; a route other than the computed one needs a reason. */
export function trackPatch(change: TrackChange, computed: Route, now: string): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {}
  if (change.status !== undefined) {
    patch.status = change.status
    const col = STAMP[change.status]
    if (col) patch[col] = now
  }
  if (change.route !== undefined) {
    if (change.route === null || change.route === computed) Object.assign(patch, { route: computed, route_override: false, override_reason: null })
    else {
      const why = (change.override_reason ?? '').trim()
      if (!why) return { error: 'Say why the route is changed.' }
      Object.assign(patch, { route: change.route, route_override: true, override_reason: why.slice(0, 300) })
    }
  }
  if (change.note !== undefined) patch.note = change.note ? change.note.trim().slice(0, 500) || null : null
  return { patch }
}
