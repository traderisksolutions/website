// Search Console rows → a ranked list of work. For every non-brand query the question is the
// same: does a page of ours already rank for it, and how well? Three answers, three kinds of work:
//
//   snippet  ranks on page one but earns fewer clicks than its position should. Rewrite the
//            title and description to match the query.
//   depth    ranks on page two (11 to 20). Strengthen the existing page: answer the query under
//            its own heading and link to it internally.
//   write    nothing of ours ranks inside 20. A new article, with the query as its brief.
//
// A second article for a query we already rank for splits authority, so "write" is last. Pure.
import type { GscAction } from '../types'

export type QueryPageRow = { query: string; page: string; impressions: number; clicks: number; ctr: number; position: number }

// Approximate organic click-through by position, at the conservative end of published curves.
const CTR_BY_POSITION = [0.28, 0.15, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.028, 0.025]

export function expectedCtr(position: number): number {
  if (position <= 1) return CTR_BY_POSITION[0]
  if (position > 20) return 0.002
  if (position > 10) return 0.01
  const lo = Math.floor(position), hi = Math.ceil(position)
  const a = CTR_BY_POSITION[lo - 1], b = CTR_BY_POSITION[Math.min(hi, 10) - 1]
  return a + (b - a) * (position - lo)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function isBrandQuery(query: string, brandTerms: string[]): boolean {
  const q = query.toLowerCase()
  return brandTerms.some(t => t.trim() && new RegExp(`(^|[^a-z])${escapeRe(t.toLowerCase().trim())}([^a-z]|$)`).test(q))
}

export function classifyQueries(rows: QueryPageRow[], opts: { brandTerms: string[]; minImpressions?: number; minExpectedClicks?: number }): GscAction[] {
  const minImpr = opts.minImpressions ?? 10
  const minExpected = opts.minExpectedClicks ?? 2
  const byQuery = new Map<string, { impressions: number; clicks: number; best: QueryPageRow }>()
  for (const r of rows) {
    if (!r.query || isBrandQuery(r.query, opts.brandTerms)) continue
    const cur = byQuery.get(r.query)
    if (!cur) byQuery.set(r.query, { impressions: r.impressions, clicks: r.clicks, best: r })
    else { cur.impressions += r.impressions; cur.clicks += r.clicks; if (r.position < cur.best.position) cur.best = r }
  }
  const actions: GscAction[] = []
  for (const [query, q] of Array.from(byQuery.entries())) {
    if (q.impressions < minImpr) continue
    const pos = q.best.position
    const expected = q.impressions * expectedCtr(pos)
    let kind: GscAction['kind'] | null = null
    if (pos <= 10) { if (expected >= minExpected && q.clicks < expected * 0.5) kind = 'snippet' }
    else if (pos <= 20) kind = 'depth'
    else kind = 'write'
    if (!kind) continue
    actions.push({ kind, query, page: kind === 'write' ? null : q.best.page, impressions: q.impressions, clicks: q.clicks, position: Number(pos.toFixed(1)), expectedClicks: Number(expected.toFixed(1)), score: Math.round(q.impressions * (kind === 'snippet' ? 1.5 : kind === 'depth' ? 1.0 : 0.6)) })
  }
  return actions.sort((a, b) => b.score - a.score)
}

/** Impression-weighted average position: what Search Console itself reports. */
export function weightedPosition(rows: { impressions: number; position: number }[]): number {
  const impr = rows.reduce((s, r) => s + r.impressions, 0)
  if (impr === 0) return 0
  return Number((rows.reduce((s, r) => s + r.impressions * r.position, 0) / impr).toFixed(1))
}
