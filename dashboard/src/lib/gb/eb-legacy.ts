/**
 * The older quotations (gb_quotations) re-priced by the /eb builder (Jarod, 20 Nov 2026). Pure: the
 * census, today's cover per category and the inputs priceDesign takes, read from one gb_quotations
 * row. scripts/eb-reprice-legacy.ts does the reads, the pricing and the writes.
 *
 *   legacyMembers(census)       the people on the quotation, bounded
 *   threadOf(notes)             the thread a quotation came from, "[thread:<uuid>]" in its notes
 *   scheduleTiers(s, members)   today's tiers from the schedule a broker confirmed, by the plan most employees hold
 *   legacyInput(row)            categories, today, design, insurer, dates; or the reason it cannot be priced
 *   pickedPlans(priced)         the plan the builder matched per category, product and cover
 *
 * Today's cover per category, first found wins: last year's policy, the confirmed schedule, the
 * census plan text. The design priced is today's cover; a cover today does not state takes the
 * /eb default. No model is called.
 */
import type { Member } from '@/lib/gb-quote'
import type { Schedule, ScheduleCover } from './current'
import { ALL, planValue } from './current'
import type { CategoryFacts, LastYear, LastYearCategory } from './last-year'
import {
  censusCategories, DEFAULT_DESIGN, MAX_CATEGORIES, TIERS, tiersFromFacts, todayFromLastYear,
  type CensusCategory, type CoverKey, type Design, type Priced,
} from './eb-quote'

export type LegacyRow = {
  id: string; company_name: string | null; effective_date: string | null; basis: string | null
  census: unknown; requirement: Record<string, unknown> | null; notes: string | null
}
export type TodaySource = 'last year' | 'schedule' | 'census plan' | 'default'
export type LegacyInput = {
  company: string; effectiveDate: string; basis: 'renewal' | 'new_business'; currentInsurer: string | null
  members: Member[]
  categories: (CensusCategory & { design: Design; today: Partial<Design>; source: TodaySource })[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const str = (v: unknown, n = 160) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

/** The people on a quotation's census, bounded. Rows without a name or a relationship are kept as employees. */
export function legacyMembers(census: unknown): Member[] {
  if (!Array.isArray(census)) return []
  return census.slice(0, 5000).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const o = raw as Record<string, unknown>
    const plans = o.plans && typeof o.plans === 'object' ? Object.fromEntries(Object.entries(o.plans as Record<string, unknown>).map(([k, v]) => [k.slice(0, 12), str(v, 40)]).filter(([, v]) => v)) : null
    const age = typeof o.age === 'number' && Number.isFinite(o.age) && o.age >= 0 && o.age < 120 ? Math.floor(o.age) : null
    const salary = typeof o.salary === 'number' && Number.isFinite(o.salary) && o.salary > 0 ? o.salary : null
    return [{
      name: str(o.name, 120), category: str(o.category, 80), relationship: str(o.relationship, 40).toLowerCase() || 'self',
      dob: str(o.dob, 20) || null, age, occupation_class: str(o.occupation_class, 20) || null, entity: str(o.entity, 80) || null,
      plans: plans && Object.keys(plans).length ? plans : null, salary,
    }]
  })
}

/** The thread a quotation came from: "[thread:<uuid>]" in its notes. */
export function threadOf(notes: string | null | undefined): string | null {
  const m = String(notes ?? '').match(/\[thread:([0-9a-f-]{36})\]/i)
  return m && UUID.test(m[1]) ? m[1].toLowerCase() : null
}

const COVER_OF: Partial<Record<ScheduleCover, 'EMM' | 'GOSC' | 'GD'>> = { EMM: 'EMM', GOSC: 'GOSC', GD: 'GD' }

/**
 * Today's tiers from a confirmed schedule: per cover, the plan most of these employees hold (or the
 * one plan, '*', on a census with no plan columns), read as numbers and matched to the nearest tier.
 * A cover the schedule marks as not held is None; a cover it does not state stays unset.
 */
export function scheduleTiers(s: Partial<Schedule>, members: Member[]): Partial<Design> {
  const employees = members.filter(m => m.relationship === 'self')
  const ms = employees.length ? employees : members
  const anyPlans = ms.some(m => m.plans && Object.keys(m.plans).length)
  const held = (c: ScheduleCover): { known: boolean; value: unknown } => {
    const map = s[c] as Record<string, unknown> | undefined
    if (!map) return { known: false, value: null }
    let key: string | null = ALL
    if (anyPlans) {
      const counts = new Map<string, number>()
      for (const m of ms) { const v = planValue(m.plans?.[c]); if (v) counts.set(v, (counts.get(v) ?? 0) + 1) }
      key = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      if (!key) return { known: true, value: null }           // nobody holds a plan of this cover
    }
    return key in map ? { known: true, value: map[key] } : { known: false, value: null }
  }
  const ghs = held('GHS').value as Schedule['GHS'][string] | null
  const facts: CategoryFacts = {
    hospital: ghs?.hospital ?? null, beds: ghs?.beds ?? null, limitKind: ghs?.limitKind ?? null, limit: ghs?.limit ?? null, coins: ghs?.coins ?? null,
    gmm: null, gpCopay: null, spLimit: null, dentalLimit: null, life: null, pa: null,
  }
  // tiersFromFacts reads a cover missing from `plans` as not held; unknown covers are listed so they stay unset.
  const plans: LastYearCategory['plans'] = { GPA: 'unknown' }
  for (const [c, f] of [['EMM', 'gmm'], ['GOPC', 'gpCopay'], ['GOSC', 'spLimit'], ['GD', 'dentalLimit']] as const) {
    const h = held(c)
    const v = typeof h.value === 'number' && Number.isFinite(h.value) ? h.value : null
    facts[f] = v
    const lc = COVER_OF[c]
    if (lc && (!h.known || v != null)) plans[lc] = 'held'
  }
  return tiersFromFacts(facts, plans)
}

const lastYearOf = (r: Record<string, unknown> | null): LastYear | null => {
  const ly = r?.last_year as LastYear | null | undefined
  return ly && typeof ly === 'object' && Array.isArray(ly.categories) && ly.categories.length ? ly : null
}
const scheduleOf = (r: Record<string, unknown> | null): Partial<Schedule> | null => {
  const s = r?.current_schedule
  return s && typeof s === 'object' && Object.keys(s).length ? s as Partial<Schedule> : null
}
const hasTiers = (d: Partial<Design> | undefined): d is Partial<Design> => !!d && Object.keys(d).length > 0

/** What the builder needs to price one older quotation, or why it cannot be priced. */
export function legacyInput(row: LegacyRow): { input: LegacyInput | null; problems: string[] } {
  const problems: string[] = []
  const company = str(row.company_name, 200)
  const members = legacyMembers(row.census)
  const effectiveDate = row.effective_date && ISO.test(row.effective_date.slice(0, 10)) ? row.effective_date.slice(0, 10) : null
  if (!company) problems.push('no company name')
  if (!members.length) problems.push('no census on the quotation')
  if (!effectiveDate) problems.push('no effective date')
  if (problems.length) return { input: null, problems }

  const req = row.requirement && typeof row.requirement === 'object' ? row.requirement : null
  const ly = lastYearOf(req), schedule = scheduleOf(req)
  const cats = censusCategories(members)
  const fromLy = ly ? todayFromLastYear(ly, cats.map(c => c.name)) : {}
  const categories = cats.map(c => {
    let today: Partial<Design> = {}, source: TodaySource = 'default'
    if (hasTiers(fromLy[c.name])) { today = fromLy[c.name]; source = 'last year' }
    else if (schedule && hasTiers(scheduleTiers(schedule, c.members))) { today = scheduleTiers(schedule, c.members); source = 'schedule' }
    else if (hasTiers(c.today)) { today = c.today; source = 'census plan' }
    const design = { ...DEFAULT_DESIGN, ...today } as Design
    return { ...c, today, design, source }
  })
  if (categories.length > MAX_CATEGORIES) problems.push(`${categories.length} categories, all priced; /eb prices up to ${MAX_CATEGORIES}`)
  const unaged = members.filter(m => !m.dob && m.age == null).length
  if (unaged) problems.push(`${unaged} of ${members.length} lives have no date of birth or age`)
  const currentInsurer = str(req?.current_insurer, 80) || str(ly?.insurer, 80) || null
  return {
    input: { company, effectiveDate: effectiveDate!, basis: row.basis === 'new_business' ? 'new_business' : 'renewal', currentInsurer, members, categories },
    problems,
  }
}

/** The plan the builder matched per category, product and cover, as /eb starts its picks. */
export function pickedPlans(priced: Priced): Record<string, Record<string, Record<CoverKey, string>>> {
  return Object.fromEntries(priced.categories.map(c => [c.name, Object.fromEntries(priced.products.map(p => [p,
    Object.fromEntries(TIERS.map(t => [t.key, c.products[p]?.[t.key]?.pick ?? ''])) as Record<CoverKey, string>,
  ]))]))
}
