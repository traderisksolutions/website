/**
 * Group Benefits — auto-match plan tiers to a client's stated requirement (Sales Loop v2, Phase
 * 6b). Ported from pm-plan-match.ts's design, not shared with it — see gb-recommend.ts's header
 * comment for why GB and PM stay parallel modules.
 *
 * A broker states what the client wants per PRODUCT (e.g. "GHS: private hospital, 1-bed ward,
 * $300k limit") — GB's category_map varies plan choice per employee category too, but the
 * client's actual coverage requirement is a property of the product/coverage line, not the
 * employee tier, so one target per product (applied across every insurer offering it) matches
 * the real decision a broker is making. Opus reads every insurer's ACTUAL offered plan tiers for
 * that product (codes/labels/room tier, plus benefit terms) and picks the closest match per
 * insurer — never inventing a plan_code that isn't actually offered. This only pre-fills the
 * wizard's existing plan dropdowns (applied to every category mapped to that product); the
 * broker can still override any pick. Zero effect on computed premiums.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'
import { GEMINI_DEEP, geminiUrl } from '@/lib/gemini-models'
import { agentKey } from '@/lib/ai-agents'

export type MatchPlan = { plan_code: string; plan_name: string | null; hospital_type: string | null; beds: string | null }
export type MatchBenefit = { plan_code: string | null; category: string | null; benefit_name: string; value_text: string | null }
export type MatchProduct = { rate_table_id: string; insurer_name: string; product_title: string; plans: MatchPlan[]; benefits: MatchBenefit[] }
export type PlanMatchSuggestion = { rate_table_id: string; product_title: string; plan_code: string; reason: string }

const SYSTEM = `You are a Singapore group-employee-benefits broker choosing which plan TIER to quote
at each insurer for one coverage product, given what the client wants for that product.

You are given, per insurer offering that product: the plan tiers actually offered (code/name/room
tier — hospital type, bed class) and, where available, that tier's benefit terms. You are also
given the client's target requirement for the product, in plain English.

For each insurer that has at least one offered plan, pick the single plan_code that comes CLOSEST
to the target — prefer meeting or slightly exceeding a stated limit or room tier over falling
short, and match qualitative requirements (private vs government hospital, ward/bed class) as
closely as possible. You must ONLY return a plan_code that is actually listed for that insurer —
never invent one. Skip (omit) any insurer with no offered plans or where nothing offered is a
reasonable match.

Return ONLY this JSON (no prose, no markdown fence):
{ "suggestions": [ { "rate_table_id": "<as given>", "plan_code": "<one of that insurer's actual plan codes>",
    "reason": "<one short sentence: what about this tier matches the target>" } ] }`

function extractJson(text: string): { suggestions: { rate_table_id: string; plan_code: string; reason: string }[] } | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const o = JSON.parse(t.slice(s, e + 1))
    return Array.isArray(o?.suggestions) ? { suggestions: o.suggestions } : null
  } catch { return null }
}

function summariseProduct(target: string, products: MatchProduct[]) {
  return products.map(p => ({
    rate_table_id: p.rate_table_id,
    insurer_name:  p.insurer_name,
    target,
    plans: p.plans.map(pl => ({
      plan_code: pl.plan_code, plan_name: pl.plan_name, hospital_type: pl.hospital_type, beds: pl.beds,
      terms: p.benefits.filter(b => !b.plan_code || b.plan_code === pl.plan_code)
        .filter(b => b.plan_code).map(b => ({ category: b.category, name: b.benefit_name, value: b.value_text })),
    })),
  }))
}

/** One product's worth of suggestions — the wizard calls this once per product that has a
 *  stated target, so a bad/ambiguous target for one product never blocks the others. */
export async function suggestPlanMatch(
  productTitle: string, target: string, products: MatchProduct[],
): Promise<{ suggestions: PlanMatchSuggestion[]; error?: string }> {
  // Moved off Opus 4.8 on 2 Oct 2026. This picks among plan tiers that are listed in the
  // prompt and validated against that list afterwards, so a frontier model bought nothing the
  // deep Gemini tier does not; and the result only pre-fills a dropdown the broker can override,
  // which never justified a frontier price per call.
  const { key } = agentKey('groupbenefits')
  if (!key) return { suggestions: [], error: 'No Gemini API key configured' }
  if (!target.trim()) return { suggestions: [], error: 'no target stated' }
  const relevant = products.filter(p => p.product_title === productTitle && p.plans.length > 0)
  if (relevant.length === 0) return { suggestions: [], error: 'no offered plans for this product' }
  try {
    const data = summariseProduct(target, relevant)
    const res = await fetch(`${geminiUrl(GEMINI_DEEP)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: JSON.stringify(data) }] }],
        // 3000 was the Opus budget. Gemini's thinking tokens are drawn from the same allowance,
        // so a budget set for a model that counted them separately returns an empty candidate —
        // the failure that silently emptied the email classifiers in September.
        generationConfig: { temperature: 0, maxOutputTokens: 8000, responseMimeType: 'application/json' },
      }),
    })
    const j = await res.json()
    if (!res.ok) {
      void logError({ source: 'gemini', feature: 'gb_plan_match', statusCode: res.status, message: JSON.stringify(j), resourceType: 'product', resourceId: productTitle })
      return { suggestions: [], error: `Gemini ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    }
    void logAiUsage({ provider: 'gemini', model: GEMINI_DEEP, feature: 'gb_plan_match',
                      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
                      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 })
    const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('')
    const parsed = extractJson(text)
    if (!parsed) return { suggestions: [], error: 'could not parse suggestions' }
    // Defense in depth: drop any suggestion that isn't actually an offered plan_code.
    const valid = parsed.suggestions
      .map(s => ({ ...s, product_title: productTitle }))
      .filter(s => {
        const prod = relevant.find(p => p.rate_table_id === s.rate_table_id)
        return prod ? prod.plans.some(p => p.plan_code === s.plan_code) : false
      })
    return { suggestions: valid }
  } catch (e) {
    return { suggestions: [], error: String(e) }
  }
}
