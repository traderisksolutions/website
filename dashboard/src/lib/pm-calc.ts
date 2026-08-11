/**
 * Pricing Matrix v2 — the quote engine.
 *
 * Pure TypeScript, no network call, no AI, no Python. Prices a census against one insurer's
 * approved RateTable: looks up each life's rate by (coverage × selected plan × age band ×
 * member type), applies the insurer's rules (group-size loading, quote-basis exclusions, GST),
 * and assembles the same InsurerResult shape the rest of the app (export/reply/recommend/
 * comparison UI) already consumes.
 */
import type { RateTable } from '@/lib/pm-rates'
import { bandContains, coverageCodes, coverageFor } from '@/lib/pm-rates'
import { buildMembers, toInsurerResult } from '@/lib/pm-quote'
import type { CensusMember, Selection, CategoryOverrides, InsurerResult, RunMember, EngineMember, QuoteAudit } from '@/lib/pm-quote'
import type { RuleStep } from '@/lib/pm-rules-extract'
import { runComputationRules } from '@/lib/pm-compute-rules'

export { coverageFor } from '@/lib/pm-rates'

export type CalcGlobals = { effective_date?: string | null; quote_basis?: 'new_business' | 'renewal' }

const round2 = (v: number) => Math.round(v * 100) / 100

/** Standard "age today" calc (Age Last Birthday) as of a given date. */
function ageLastBirthday(dob: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dob.getFullYear()
  const hadBirthday = asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate())
  if (!hadBirthday) age--
  return age
}

export function ageForBasis(member: Pick<EngineMember, 'date_of_birth' | 'age'>, basis: RateTable['age_basis'], asOf: Date): number | null {
  if (member.date_of_birth) {
    const dob = new Date(member.date_of_birth)
    if (!isNaN(dob.getTime())) {
      const alb = ageLastBirthday(dob, asOf)
      return basis === 'ANB' ? alb + 1 : alb
    }
  }
  return member.age ?? null
}

function loadingPctFor(rt: RateTable, headcount: number): number {
  for (const b of rt.rules.group_size_loading ?? []) {
    if (headcount >= b.min && (b.max === null || headcount <= b.max)) return b.loading_pct
  }
  return 0
}

/** Price one member's selection for one coverage code, or null if not ratable (no selection,
 *  no age, no matching band/plan cell, or excluded by the quote basis). */
function priceLine(rt: RateTable, code: string, m: EngineMember, age: number | null, basis: 'new_business' | 'renewal'): number | null {
  const planCode = m.coverage[code]?.plan
  if (!planCode || age === null) return null
  const cov = coverageFor(rt, code, m.category)
  if (!cov) return null
  const row = cov.rates.find(r => bandContains(r.band, age))
  if (!row) return null
  const excluded = basis === 'renewal' ? rt.rules.quote_basis_exclusions?.renewal : rt.rules.quote_basis_exclusions?.new_business
  if (excluded?.includes(row.band)) return null
  const v = row.by_plan?.[planCode]
  if (typeof v !== 'number') return null

  const gst = rt.rules.gst
  return gst?.inclusive && gst.rate > 0 ? round2(v / (1 + gst.rate)) : round2(v)
}

/** Compute one insurer's InsurerResult for a census — the sole source of every quoted number.
 *  `computationRules`, when given a non-empty approved rule set (pm_computation_rules.rules — see
 *  pm-rules-extract.ts/pm-compute-rules.ts), REPLACES the flat age-band lookup + external loading/
 *  GST below with the calculator's own translated calculation logic; every calculator without one
 *  (still the common case — most are genuinely just a flat rate grid) runs exactly as before. */
export function computeInsurerQuote(
  calculator_id: string, insurer_name: string, effective_date: string | null,
  rt: RateTable, census: CensusMember[], selection: Selection, globals: CalcGlobals,
  categoryOverrides?: CategoryOverrides, computationRules?: RuleStep[],
): InsurerResult {
  const codes = Array.from(new Set(rt.coverages.map(c => c.code)))
  const members = buildMembers(census, selection, codes, categoryOverrides)
  const asOf = globals.effective_date ? new Date(globals.effective_date) : new Date()
  const basis = globals.quote_basis ?? 'new_business'
  const usingRules = !!computationRules?.length
  const loadingPct = usingRules ? 0 : loadingPctFor(rt, members.length)
  const excludes = new Set(rt.rules.loading_excludes ?? [])

  const runMembers: RunMember[] = members.map((m, i) => {
    const age = ageForBasis(m, rt.age_basis, asOf)
    let lines: Record<string, number | null> = {}
    if (usingRules && age !== null) {
      lines = runComputationRules(computationRules!, rt, { age, category: m.category, selection: m.coverage, headcount: members.length })
    } else {
      for (const code of codes) {
        const base = priceLine(rt, code, m, age, basis)
        if (base == null) continue
        lines[code] = loadingPct && !excludes.has(code) ? round2(base * (1 + loadingPct / 100)) : base
      }
    }
    const subtotal = round2(Object.values(lines).reduce<number>((s, v) => s + (v ?? 0), 0))
    return { row: i + 1, name: m.name, lines, subtotal }
  })

  const by_line: Record<string, number | null> = {}
  for (const code of codes) by_line[code] = round2(runMembers.reduce((s, m) => s + (m.lines[code] ?? 0), 0))
  const grand = round2(runMembers.reduce((s, m) => s + m.subtotal, 0))

  const audit: QuoteAudit = {
    age_basis: rt.age_basis, quote_basis: basis, effective_date: asOf.toISOString().slice(0, 10), headcount: members.length,
    loading: loadingPct ? { pct: loadingPct, excluded_codes: Array.from(excludes) } : null,
    gst: rt.rules.gst ?? null,
    basis_excluded_bands: (basis === 'renewal' ? rt.rules.quote_basis_exclusions?.renewal : rt.rules.quote_basis_exclusions?.new_business) ?? null,
  }

  return toInsurerResult(calculator_id, insurer_name, effective_date, coverageCodes(rt), { members: runMembers, totals: { by_line, grand } }, audit)
}
