/**
 * Pricing Matrix v2 — coverage/benefit wordings extraction (Opus + Gemini, cross-checked).
 *
 * Extracted ONCE per calculator upload (mainly from the brochure PDF, plus any xlsx notes) and
 * cached in `pm_benefit_terms` — this is what powers the Level 2 coverage comparison (why choose
 * insurer A over B: room class, panel, co-insurance, waiting periods, sums assured, etc.) without
 * re-spending tokens on every comparison. Fields are insurer-specific for now (no fixed taxonomy)
 * — comparison aligns terms by normalised label, same approach the price comparison already uses
 * for coverage lines.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { GEMINI_PRO, geminiUrl } from '@/lib/gemini-models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type BenefitTerm = {
  plan_code?: string; category: string; label: string; value: string; notes?: string; source: 'xlsx' | 'pdf'
  /** true when plan_code was INFERRED (e.g. only one tier discussed in that paragraph, or by
   *  elimination) rather than explicitly stated (a table column, an explicit "Plan X:" reference)
   *  — surfaced to the reviewer as a "double-check this" signal, mainly relevant for prose-heavy
   *  brochures where a table-style anchor isn't available. Never set for policy-wide terms
   *  (no plan_code) — inference doesn't apply there. */
  plan_code_inferred?: boolean
}
export type TermConflict = { key: string; category: string; label: string; opus?: string; gemini?: string; note: string }

const SYSTEM = `You extract an insurer group-benefits plan's COVERAGE TERMS / WORDINGS — what is actually
covered, not the price — for a side-by-side comparison against other insurers. Read every plan tier's
benefit schedule: hospitalization limits, room/bed class, panel vs non-panel, co-insurance/deductible,
pre/post-hospitalization days, waiting periods, pre-existing condition treatment, maternity, dental
annual caps, sums assured for critical illness/PA/life, exclusions, and anything else the brochure
states as a plan feature. Use the insurer's OWN wording/labels — do not force terms into a fixed
taxonomy or invent a category that isn't meaningfully present. Never invent a value that isn't stated.

Return ONLY this JSON (no prose, no markdown fence):
{ "terms": [ { "plan_code": "<matches a rate-table plan code where applicable, or omit for a
    policy-wide term>", "category": "<short grouping, e.g. Hospitalization, Panel, Waiting Period,
    Maternity, Dental, Exclusions>", "label": "<the specific feature, in the insurer's own words>",
    "value": "<the stated value/limit/description, verbatim or lightly cleaned up>",
    "notes": "<caveats/conditions, or omit>",
    "plan_code_inferred": true | omit } ] }

Be thorough — this is used to answer "why would a client pick this insurer over another" for the
SAME plan tier, so granularity matters (e.g. "Room & Board" and "ICU limit" are separate terms, not
one combined "Hospitalization" term).

Set "plan_code_inferred": true when you had to INFER which plan tier a term belongs to (e.g. a
prose paragraph only discussing one tier by context, or elimination) rather than it being
EXPLICITLY stated (a table column for that tier, an explicit "Plan X:" reference next to the
value). Omit it entirely (do not write false) when the tier was explicitly stated, or when the term
is policy-wide (no plan_code). This is a reviewer signal, not a confidence score on the value
itself — the value must still be copied verbatim either way, never guessed.`

function extractJson(text: string): { terms: BenefitTerm[] } | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const o = JSON.parse(t.slice(s, e + 1))
    return Array.isArray(o?.terms) ? { terms: o.terms } : null
  } catch { return null }
}

async function opusExtract(dump: unknown, brochureBase64?: string): Promise<{ terms: BenefitTerm[] | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { terms: null, error: 'ANTHROPIC_API_KEY not set' }
  const content: unknown[] = []
  if (brochureBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: brochureBase64 } })
  content.push({ type: 'text', text: dump ? `Workbook notes:\n${JSON.stringify(dump)}` : 'No workbook dump — brochure PDF is the only source.' })
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 20000, thinking: { type: 'adaptive' }, system: SYSTEM, messages: [{ role: 'user', content }] }),
    })
    const j = await res.json()
    if (!res.ok) return { terms: null, error: `Anthropic ${res.status}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_benefit_extract', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'benefits_opus' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const parsed = extractJson(text)
    return parsed ? { terms: parsed.terms.map(t => ({ ...t, source: 'pdf' as const })) } : { terms: null, error: 'unparseable' }
  } catch (e) { return { terms: null, error: String(e) } }
}

async function geminiExtract(dump: unknown, brochureBase64?: string): Promise<{ terms: BenefitTerm[] | null; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { terms: null, error: 'GEMINI key not set' }
  const parts: unknown[] = [{ text: SYSTEM }]
  if (brochureBase64) parts.push({ inline_data: { mime_type: 'application/pdf', data: brochureBase64 } })
  parts.push({ text: dump ? `Workbook notes:\n${JSON.stringify(dump)}` : 'No workbook dump — brochure PDF is the only source.' })
  try {
    const res = await fetch(`${geminiUrl(GEMINI_PRO)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 32000 } }),
    })
    if (!res.ok) return { terms: null, error: `Gemini ${res.status}` }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: GEMINI_PRO, feature: 'pm_benefit_extract', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { pm: 'benefits_gemini' } })
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const parsed = extractJson(text)
    return parsed ? { terms: parsed.terms.map(t => ({ ...t, source: 'pdf' as const })) } : { terms: null, error: 'unparseable' }
  } catch (e) { return { terms: null, error: String(e) } }
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const termKey = (t: Pick<BenefitTerm, 'plan_code' | 'category' | 'label'>) => `${norm(t.plan_code)}|${norm(t.category)}|${norm(t.label)}`
const sameValue = (a: string, b: string) => norm(a) === norm(b)

/** Merge two independent readings into one term list, flagging value disagreements and terms only
 *  one extractor found — surfaced to the human reviewer, same trust gate as the rate table. */
export function mergeTerms(opus: BenefitTerm[], gemini: BenefitTerm[]): { terms: BenefitTerm[]; conflicts: TermConflict[] } {
  const gByKey = new Map(gemini.map(t => [termKey(t), t]))
  const seen = new Set<string>()
  const terms: BenefitTerm[] = []
  const conflicts: TermConflict[] = []

  for (const o of opus) {
    const key = termKey(o)
    seen.add(key)
    const g = gByKey.get(key)
    terms.push(o)
    if (!g) conflicts.push({ key, category: o.category, label: o.label, opus: o.value, note: 'Only Opus found this term' })
    else if (!sameValue(o.value, g.value)) conflicts.push({ key, category: o.category, label: o.label, opus: o.value, gemini: g.value, note: 'Opus and Gemini disagree on the value' })
  }
  for (const g of gemini) {
    const key = termKey(g)
    if (seen.has(key)) continue
    terms.push(g)
    conflicts.push({ key, category: g.category, label: g.label, gemini: g.value, note: 'Only Gemini found this term' })
  }
  return { terms, conflicts }
}

export type StepFn = (label: string, step: number, total: number) => void | Promise<void>

export async function extractBenefitTerms(
  dump: unknown, brochureBase64: string | undefined, onStep?: StepFn,
): Promise<{ terms: BenefitTerm[] | null; conflicts: TermConflict[]; error?: string }> {
  await onStep?.('Reading coverage terms — Opus & Gemini', 1, 2)
  const [o, g] = await Promise.all([opusExtract(dump, brochureBase64), geminiExtract(dump, brochureBase64)])
  if (!o.terms && !g.terms) {
    const msg = [o.error && `opus: ${o.error}`, g.error && `gemini: ${g.error}`].filter(Boolean).join('; ')
    return { terms: null, conflicts: [], error: msg || 'no terms extracted' }
  }
  if (!o.terms || !g.terms) return { terms: o.terms ?? g.terms, conflicts: [] }

  await onStep?.('Cross-checking terms', 2, 2)
  const { terms, conflicts } = mergeTerms(o.terms, g.terms)
  return { terms, conflicts }
}
