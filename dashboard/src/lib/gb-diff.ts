/**
 * Group Benefits — structured wording diff (Sales Loop v2, Phase 6c). Ported from
 * pm-diff.ts's diffBenefitTerms + pm-benefits-extract.ts's termKey, adapted to GbBenefit's
 * shape — pure, deterministic, no AI, no I/O.
 *
 * gb_benefits rows are deleted and re-inserted on every re-extraction (extract/route.ts), so
 * there's no stored history to diff against later — the caller must snapshot the "before" rows
 * itself, right before the delete, and pass both sides to diffBenefits() in the same request.
 */
import type { GbBenefit } from '@/lib/gb-extract'

export type DiffEntry = { path: string; from: unknown; to: unknown }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Same term identity as pm-benefits-extract.ts's termKey — plan + category + name, normalized,
 *  so "Room & Board" vs "room and board" (re-extraction wording jitter) still counts as the same
 *  term, and only a genuine VALUE change surfaces as a diff. */
export const benefitKey = (b: Pick<GbBenefit, 'plan_code' | 'category' | 'benefit_name'>) =>
  `${norm(b.plan_code)}|${norm(b.category)}|${norm(b.benefit_name)}`

/** Every added/removed/changed benefit term between two gb_benefits snapshots for the same
 *  rate_table_id (before a re-extraction's delete, and after its insert). */
export function diffBenefits(before: GbBenefit[] | null | undefined, after: GbBenefit[] | null | undefined): DiffEntry[] {
  const out: DiffEntry[] = []
  const beforeByKey = new Map((before ?? []).map(b => [benefitKey(b), b]))
  const afterByKey  = new Map((after ?? []).map(b => [benefitKey(b), b]))
  for (const key of Array.from(new Set([...Array.from(beforeByKey.keys()), ...Array.from(afterByKey.keys())]))) {
    const b = beforeByKey.get(key), a = afterByKey.get(key)
    const label = `${(a ?? b)!.category ?? 'General'} — ${(a ?? b)!.benefit_name}`
    if (!b) { out.push({ path: label, from: null, to: a!.value_text ?? a!.value_numeric ?? null }); continue }
    if (!a) { out.push({ path: label, from: b.value_text ?? b.value_numeric ?? null, to: null }); continue }
    const bv = b.value_text ?? b.value_numeric ?? null
    const av = a.value_text ?? a.value_numeric ?? null
    if (bv !== av) out.push({ path: label, from: bv, to: av })
  }
  return out
}
