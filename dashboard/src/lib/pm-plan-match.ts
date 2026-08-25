/**
 * Pricing Matrix — auto-match plan tiers to a client's stated requirement.
 *
 * A broker states what the client wants per coverage line in plain English (e.g. "$200k annual
 * limit, private hospital, 1-bed ward"). Opus reads every insurer's ACTUAL offered plan tiers
 * (codes/labels/attrs from the approved rate table, plus that plan's benefit terms) and picks the
 * closest match per insurer — never inventing a plan_code that isn't actually offered. This only
 * pre-fills the quote wizard's existing plan dropdowns; the broker can still override any pick.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'
import type { RateTable } from '@/lib/pm-rates'
import { plansFor } from '@/lib/pm-rates'
import type { BenefitTerm } from '@/lib/pm-benefits-extract'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type MatchInsurer = { calculator_id: string; insurer_name: string; rate_table: RateTable; benefit_terms: BenefitTerm[] }
export type PlanMatchSuggestion = { calculator_id: string; code: string; plan_code: string; reason: string }

const SYSTEM = `You are a Singapore group-employee-benefits broker choosing which plan TIER to quote
at each insurer for one coverage line, given what the client wants.

You are given, per insurer and per coverage code: the plan tiers that insurer ACTUALLY offers
(code/label/attrs) and, where available, that tier's benefit terms (limits, room class, panel,
co-insurance, etc). You are also given the client's target requirement for that coverage, in plain
English.

For each (insurer, coverage code) that has a stated target AND at least one offered plan, pick the
single plan_code that comes CLOSEST to the target — prefer meeting or slightly exceeding a stated
limit over falling short, and match qualitative requirements (private vs government hospital, room
class, panel/non-panel) as closely as possible. You must ONLY return a plan_code that is actually
listed for that insurer/coverage — never invent one. Skip (omit) any (insurer, coverage) with no
stated target, no offered plans, or where nothing offered is a reasonable match.

Return ONLY this JSON (no prose, no markdown fence):
{ "suggestions": [ { "calculator_id": "<as given>", "code": "<coverage code as given>",
    "plan_code": "<one of that insurer/coverage's actual plan codes>",
    "reason": "<one short sentence: what about this tier matches the target>" } ] }`

function extractJson(text: string): { suggestions: PlanMatchSuggestion[] } | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const o = JSON.parse(t.slice(s, e + 1))
    return Array.isArray(o?.suggestions) ? { suggestions: o.suggestions } : null
  } catch { return null }
}

/** Compact, model-friendly view: each insurer's coverages, with only the plans + terms relevant to
 *  a coverage the broker actually stated a target for. */
function summarise(targets: Record<string, string>, insurers: MatchInsurer[]) {
  const codes = new Set(Object.keys(targets).filter(c => targets[c]?.trim()))
  return insurers.map(ins => ({
    calculator_id: ins.calculator_id,
    insurer_name: ins.insurer_name,
    coverages: (ins.rate_table.coverages ?? [])
      .map(c => c.code)
      .filter((code, i, arr) => codes.has(code) && arr.indexOf(code) === i)
      .map(code => ({
        code,
        target: targets[code],
        plans: plansFor(ins.rate_table, code),
        terms: ins.benefit_terms.filter(t => !t.plan_code || plansFor(ins.rate_table, code).some(p => p.code === t.plan_code))
          .filter(t => t.plan_code).map(t => ({ plan_code: t.plan_code, category: t.category, label: t.label, value: t.value })),
      })),
  })).filter(ins => ins.coverages.length > 0)
}

export async function suggestPlanMatch(
  targets: Record<string, string>, insurers: MatchInsurer[],
): Promise<{ suggestions: PlanMatchSuggestion[]; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { suggestions: [], error: 'ANTHROPIC_API_KEY not set' }
  const data = summarise(targets, insurers)
  if (data.length === 0) return { suggestions: [], error: 'no coverage has both a target and offered plans' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS, max_tokens: 4000, thinking: { type: 'adaptive' }, system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(data) }] }],
      }),
    })
    const j = await res.json()
    if (!res.ok) {
      void logError({ source: 'anthropic', feature: 'pm_plan_match', statusCode: res.status, message: JSON.stringify(j) })
      return { suggestions: [], error: `Anthropic ${res.status}: ${JSON.stringify(j).slice(0, 200)}` }
    }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_plan_match', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'plan_match' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const parsed = extractJson(text)
    if (!parsed) return { suggestions: [], error: 'could not parse suggestions' }
    // Defense in depth: drop any suggestion that isn't actually an offered plan_code (never trust the model's word for it).
    const valid = parsed.suggestions.filter(s => {
      const ins = insurers.find(i => i.calculator_id === s.calculator_id)
      return ins ? plansFor(ins.rate_table, s.code).some(p => p.code === s.plan_code) : false
    })
    return { suggestions: valid }
  } catch (e) {
    return { suggestions: [], error: String(e) }
  }
}
