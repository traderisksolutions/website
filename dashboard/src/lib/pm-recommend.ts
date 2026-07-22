/**
 * Pricing Matrix — Phase 3: context-aware recommendation.
 *
 * Opus compares the insurers on PRICE (fixed — from their own calculators, never changed) AND on
 * what each plan selection implies (hospital type, bed, plan tier, co-insurance), weighted by the
 * client's stated priorities (e.g. "private hospital access"). It recommends the best-value insurer
 * for THIS client and gives per-insurer pros/cons. Numbers are quoted verbatim, never invented.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import type { QuoteResult, Selection } from '@/lib/pm-quote'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type Recommendation = {
  recommendation: string           // insurer name
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

const SYSTEM = `You are a Singapore group-employee-benefits broker advising a client on which insurer
to choose. You are given a price comparison produced by each insurer's OWN calculator — the premium
numbers are final and correct; quote them verbatim and NEVER change or invent a number.

Compare the insurers on BOTH total price AND what each plan selection implies about coverage
(hospital type: private vs government; ward/bed type; plan tier / annual limit; co-insurance;
panel vs non-panel). Weight your recommendation by the client's stated priorities — if they care
about private-hospital access, favour the option giving the best value for THAT, not just the
cheapest headline. If no priorities are given, optimise for overall value (cover per dollar).

Return ONLY this JSON (no prose, no markdown fence):
{
  "recommendation": "<the insurer you recommend, exact name from the data>",
  "headline": "<one-sentence bottom line>",
  "rationale": "<2-4 sentences: why this insurer for THIS client; reference the priorities and the actual premium figures>",
  "per_insurer": [ { "insurer": "<name>", "best_for": "<who/what it suits>", "pros": ["…"], "cons": ["…"] } ]
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
