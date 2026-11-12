/**
 * The client's current cover first, then one change at a time.
 *
 * A census names, per person, the plan they hold today: "GHS 4 · GMM 4 · GP 1 · SP 1 · Dental 2 ·
 * GTL 12" (OUE, 12 Nov 2026). Plan numbers are the client's own, so the broker states once what
 * each one means, as numbers (the schedule): hospital type, ward, the limit and its basis,
 * co-insurance; major medical limit; GP co-pay; specialist and dental limits; life cover as a sum
 * or a multiple of monthly salary. Every person then has a set of numbers; people with the same
 * numbers price as one category.
 *
 * The columns: the current cover as scheduled, then each change on its own (ward down and up,
 * hospital type, limit down and up, 20% co-insurance, major medical, life down and up), priced at
 * every insurer, the current insurer on its renewal card. Nothing here calls a model.
 *
 * Pure helpers; tested in src/__tests__/gb-current.test.ts.
 */
import type { CustomSpec } from './custom'
import type { Member } from '../gb-quote'

export type HospitalFacts = { hospital: 'private' | 'government'; beds: 1 | 2 | 4; limitKind: 'per_disability' | 'annual'; limit: number; coins: 0 | 20 | 25; foreignWorker?: boolean }
export type LifeFacts = { kind: 'multiple' | 'sum'; n: number }

/** What each of the client's plan numbers means, per cover. A null value means "not covered". */
export type Schedule = {
  GHS: Record<string, HospitalFacts | null>
  EMM: Record<string, number | null>
  GOPC: Record<string, number | null>
  GOSC: Record<string, number | null>
  GD: Record<string, number | null>
  GTL: Record<string, LifeFacts | null>
}
export type ScheduleCover = keyof Schedule
export const SCHEDULE_COVERS: ScheduleCover[] = ['GHS', 'EMM', 'GOPC', 'GOSC', 'GD', 'GTL']
export const COVER_WORD: Record<ScheduleCover, string> = { GHS: 'Hospital & surgical', EMM: 'Major medical', GOPC: 'GP', GOSC: 'Specialist', GD: 'Dental', GTL: 'Term life' }

const EMPTY = /^(n\.?a\.?|nil|none|-|—|0)$/i
/** The schedule key for a census with no plan columns: one plan for everyone. */
export const ALL = '*'
export const planValue = (raw: string | null | undefined): string | null => { const v = String(raw ?? '').trim(); return !v || EMPTY.test(v) ? null : v }

/** The distinct plan values per cover, with how many people hold each. */
export function planValues(members: Member[]): Record<ScheduleCover, { value: string; people: number }[]> {
  const out = Object.fromEntries(SCHEDULE_COVERS.map(c => [c, new Map<string, number>()])) as Record<ScheduleCover, Map<string, number>>
  const anyPlans = members.some(m => m.plans && Object.keys(m.plans).length)
  for (const m of members) for (const c of SCHEDULE_COVERS) { const v = anyPlans ? planValue(m.plans?.[c]) : ALL; if (v) out[c].set(v, (out[c].get(v) ?? 0) + 1) }
  const sorted = (m: Map<string, number>) => [...m].map(([value, people]) => ({ value, people })).sort((a, b) => (Number(a.value) || 999) - (Number(b.value) || 999) || a.value.localeCompare(b.value))
  return Object.fromEntries(SCHEDULE_COVERS.map(c => [c, sorted(out[c])])) as Record<ScheduleCover, { value: string; people: number }[]>
}

/** Life cover a census writes as a number: up to 60 is a multiple of monthly salary (12, 24, 36), above is a sum. */
export const lifeOf = (value: string): LifeFacts | null => { const n = Number(value.replace(/[^0-9.]/g, '')); return !n ? null : n <= 60 ? { kind: 'multiple', n } : { kind: 'sum', n } }

export const SUM_STEPS = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000]
/** The sum a rate card sells nearest to `n`, capped at the largest; null for none. */
export const sumStep = (n: number | null): number | null => n == null || n <= 0 ? null : SUM_STEPS.reduce((best, s) => Math.abs(s - n) < Math.abs(best - n) ? s : best, SUM_STEPS[0])

/** A person's current cover, as numbers. Null when their hospital plan is not scheduled. */
export function memberSpec(m: Member, s: Schedule): (CustomSpec & { foreignWorker: boolean }) | null {
  // A census with no plan columns has one plan for everyone, scheduled under '*'.
  const pick = (c: ScheduleCover) => planValue(m.plans?.[c]) ?? (m.plans && Object.keys(m.plans).length ? null : ALL)
  const ghsV = pick('GHS')
  const ghs = ghsV ? s.GHS[ghsV] : null
  if (!ghs) return null
  const val = <T>(c: ScheduleCover, map: Record<string, T | null>): T | null => { const v = pick(c); return v ? map[v] ?? null : null }
  const life = val('GTL', s.GTL)
  const gtl = !life || m.relationship !== 'self' ? null : life.kind === 'sum' ? sumStep(life.n) : m.salary ? sumStep(life.n * m.salary) : null
  return {
    hospital: ghs.hospital, beds: ghs.beds, limitKind: ghs.limitKind, limit: ghs.limit, coins: ghs.coins,
    gmm: val('EMM', s.EMM), gpCopay: val('GOPC', s.GOPC), spLimit: val('GOSC', s.GOSC), gdLimit: val('GD', s.GD),
    gtl, gci: null, pa: null, deps: 'medical', foreignWorker: !!ghs.foreignWorker,
  }
}

/** One change applied to every person's current cover. Null when the change does not apply to this spec. */
export type Change = { key: string; name: string; group: 'Current' | 'Bed count' | 'Hospital type' | 'Limit' | 'Co-insurance' | 'Major medical' | 'Sum insured'; apply: (s: CustomSpec) => CustomSpec | null }

const PER_STAY = [15_000, 20_000, 25_000, 30_000]
const ANNUAL = [30_000, 60_000, 80_000, 150_000, 200_000, 250_000, 300_000]
const step = (list: number[], v: number, d: 1 | -1) => { const i = list.findIndex(x => x >= v); const at = i < 0 ? list.length - 1 : i; const j = at + d; return j >= 0 && j < list.length && list[j] !== v ? list[j] : null }

export const CHANGES: Change[] = [
  { key: 'current', name: 'Current cover', group: 'Current', apply: s => s },
  { key: 'beds_more', name: 'One more bed per ward', group: 'Bed count', apply: s => s.beds === 4 ? null : { ...s, beds: s.beds === 1 ? (s.hospital === 'private' ? 2 : 4) : 4 } },
  { key: 'beds_fewer', name: 'One fewer bed per ward', group: 'Bed count', apply: s => s.beds === 1 ? null : { ...s, beds: s.beds === 4 ? (s.hospital === 'private' ? 2 : 1) : 1 } },
  { key: 'type', name: 'Switch hospital type', group: 'Hospital type', apply: s => ({ ...s, hospital: s.hospital === 'private' ? 'government' : 'private', beds: s.hospital === 'private' && s.beds === 2 ? 1 : s.beds }) },
  { key: 'limit_down', name: 'Limit one step down', group: 'Limit', apply: s => { const v = step(s.limitKind === 'annual' ? ANNUAL : PER_STAY, s.limit, -1); return v ? { ...s, limit: v } : null } },
  { key: 'limit_up', name: 'Limit one step up', group: 'Limit', apply: s => { const v = step(s.limitKind === 'annual' ? ANNUAL : PER_STAY, s.limit, 1); return v ? { ...s, limit: v } : null } },
  { key: 'annual', name: 'Annual limit S$200,000 instead of per stay', group: 'Limit', apply: s => s.limitKind === 'annual' ? null : { ...s, limitKind: 'annual', limit: 200_000, gmm: null } },
  { key: 'coins', name: '20% co-insurance', group: 'Co-insurance', apply: s => s.coins === 20 ? null : { ...s, coins: 20 } },
  { key: 'gmm_off', name: 'Major medical removed', group: 'Major medical', apply: s => s.gmm ? { ...s, gmm: null } : null },
  { key: 'gmm_on', name: 'Major medical S$60,000 added where missing', group: 'Major medical', apply: s => s.gmm || s.limitKind === 'annual' ? null : { ...s, gmm: 60_000 } },
  { key: 'life_down', name: 'Life cover one step down', group: 'Sum insured', apply: s => { if (!s.gtl) return null; const i = SUM_STEPS.indexOf(s.gtl); return i > 0 ? { ...s, gtl: SUM_STEPS[i - 1] } : null } },
  { key: 'life_up', name: 'Life cover one step up', group: 'Sum insured', apply: s => { if (!s.gtl) return null; const i = SUM_STEPS.indexOf(s.gtl); return i >= 0 && i < SUM_STEPS.length - 1 ? { ...s, gtl: SUM_STEPS[i + 1] } : null } },
]

/** People grouped by identical numbers: one engine category each. A change maps each group's numbers; foreign workers keep theirs. */
export function groupsFor(members: Member[], s: Schedule, change: Change): { key: string; spec: CustomSpec; foreignWorker: boolean; members: Member[] }[] | null {
  const groups = new Map<string, { key: string; spec: CustomSpec; foreignWorker: boolean; members: Member[] }>()
  let changed = false
  for (const m of members) {
    const base = memberSpec(m, s)
    if (!base) continue
    const { foreignWorker, ...cur } = base
    const next = foreignWorker ? cur : change.apply(cur)
    const spec = next ?? cur
    if (next && JSON.stringify(next) !== JSON.stringify(cur)) changed = true
    const key = `${foreignWorker ? 'FW · ' : ''}${JSON.stringify(spec)}`
    const g = groups.get(key) ?? { key, spec, foreignWorker, members: [] }
    g.members.push(m); groups.set(key, g)
  }
  if (change.key !== 'current' && !changed) return null
  return [...groups.values()]
}

/** People the schedule leaves out: hospital plan not stated. */
export const unscheduled = (members: Member[], s: Schedule) => members.filter(m => !memberSpec(m, s))
