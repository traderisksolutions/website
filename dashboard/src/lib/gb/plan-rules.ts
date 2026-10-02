/**
 * Choosing an insurer's plan tier from a stated requirement, by rule.
 *
 * What a broker asks for is structured: a ward and a hospital type for hospital cover, a sum
 * assured for life and accident cover, entry or top tier for outpatient and dental. Every insurer's
 * tiers carry those same facts (gb_plans, the plan code itself, or the benefit schedule), so the
 * match is a lookup, not a judgement. It costs nothing, gives the same answer every time, and
 * says when it had to settle for the closest tier instead of an exact one.
 *
 * Within an exact match, the entry tier wins: QBE sells four "Private 1-bedded" plans that differ
 * by annual limit, and a first price is quoted on the plan that meets the brief at the lowest cost.
 *
 * Pure. No I/O.
 */

export type Hospital = 'private' | 'government'
export type Tier = 'entry' | 'top'

export type CoverSpec = {
  code: string
  hospital?: Hospital | null
  /** Beds per ward: 1, 2 or 4. */
  ward?: number | null
  coPay?: boolean | null
  sumAssured?: number | null
  tier?: Tier | null
  /** Price the same tier as the client's current plan at this insurer ("AIA Plan 1"). */
  sameAs?: { insurer: string; plan: string } | null
  /** The requirement as the client put it, kept for the notes. */
  note?: string | null
}

export type OfferedPlan = {
  plan_code: string
  label: string
  hospital: Hospital | null
  ward: number | null
  coPay: boolean | null
  sumAssured: number | null
  /** Mean premium across the plan's rate rows — orders tiers by cost, nothing more. */
  avgRate: number | null
}

export type PlanChoice = { plan_code: string; exact: boolean; why: string }

const HOSPITAL_COVERS = ['GHS', 'GHS_FW', 'EMM']
const SUM_COVERS = ['GTL', 'GCI', 'GPA', 'GADD']

export const isHospitalCover = (c: string) => HOSPITAL_COVERS.includes(c)
export const isSumCover = (c: string) => SUM_COVERS.includes(c)

/** What a cover is priced at when the request says nothing: private 1-bed with no co-payment
 *  for hospital cover (the common Singapore SME standard), the entry tier for everything else. */
export function defaultSpec(code: string): CoverSpec {
  if (code === 'GHS' || code === 'EMM') return { code, hospital: 'private', ward: 1, coPay: false }
  if (code === 'GHS_FW') return { code, coPay: false }
  if (isSumCover(code)) return { code, tier: 'entry' }
  return { code, tier: 'entry', coPay: false }
}

/** Fill what the request left out from the default, field by field. */
export function withDefaults(spec: CoverSpec): CoverSpec {
  const d = defaultSpec(spec.code)
  const pick = <T>(v: T | null | undefined, dv: T | null | undefined) => (v === undefined || v === null ? dv ?? null : v)
  return {
    ...spec,
    hospital: pick(spec.hospital, d.hospital), ward: pick(spec.ward, d.ward), coPay: pick(spec.coPay, d.coPay),
    tier: spec.sumAssured != null ? spec.tier ?? null : pick(spec.tier, d.tier),
  }
}

export function describeSpec(spec: CoverSpec): string {
  if (spec.sameAs) return `same tier as ${spec.sameAs.insurer} ${spec.sameAs.plan}`
  const parts: string[] = []
  if (spec.hospital) parts.push(spec.hospital === 'private' ? 'Private hospital' : 'Government restructured hospital')
  if (spec.ward) parts.push(`${spec.ward}-bed ward`)
  if (spec.sumAssured) parts.push(`S$${spec.sumAssured.toLocaleString('en-SG')} sum assured`)
  if (spec.tier && !spec.sumAssured) parts.push(spec.tier === 'entry' ? 'entry tier' : 'top tier')
  if (spec.coPay != null && !isSumCover(spec.code)) parts.push(spec.coPay ? 'with co-payment' : 'no co-payment')
  return parts.join(', ') || 'entry tier'
}

// ── Reading plan facts from the text insurers print ──────────────────────────────────────────

export function parseWard(text: string | null | undefined): number | null {
  const t = String(text ?? '')
  // "1 or 4 Bedded" names two wards; it is not one.
  if (/\d\s*or\s*\d\s*-?\s*bed/i.test(t)) return null
  const m = t.match(/(\d)\s*-?\s*bed/i)
  if (m) return Number(m[1])
  if (/\bsingle\b|\bclass\s*a\b/i.test(t)) return 1
  return null
}

export function parseHospital(text: string | null | undefined): Hospital | null {
  const t = String(text ?? '')
  const priv = /\bpriv|\bpte\b/i.test(t)
  const gov = /gov|restr|\bgrh\b|\brh\b/i.test(t)
  if (priv && !gov) return 'private'
  if (gov && !priv) return 'government'
  return null
}

/** "$50k", "S$500,000", "50,000", "($1m)". The largest amount wins when several are printed. */
export function parseSum(text: string | null | undefined): number | null {
  const t = String(text ?? '')
  const amounts = Array.from(t.matchAll(/(?:s?\$\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?\b/gi))
    .map(m => {
      const n = Number(m[1].replace(/,/g, ''))
      const mult = (m[2] ?? '').toLowerCase() === 'm' ? 1_000_000 : (m[2] ?? '').toLowerCase() === 'k' ? 1_000 : 1
      return n * mult
    })
    .filter(n => n >= 1_000)
  return amounts.length ? Math.max(...amounts) : null
}

export function parseCoPay(text: string | null | undefined): boolean | null {
  const t = String(text ?? '').trim()
  if (!t) return null
  if (/^\s*(nil|none|no\b|0\s*%)/i.test(t) || /no\s*co-?pay/i.test(t)) return false
  // AIA's "GP COPAY S$0 + SP": a zero co-payment is none.
  if (/co-?pay\s*s?\$\s*0\b/i.test(t)) return false
  if (/co-?pay|co-?ins|\b[1-9]\d?\s*%|s?\$\s*[1-9]/i.test(t)) return true
  return null
}

// ── Choosing ─────────────────────────────────────────────────────────────────────────────────

const cheapestFirst = (a: OfferedPlan, b: OfferedPlan) =>
  (a.avgRate ?? Infinity) - (b.avgRate ?? Infinity) || a.plan_code.localeCompare(b.plan_code)
const dearestFirst = (a: OfferedPlan, b: OfferedPlan) =>
  (b.avgRate ?? -Infinity) - (a.avgRate ?? -Infinity) || a.plan_code.localeCompare(b.plan_code)

const WARD_STEP: Record<number, number> = { 1: 0, 2: 1, 4: 2, 6: 3 }
const wardGap = (a: number | null, b: number | null) =>
  a == null || b == null ? 3 : Math.abs((WARD_STEP[a] ?? 3) - (WARD_STEP[b] ?? 3))

export function matchPlan(input: CoverSpec, offered: OfferedPlan[]): PlanChoice | null {
  if (!offered.length) return null
  const spec = withDefaults(input)

  if (isHospitalCover(spec.code)) {
    const exact = offered.filter(p =>
      (spec.hospital == null || p.hospital === spec.hospital) &&
      (spec.ward == null || p.ward === spec.ward) &&
      (spec.coPay == null || (p.coPay ?? false) === spec.coPay))
    if (exact.length) {
      const p = [...exact].sort(spec.tier === 'top' ? dearestFirst : cheapestFirst)[0]
      return { plan_code: p.plan_code, exact: true, why: p.label }
    }
    // Closest: hospital type matters most, then ward, then co-payment; cost breaks ties.
    const gap = (p: OfferedPlan) =>
      (spec.hospital && p.hospital !== spec.hospital ? 4 : 0) +
      (spec.ward ? wardGap(p.ward, spec.ward) : 0) +
      (spec.coPay != null && (p.coPay ?? false) !== spec.coPay ? 2 : 0)
    const p = [...offered].sort((a, b) => gap(a) - gap(b) || cheapestFirst(a, b))[0]
    return { plan_code: p.plan_code, exact: false, why: `closest: ${p.label}` }
  }

  if (isSumCover(spec.code)) {
    const known = offered.filter(p => p.sumAssured != null)
    if (!known.length) {
      const p = [...offered].sort(spec.tier === 'top' ? dearestFirst : cheapestFirst)[0]
      return { plan_code: p.plan_code, exact: false, why: `sum assured not on record; ${spec.tier === 'top' ? 'dearest' : 'cheapest'} tier ${p.label}` }
    }
    const bySum = [...known].sort((a, b) => a.sumAssured! - b.sumAssured! || cheapestFirst(a, b))
    if (spec.sumAssured == null) {
      const p = spec.tier === 'top' ? bySum[bySum.length - 1] : bySum[0]
      return { plan_code: p.plan_code, exact: true, why: `S$${p.sumAssured!.toLocaleString('en-SG')}` }
    }
    const hit = bySum.find(p => p.sumAssured === spec.sumAssured)
    if (hit) return { plan_code: hit.plan_code, exact: true, why: `S$${hit.sumAssured!.toLocaleString('en-SG')}` }
    // Meet or exceed before falling short: under-insuring is the worse error.
    const p = bySum.find(x => x.sumAssured! > spec.sumAssured!) ?? bySum[bySum.length - 1]
    return { plan_code: p.plan_code, exact: false, why: `closest: S$${p.sumAssured!.toLocaleString('en-SG')}` }
  }

  // Outpatient and dental: by co-payment, then entry or top tier by cost.
  const pool = spec.coPay == null ? offered : offered.filter(p => (p.coPay ?? false) === spec.coPay)
  const from = pool.length ? pool : offered
  const p = [...from].sort(spec.tier === 'top' ? dearestFirst : cheapestFirst)[0]
  return { plan_code: p.plan_code, exact: pool.length > 0, why: `${spec.tier === 'top' ? 'top' : 'entry'} tier ${p.label}` }
}
