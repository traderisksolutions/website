/**
 * POST /api/pricing-matrix/calculators/[id]/classify-categories
 *
 * One-time (repeatable) sync of `canonical_category` onto an already-extracted calculator's
 * coverages/benefit terms — deliberately separate from .../extract: re-extracting flips status
 * away from 'approved' and fully replaces the rate table (see extract/route.ts), which is the
 * wrong tool when the underlying data is already correct and only needs a category tag. This
 * reads the EXISTING pm_rate_tables/pm_benefit_terms rows (no re-read of the source xlsx/PDF),
 * classifies each coverage/term into the fixed taxonomy (pm-canonical-categories.ts) with one
 * cheap text-only Opus call, and PATCHes canonical_category back onto each array element in
 * place. Never touches pm_calculators.status, never touches code/full_name/category/label.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { logAiUsage }                from '@/lib/gemini-usage'
import { logError }                  from '@/lib/error-log'
import { PM_CANONICAL_CATEGORIES_PROMPT_LIST } from '@/lib/pm-canonical-categories'
import type { Coverage }             from '@/lib/pm-rates'
import type { BenefitTerm }          from '@/lib/pm-benefits-extract'

export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

function extractJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as T } catch { return null }
}

async function classify(
  coverages: { i: number; code: string; full_name: string }[],
  terms: { i: number; category: string; label: string }[],
): Promise<{ coverages: Map<number, string>; terms: Map<number, string> }> {
  const empty = { coverages: new Map<number, string>(), terms: new Map<number, string>() }
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || (!coverages.length && !terms.length)) return empty

  const system = `Classify each item into ONE of these fixed canonical categories: ${PM_CANONICAL_CATEGORIES_PROMPT_LIST}.
Pick the closest match by what the benefit actually IS, not its printed name — insurers word the
same benefit differently (e.g. "Group Outpatient Clinical" / "Group Outpatient Primary Care" /
"Group Outpatient Clinical (GP Outpatient)" are all "Outpatient GP"). "coverages" are top-level rate
lines; "terms" are finer-grained wording facts about one of those lines (e.g. a "Panel" or "Waiting
Period" term about hospitalization is still "Hospital & Surgical", not its own category). Use
"Other" only if truly nothing fits.

Return ONLY this JSON (no prose, no markdown fence):
{ "coverages": [ { "i": <index>, "canonical_category": "<one of the list>" } ],
  "terms": [ { "i": <index>, "canonical_category": "<one of the list>" } ] }`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OPUS, max_tokens: 8000, thinking: { type: 'adaptive' }, system,
      messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ coverages, terms }) }] }],
    }),
  })
  const j = await res.json()
  if (!res.ok) {
    void logError({ source: 'anthropic', feature: 'pm_classify_categories', statusCode: res.status, message: JSON.stringify(j) })
    return empty
  }
  void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_classify_categories', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: {} })
  const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
  const parsed = extractJson<{ coverages?: { i: number; canonical_category: string }[]; terms?: { i: number; canonical_category: string }[] }>(text)
  const out = { coverages: new Map<number, string>(), terms: new Map<number, string>() }
  for (const c of parsed?.coverages ?? []) out.coverages.set(c.i, c.canonical_category)
  for (const t of parsed?.terms ?? []) out.terms.set(t.i, t.canonical_category)
  return out
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [rtRes, termsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${id}&select=coverages&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${id}&select=terms&limit=1`, { headers: sbH(), cache: 'no-store' }),
    ])
    const rtRow = rtRes.ok ? (await rtRes.json())[0] : null
    const termsRow = termsRes.ok ? (await termsRes.json())[0] : null
    const coverages: Coverage[] = rtRow?.coverages ?? []
    const terms: BenefitTerm[] = termsRow?.terms ?? []
    if (!coverages.length && !terms.length) return NextResponse.json({ error: 'No extracted rate table or benefit terms to classify yet' }, { status: 400 })

    const { coverages: covCats, terms: termCats } = await classify(
      coverages.map((c, i) => ({ i, code: c.code, full_name: c.full_name })),
      terms.map((t, i) => ({ i, category: t.category, label: t.label })),
    )

    const newCoverages = coverages.map((c, i) => covCats.has(i) ? { ...c, canonical_category: covCats.get(i) } : c)
    const newTerms = terms.map((t, i) => termCats.has(i) ? { ...t, canonical_category: termCats.get(i) } : t)

    await Promise.all([
      covCats.size ? fetch(`${SB_URL}/rest/v1/pm_rate_tables?calculator_id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ coverages: newCoverages }) }) : Promise.resolve(),
      termCats.size ? fetch(`${SB_URL}/rest/v1/pm_benefit_terms?calculator_id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify({ terms: newTerms }) }) : Promise.resolve(),
    ])

    return NextResponse.json({ ok: true, coverages_classified: covCats.size, terms_classified: termCats.size })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
