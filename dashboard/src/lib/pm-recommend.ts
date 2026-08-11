/**
 * Pricing Matrix — comparison narrative.
 *
 * Opus compares the insurers on PRICE (fixed — from their own calculators, never changed) AND on
 * what each plan selection implies (hospital type, bed, plan tier, co-insurance), weighted by the
 * client's stated priorities (e.g. "private hospital access"). Deliberately NOT a single-winner
 * pick with per-insurer pros/cons lists — this is what differentiates the tool from a bare price
 * table: one continuous narrative that compares all N insurers together (3-5 typical), the way a
 * broker would actually talk a client through the options, with short standout tags per insurer
 * for the at-a-glance view. Numbers are quoted verbatim, never invented.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import type { QuoteResult, Selection } from '@/lib/pm-quote'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type Recommendation = {
  headline: string
  /** One continuous multi-paragraph comparison of every priced insurer together — no declared
   *  winner, no per-insurer pros/cons split. Line breaks (\n\n) separate paragraphs. */
  narrative: string
  /** Short "stands out for X" tags, one per priced insurer, for a scannable summary above the
   *  narrative — not a verdict, just what's distinctive about each option. */
  highlights: { insurer: string; note: string }[]
}

/** Legacy shape (recommendation/rationale/per_insurer), stored before this narrative redesign —
 *  kept only so old quotes can be detected and offered a one-click "Recompute" instead of crashing
 *  the page. Never written going forward. */
export type LegacyRecommendation = {
  recommendation: string
  headline: string
  rationale: string
  per_insurer: { insurer: string; best_for?: string; pros: string[]; cons: string[] }[]
}

/** Compact, model-friendly view of the comparison + each insurer's plan basis. */
function summarise(results: QuoteResult, selections: Record<string, Selection>) {
  return results.insurers.filter(i => !i.error).map(i => ({
    insurer: i.insurer_name,
    total_annual_premium_net: i.grand,
    average_per_life: i.avg_per_life,
    lives: i.member_count,
    by_line: i.coverage_lines.map(l => ({ line: l.label, premium: i.by_line[l.code] ?? null })),
    plan_selection: Object.entries(selections?.[i.calculator_id] ?? {}).map(([code, f]) => ({ line: code, choices: f })),
  }))
}

const SYSTEM = `You are a Singapore group-employee-benefits broker walking a client through a price
comparison produced by each insurer's OWN calculator — the premium numbers are final and correct;
quote them verbatim and NEVER change or invent a number.

Compare the insurers on BOTH total price AND what each plan selection implies about coverage
(hospital type: private vs government; ward/bed type; plan tier / annual limit; co-insurance;
panel vs non-panel). Weight the comparison by the client's stated priorities — if they care about
private-hospital access, spend more of the narrative on how the options differ on THAT, not just
the cheapest headline. If no priorities are given, compare on overall value (cover per dollar).

DO NOT declare a single winner or split insurers into a rigid pros/cons list — write ONE continuous
narrative that discusses all the priced insurers together, the way a broker would actually talk a
client through the options out loud: where they cluster on price, which trade real coverage for a
lower premium, which is worth the extra spend and for what reason, any material gap in what's
covered. It is fine to end with a clear steer if the data genuinely points that way (e.g. "X and Y
are close on price, but Y's private-hospital access make it worth the difference if that matters to
you") — the constraint is the FORMAT (prose, not a picked-winner verdict + pro/con bullets per
insurer), not that you must stay neutral when the numbers and priorities clearly favour one option.

Return ONLY this JSON (no prose, no markdown fence):
{
  "headline": "<one sentence framing what this comparison is about, e.g. 'All three options land within $2,400 of each other, but differ sharply on hospital access.'>",
  "narrative": "<2-5 paragraphs (separate with \\n\\n), comparing every priced insurer together as described above — reference the actual premium figures and the client's stated priorities>",
  "highlights": [ { "insurer": "<name>", "note": "<one short phrase — what stands out about this option, not a verdict, e.g. 'lowest total premium' or 'only one with panel-free specialist access'>" } ]
}`

function extractJson(text: string): Recommendation | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as Recommendation } catch { return null }
}

export async function recommend(
  results: QuoteResult, selections: Record<string, Selection>, priorities?: string | null,
): Promise<{ recommendation: Recommendation | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { recommendation: null, error: 'ANTHROPIC_API_KEY not set' }
  const priced = results.insurers.filter(i => !i.error)
  if (priced.length === 0) return { recommendation: null, error: 'no priced insurers to compare' }
  try {
    const userText = [
      priorities?.trim() ? `Client priorities: ${priorities.trim()}` : 'Client priorities: (none stated — optimise for overall value)',
      `Comparison:\n${JSON.stringify(summarise(results, selections))}`,
    ].join('\n\n')
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 4000, thinking: { type: 'adaptive' }, system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }] }),
    })
    const j = await res.json()
    if (!res.ok) return { recommendation: null, error: `Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_recommend', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'recommend' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const rec = extractJson(text)
    if (!rec) return { recommendation: null, error: 'could not parse a recommendation' }
    return { recommendation: rec }
  } catch (e) {
    return { recommendation: null, error: String(e) }
  }
}
