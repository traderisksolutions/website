/**
 * Pure, deterministic diffing over two RateTable/BenefitTerm[] snapshots. One diff engine, two
 * call sites: (a) the calculator PATCH route logs a human edit's before/after via logActivity, and
 * (b) approve/route.ts builds the version-over-version "what changed" summary against the insurer's
 * previously-approved calculator. No AI, no I/O — just structural comparison.
 */
import type { RateTable, Coverage, Rules } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'
import { termKey } from '@/lib/pm-benefits-extract'

export type DiffEntry = { path: string; from: unknown; to: unknown }

const covKey = (c: Coverage) => `${c.code}|${c.member_type ?? ''}`

/** Every changed rate cell (coverage x age band x plan), plus age_basis and rule-field changes. */
export function diffRateTable(before: RateTable | null | undefined, after: RateTable | null | undefined): DiffEntry[] {
  const out: DiffEntry[] = []
  if (!before || !after) return out

  if (before.age_basis !== after.age_basis) out.push({ path: 'age_basis', from: before.age_basis, to: after.age_basis })

  const ruleKeys: (keyof Rules)[] = ['group_size_loading', 'loading_excludes', 'quote_basis_exclusions', 'gst']
  for (const k of ruleKeys) {
    const a = JSON.stringify(before.rules?.[k] ?? null), b = JSON.stringify(after.rules?.[k] ?? null)
    if (a !== b) out.push({ path: `rules.${k}`, from: before.rules?.[k] ?? null, to: after.rules?.[k] ?? null })
  }

  const beforeByKey = new Map((before.coverages ?? []).map(c => [covKey(c), c]))
  const afterByKey = new Map((after.coverages ?? []).map(c => [covKey(c), c]))
  for (const key of Array.from(new Set([...Array.from(beforeByKey.keys()), ...Array.from(afterByKey.keys())]))) {
    const b = beforeByKey.get(key), a = afterByKey.get(key)
    const label = a?.full_name ?? b?.full_name ?? key
    if (!b) { out.push({ path: `coverages.${label}`, from: null, to: 'added' }); continue }
    if (!a) { out.push({ path: `coverages.${label}`, from: 'present', to: 'removed' }); continue }

    const rowsBefore = new Map((b.rates ?? []).map(r => [r.band, r.by_plan ?? {}]))
    const rowsAfter = new Map((a.rates ?? []).map(r => [r.band, r.by_plan ?? {}]))
    for (const band of Array.from(new Set([...Array.from(rowsBefore.keys()), ...Array.from(rowsAfter.keys())]))) {
      const pb = rowsBefore.get(band) ?? {}, pa = rowsAfter.get(band) ?? {}
      for (const plan of Array.from(new Set([...Object.keys(pb), ...Object.keys(pa)]))) {
        if (pb[plan] !== pa[plan]) out.push({ path: `coverages.${label}.${band}.${plan}`, from: pb[plan] ?? null, to: pa[plan] ?? null })
      }
    }
  }
  return out
}

/** Every added/removed/changed benefit term, keyed by the same termKey() used to align terms
 *  elsewhere (pm-compare.ts, the review page's resolveTerm). */
export function diffBenefitTerms(before: BenefitTerm[] | null | undefined, after: BenefitTerm[] | null | undefined): DiffEntry[] {
  const out: DiffEntry[] = []
  const beforeByKey = new Map((before ?? []).map(t => [termKey(t), t]))
  const afterByKey = new Map((after ?? []).map(t => [termKey(t), t]))
  for (const key of Array.from(new Set([...Array.from(beforeByKey.keys()), ...Array.from(afterByKey.keys())]))) {
    const b = beforeByKey.get(key), a = afterByKey.get(key)
    const label = `${(a ?? b)!.category} — ${(a ?? b)!.label}`
    if (!b) { out.push({ path: label, from: null, to: a!.value }); continue }
    if (!a) { out.push({ path: label, from: b.value, to: null }); continue }
    if (b.value !== a.value) out.push({ path: label, from: b.value, to: a.value })
  }
  return out
}
