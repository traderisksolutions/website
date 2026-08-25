/**
 * Group Benefits — comparison narrative (Sales Loop v2, Phase 6a).
 *
 * Ported from pm-recommend.ts's design, not shared with it — GB and PM's types diverged after
 * forking from the same codebase in July (see gb-quote.ts's InsurerResult/QuoteResult vs
 * pm-quote.ts's), so this is a parallel module operating on GB's own shapes.
 *
 * Same philosophy as pm-recommend.ts: Opus compares the insurers on BOTH price (fixed — from
 * gb-quote.ts's computeQuote, never changed here) and what each plan actually covers, weighted
 * by the client's stated priorities. Deliberately NOT a single-winner pick with per-insurer
 * pros/cons lists — one continuous narrative comparing all quoted insurers together, the way a
 * broker would actually talk a client through the options, with short standout tags per insurer
 * for the at-a-glance view.
 */
import { logAnthropicUsage } from '@/lib/gemini-usage'
import { benefitKey }        from '@/lib/gb-diff'
import { logError }          from '@/lib/error-log'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type QuotedPlan = {
  insurer_name:  string
  product_code:  string
  plan_code:     string
  annual_total:  number | null
  room_tier:     { beds: string | null; hospital_type: string | null; co_payment: string | null }
  benefits:      { category: string | null; name: string; value: string | null }[]
}

export type Recommendation = {
  headline: string
  /** One continuous multi-paragraph comparison of every quoted insurer together — no declared
   *  winner, no per-insurer pros/cons split. Line breaks (\n\n) separate paragraphs. */
  narrative: string
  /** Short "stands out for X" tags, one per quoted insurer, for a scannable summary above the
   *  narrative — not a verdict, just what's distinctive about each option. */
  highlights: { insurer: string; note: string }[]
}

/** Legacy shape (comparison/insurers/recommendation), stored before this narrative redesign —
 *  kept only so old quotes can be detected and offered a one-click "Recompute" instead of
 *  crashing the page. Never written going forward. */
export type LegacyRecommendation = {
  comparison: { benefit: string; by_insurer: Record<string, string> }[]
  insurers:   { insurer: string; pros: string[]; cons: string[] }[]
  recommendation: string
}

// `key` is the same normalized category+name identity gb-diff.ts's benefitKey uses for
// version-over-version diffing (Phase 6c) — reused here so Opus gets an explicit signal for
// which benefit lines are the SAME underlying term across insurers despite wording differences
// ("Room & Board" vs "Room and Board"), instead of relying entirely on its own alignment.
function summarise(plans: QuotedPlan[]) {
  return plans.map(p => ({
    insurer: p.insurer_name,
    plan: `${p.product_code} ${p.plan_code}`,
    annual_total: p.annual_total,
    room: p.room_tier,
    benefits: p.benefits.slice(0, 60).map(b => ({
      key: benefitKey({ plan_code: null, category: b.category, benefit_name: b.name }),
      category: b.category, name: b.name, value: b.value,
    })),
  }))
}

const SYSTEM = `You are a Singapore group-employee-benefits broker walking a client through a price
comparison across insurers — the premium numbers come from each insurer's own approved rate table;
quote them verbatim and NEVER change or invent a number.

Compare the insurers on BOTH total price AND what each plan's benefit schedule actually covers
(room/board tier, hospital type, co-payment, and the benefit lines provided). Each benefit carries
a "key" — benefit lines sharing the same key across insurers are the SAME underlying term (already
normalized past wording differences), so treat matching keys as directly comparable even if their
printed names differ slightly. Weight
the comparison by the client's stated priorities — if they care about private-hospital access,
spend more of the narrative on how the options differ on THAT, not just the cheapest headline. If
no priorities are given, compare on overall value (coverage per dollar).

DO NOT declare a single winner or split insurers into a rigid pros/cons list — write ONE continuous
narrative that discusses all the quoted insurers together, the way a broker would actually talk a
client through the options out loud: where they cluster on price, which trade real coverage for a
lower premium, which is worth the extra spend and for what reason, any material gap in what's
covered. It is fine to end with a clear steer if the data genuinely points that way — the
constraint is the FORMAT (prose, not a picked-winner verdict + pro/con bullets per insurer), not
that you must stay neutral when the numbers and priorities clearly favour one option.

Return ONLY this JSON (no prose, no markdown fence):
{
  "headline": "<one sentence framing what this comparison is about>",
  "narrative": "<2-5 paragraphs (separate with \\n\\n), comparing every quoted insurer together as described above — reference the actual premium figures and the client's stated priorities>",
  "highlights": [ { "insurer": "<name>", "note": "<one short phrase — what stands out about this option, e.g. 'lowest total premium' or 'only one with private single-bed as standard'>" } ]
}`

function extractJson(text: string): Recommendation | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as Recommendation } catch { return null }
}

export async function recommend(
  plans: QuotedPlan[], companyName: string | null, priorities?: string | null,
): Promise<{ recommendation: Recommendation | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { recommendation: null, error: 'ANTHROPIC_API_KEY not set' }
  if (plans.length === 0) return { recommendation: null, error: 'no quoted plans to compare' }
  try {
    const userText = [
      `Client: ${companyName || 'a client'}`,
      priorities?.trim() ? `Client priorities: ${priorities.trim()}` : 'Client priorities: (none stated — optimise for overall value)',
      `Quoted plans:\n${JSON.stringify(summarise(plans))}`,
    ].join('\n\n')
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 4000, thinking: { type: 'adaptive' }, system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }] }),
    })
    const j = await res.json()
    if (!res.ok) {
      void logError({ source: 'anthropic', feature: 'gb_recommend', statusCode: res.status, message: JSON.stringify(j), metadata: { companyName } })
      return { recommendation: null, error: `Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    }
    void logAnthropicUsage('gb_recommend', j.usage, null)
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const rec = extractJson(text)
    if (!rec) return { recommendation: null, error: 'could not parse a recommendation' }
    return { recommendation: rec }
  } catch (e) {
    return { recommendation: null, error: String(e) }
  }
}
