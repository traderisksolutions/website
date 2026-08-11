/**
 * Pricing Matrix — DB-backed benefit-category taxonomy (pm_taxonomy_categories /
 * pm_taxonomy_synonyms, see supabase/migrations/20260812_pm_taxonomy.sql). Shared types +
 * helpers used by the taxonomy manager API routes and, later, by extraction (pm-rules-extract.ts)
 * when resolving a coverage/term's wording into a canonical_category_id.
 */
import { SB_URL, sbH } from '@/lib/pm-storage'

export type TaxonomyCategory = {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_protected: boolean
  status: 'active' | 'archived'
}

export type TaxonomySynonym = {
  id: string
  category_id: string | null
  insurer_id: string | null
  calculator_id: string | null
  source: 'coverage' | 'benefit_term'
  term: string
  term_norm: string
  status: 'pending' | 'approved' | 'rejected'
  confidence: 'ai' | 'human'
  created_at: string
  approved_at: string | null
}

/** Mirrors the SQL generated column exactly: lower(regexp_replace(term,'[^a-z0-9]+',' ','g')). */
export function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

export async function fetchActiveCategories(): Promise<TaxonomyCategory[]> {
  const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?status=eq.active&order=sort_order.asc`, { headers: sbH(), cache: 'no-store' })
  return res.ok ? await res.json() : []
}

/** Prompt-ready category list, built at request time from the DB instead of the old hardcoded
 *  pm-canonical-categories.ts constant — extraction always classifies against whatever the
 *  taxonomy manager currently has, no deploy required to add a category. */
export async function activeCategoryPromptList(): Promise<string> {
  return (await fetchActiveCategories()).map(c => c.name).join(', ')
}

export type ExtractedItem = { i: number; source: 'coverage' | 'benefit_term'; term: string; canonical_category?: string }
export type ResolvedCategory = { id: string; name: string }

/**
 * Post-extraction category resolution — replaces the old classify-categories route's job, now
 * folded into the main pipeline. For each extracted coverage/term:
 *   - its AI-guessed `canonical_category` exactly matches an active taxonomy name → resolve
 *     directly (no human step; the model correctly picked from the list it was given).
 *   - otherwise (guess omitted, or drifted from the list) → queue a pending pm_taxonomy_synonyms
 *     row keyed on the item's OWN wording (not the unreliable guess), so a human maps it via the
 *     taxonomy manager. Idempotent: re-extracting the same wording twice does not create a
 *     duplicate or revert an already-approved/rejected mapping (resolution=ignore-duplicates).
 *   - if that wording already has an APPROVED synonym from a prior extraction (this insurer or
 *     another one), resolve it immediately instead of re-queuing — the taxonomy gets more
 *     complete over time without repeat human review of the same wording.
 * Returns a map from item index -> resolved category (or undefined if left pending).
 */
export async function resolveExtractedCategories(
  items: ExtractedItem[], insurerId: string | null, calculatorId: string,
): Promise<Map<number, ResolvedCategory>> {
  const resolved = new Map<number, ResolvedCategory>()
  if (!items.length) return resolved

  const categories = await fetchActiveCategories()
  const byName = new Map(categories.map(c => [c.name.toLowerCase(), c]))

  const toQueue: { i: number; term: string; term_norm: string; source: ExtractedItem['source'] }[] = []
  for (const item of items) {
    const guess = item.canonical_category?.trim()
    const match = guess ? byName.get(guess.toLowerCase()) : undefined
    if (match) { resolved.set(item.i, { id: match.id, name: match.name }); continue }
    toQueue.push({ i: item.i, term: item.term, term_norm: normalizeTerm(item.term), source: item.source })
  }
  if (!toQueue.length) return resolved

  // Idempotent insert: ignore rows that already exist for this (insurer, source, term_norm).
  await fetch(`${SB_URL}/rest/v1/pm_taxonomy_synonyms?on_conflict=insurer_id,source,term_norm`, {
    method: 'POST', headers: sbH('return=minimal,resolution=ignore-duplicates'),
    body: JSON.stringify(toQueue.map(q => ({
      insurer_id: insurerId, calculator_id: calculatorId, source: q.source, term: q.term, status: 'pending', confidence: 'ai',
    }))),
  }).catch(() => {})

  // Pick up any of these wordings that already have an APPROVED mapping (from this insurer or a
  // prior one) — a term_norm's meaning doesn't depend on which calculator surfaced it first.
  const norms = Array.from(new Set(toQueue.map(q => q.term_norm)))
  const approvedRes = await fetch(
    `${SB_URL}/rest/v1/pm_taxonomy_synonyms?status=eq.approved&term_norm=in.(${norms.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})&select=term_norm,category_id,pm_taxonomy_categories(name)`,
    { headers: sbH(), cache: 'no-store' },
  )
  const approvedRows: { term_norm: string; category_id: string; pm_taxonomy_categories: { name: string } | null }[] = approvedRes.ok ? await approvedRes.json() : []
  const approvedByNorm = new Map(approvedRows.filter(r => r.pm_taxonomy_categories).map(r => [r.term_norm, { id: r.category_id, name: r.pm_taxonomy_categories!.name }]))
  for (const q of toQueue) {
    const hit = approvedByNorm.get(q.term_norm)
    if (hit) resolved.set(q.i, hit)
  }

  return resolved
}

type RtRow = { id: string; calculator_id: string; coverages: { full_name?: string; canonical_category?: string; canonical_category_id?: string }[] }
type BtRow = { id: string; calculator_id: string; terms: { label?: string; canonical_category?: string; canonical_category_id?: string }[] }

/**
 * Retroactively applies an approved synonym's category to every matching coverage/term across
 * ALL calculators — approving a mapping once fixes every prior occurrence of that exact wording,
 * not only the calculator that first surfaced it. Matches by normalizeTerm() against `full_name`
 * (source='coverage') or `label` (source='benefit_term'); low-volume internal tool, so a full
 * table scan + selective PATCH is simpler and cheap enough to skip a bespoke SQL function.
 */
export async function applySynonymRetroactively(synonym: TaxonomySynonym, categoryName: string): Promise<{ coverages: number; terms: number }> {
  let coverages = 0, terms = 0

  if (synonym.source === 'coverage') {
    const res = await fetch(`${SB_URL}/rest/v1/pm_rate_tables?select=id,calculator_id,coverages`, { headers: sbH(), cache: 'no-store' })
    const rows: RtRow[] = res.ok ? await res.json() : []
    for (const row of rows) {
      let changed = false
      const next = row.coverages.map(c => {
        if (c.full_name && normalizeTerm(c.full_name) === synonym.term_norm) {
          changed = true; coverages++
          return { ...c, canonical_category: categoryName, canonical_category_id: synonym.category_id }
        }
        return c
      })
      if (changed) await fetch(`${SB_URL}/rest/v1/pm_rate_tables?id=eq.${row.id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ coverages: next }) })
    }
  } else {
    const res = await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?select=id,calculator_id,terms`, { headers: sbH(), cache: 'no-store' })
    const rows: BtRow[] = res.ok ? await res.json() : []
    for (const row of rows) {
      let changed = false
      const next = row.terms.map(t => {
        if (t.label && normalizeTerm(t.label) === synonym.term_norm) {
          changed = true; terms++
          return { ...t, canonical_category: categoryName, canonical_category_id: synonym.category_id }
        }
        return t
      })
      if (changed) await fetch(`${SB_URL}/rest/v1/pm_benefit_terms?id=eq.${row.id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ terms: next }) })
    }
  }

  return { coverages, terms }
}
