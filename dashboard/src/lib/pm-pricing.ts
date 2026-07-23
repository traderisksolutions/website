/**
 * Pricing Matrix — transparent pricing extraction (Opus + Gemini + reconciling judge).
 *
 * Two models independently read the workbook's rate sheets into structured tables; a deterministic
 * reconcile compares every (coverage × plan × age-band) rate; where the dollar values disagree an
 * Opus judge re-reads the raw cells and decides. This mirrors the old PDF extractor's ensemble so
 * the rates shown for transparency are dollar-accurate against the right age group / plan.
 *
 * Numbers are copied verbatim from the workbook — never invented. Premiums are still RUN via the
 * real workbook at quote time; this is a faithful, cross-checked readout of the embedded rates.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { GEMINI_PRO, geminiUrl } from '@/lib/gemini-models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type PricingPlan = { code: string; label: string; attrs?: string }
export type PricingRateRow = { band: string; by_plan: Record<string, number | string> }
export type PricingCoverage = {
  code: string; full_name: string; member_type?: string; derivation: string
  plans: PricingPlan[]; age_bands: string[]; rates: PricingRateRow[]; notes?: string
}
export type PricingAccuracy = {
  extractors: string[]; total_rates: number; agreed: number; conflicts: number
  adjudicated: number; single_source: number
}
export type Pricing = {
  coverages: PricingCoverage[]
  gst?: string; rate_version?: string; source_sheets?: string[]
  accuracy?: PricingAccuracy
}

export type StepFn = (label: string, step: number, total: number) => void | Promise<void>

const SYSTEM = `You extract an insurer group-benefits calculator's RATE TABLES from a workbook dump
for transparent display. You ONLY read numbers that are in the workbook — never invent, round, or
adjust a rate.

Return ONLY this JSON (no prose, no markdown fence):
{
  "coverages": [
    { "code": "<short form as printed, e.g. GHS>", "full_name": "<spelled out, e.g. Group Hospital & Surgical>",
      "member_type": "<Employee | Dependant | omit>",
      "derivation": "<one or two plain sentences: age basis, how the plan is chosen, loadings/co-insurance/panel effects, discounts, GST>",
      "plans": [ { "code": "Plan 1", "label": "Plan 1", "attrs": "<e.g. S$300k limit, 1-bed private, or omit>" } ],
      "age_bands": [ "0-25", ... ],
      "rates": [ { "band": "0-25", "by_plan": { "Plan 1": 448, "Plan 2": 358 } } ] } ],
  "gst": "<how GST is handled>", "rate_version": "<e.g. wef Feb 2026, or omit>", "source_sheets": [ "<sheet(s) read>" ]
}

Rules:
- Read the rate matrices from the workbook's rate/table sheets (often hidden). Include EVERY plan and
  EVERY age band — never sample. Copy each rate EXACTLY (keep decimals; "N/A" where the sheet shows it).
- Expand abbreviations to full names (GHS -> Group Hospital & Surgical, GTL -> Group Term Life, GACI ->
  Group Additional Critical Illness, GPA -> Group Personal Accident, GP -> General Practitioner
  (Outpatient), SP -> Specialist (Outpatient)). Keep the printed short form in "code".
- Split by member type / variant (Employee vs Dependant, panel vs non-panel, co-insurance) into separate
  coverage entries or plan labels — never lose rows.`

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const mkKey = (covId: string, member: unknown, plan: string, band: string) => `${covId}|${norm(member)}|${norm(plan)}|${norm(band)}`
/** A coverage can be matched by its printed CODE or its full name — either identifies it across the
 *  two extractions even when the models spell the full name differently. */
const covIds = (cov: PricingCoverage) => Array.from(new Set([cov.code, cov.full_name].map(norm).filter(Boolean)))
const primaryId = (cov: PricingCoverage) => norm(cov.code || cov.full_name)
const rateKey = (cov: PricingCoverage, planCode: string, band: string) => mkKey(primaryId(cov), cov.member_type, planCode, band)

function extractJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as T } catch { return null }
}

// ── A. Opus extractor ───────────────────────────────────────────────────────────
async function opusExtract(dump: unknown): Promise<{ pricing: Pricing | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { pricing: null, error: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 16000, thinking: { type: 'adaptive' }, system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Workbook dump:\n' + JSON.stringify(dump) }] }] }),
    })
    const j = await res.json()
    if (!res.ok) return { pricing: null, error: `Anthropic ${res.status}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_pricing', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'pricing_opus' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const pricing = extractJson<Pricing>(text)
    return pricing && Array.isArray(pricing.coverages) ? { pricing } : { pricing: null, error: 'unparseable' }
  } catch (e) { return { pricing: null, error: String(e) } }
}

// ── B. Gemini extractor ─────────────────────────────────────────────────────────
async function geminiExtract(dump: unknown): Promise<{ pricing: Pricing | null; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { pricing: null, error: 'GEMINI key not set' }
  try {
    // Fold the system prompt into the user turn (matches the codebase's proven Gemini pattern;
    // `systemInstruction` is used nowhere else here, so don't rely on it).
    const res = await fetch(`${geminiUrl(GEMINI_PRO)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM}\n\nWorkbook dump:\n${JSON.stringify(dump)}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32000, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) return { pricing: null, error: `Gemini ${res.status}` }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: GEMINI_PRO, feature: 'pm_pricing', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { pm: 'pricing_gemini' } })
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const pricing = extractJson<Pricing>(text)
    return pricing && Array.isArray(pricing.coverages) ? { pricing } : { pricing: null, error: 'unparseable' }
  } catch (e) { return { pricing: null, error: String(e) } }
}

// ── C. Reconcile — compare every dollar value across the two extractions ──────────
export type Conflict = { key: string; coverage: string; member_type?: string; plan: string; band: string; opus: number | string; gemini: number | string }

/** One rate per (primary coverage id × plan × band) — for counting a single extraction's size. */
function flatten(p: Pricing): Map<string, number | string> {
  const m = new Map<string, number | string>()
  for (const cov of p.coverages ?? []) {
    for (const row of cov.rates ?? []) {
      for (const [planCode, v] of Object.entries(row.by_plan ?? {})) {
        if (v !== undefined && v !== null && v !== '') m.set(rateKey(cov, planCode, row.band), v)
      }
    }
  }
  return m
}

/** Index a pricing under EVERY coverage id (code + full name) so a lookup matches on either. */
function pricingIndex(p: Pricing): Map<string, number | string> {
  const m = new Map<string, number | string>()
  for (const cov of p.coverages ?? []) {
    for (const row of cov.rates ?? []) {
      for (const [planCode, v] of Object.entries(row.by_plan ?? {})) {
        if (v === undefined || v === null || v === '') continue
        for (const id of covIds(cov)) m.set(mkKey(id, cov.member_type, planCode, row.band), v)
      }
    }
  }
  return m
}

export const sameRate = (a: number | string, b: number | string) => {
  const na = typeof a === 'number' ? a : parseFloat(String(a).replace(/[^0-9.-]/g, ''))
  const nb = typeof b === 'number' ? b : parseFloat(String(b).replace(/[^0-9.-]/g, ''))
  if (!isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) < 0.01
  return norm(a) === norm(b)
}

/** Compare every (coverage × plan × age-band) rate across the two extractions. Pure + testable. */
export function reconcile(opus: Pricing, gemini: Pricing): { conflicts: Conflict[]; agreed: number; single_source: number; total: number } {
  const gm = pricingIndex(gemini)
  const conflicts: Conflict[] = []
  let agreed = 0, single = 0, total = 0
  for (const cov of opus.coverages ?? []) {
    for (const row of cov.rates ?? []) {
      for (const planCode of Object.keys(row.by_plan ?? {})) {
        total++
        // Match on the coverage's code OR its full name (models may spell the name differently).
        let gv: number | string | undefined
        for (const id of covIds(cov)) { const hit = gm.get(mkKey(id, cov.member_type, planCode, row.band)); if (hit !== undefined) { gv = hit; break } }
        const ov = row.by_plan[planCode]
        if (gv === undefined) { single++; continue }
        if (sameRate(ov, gv)) agreed++
        else conflicts.push({ key: rateKey(cov, planCode, row.band), coverage: cov.full_name || cov.code, member_type: cov.member_type, plan: planCode, band: row.band, opus: ov, gemini: gv })
      }
    }
  }
  return { conflicts, agreed, single_source: single, total }
}

// ── D. Opus judge on the disputed cells ──────────────────────────────────────────
async function adjudicate(dump: unknown, conflicts: Conflict[]): Promise<Map<string, number | string>> {
  const out = new Map<string, number | string>()
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !conflicts.length) return out
  const batch = conflicts.slice(0, 80)
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 6000, thinking: { type: 'adaptive' },
        system: 'Two readings of the same insurer workbook disagree on some rate cells. Using the RAW sheet values provided, return the CORRECT value for each disputed cell exactly as printed in the workbook. Return ONLY a JSON array: [{"i": <index>, "value": <number or "N/A">}]. Never invent — if you cannot confirm from the raw values, return the "opus" value.',
        messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ disputes: batch.map((c, i) => ({ i, coverage: c.coverage, member_type: c.member_type, plan: c.plan, band: c.band, opus: c.opus, gemini: c.gemini })), raw_values: (dump as { values?: unknown }).values }) }] }] }),
    })
    const j = await res.json()
    if (!res.ok) return out
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_pricing', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'pricing_judge' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const arr = extractJson<{ i: number; value: number | string }[]>(text.replace(/^[^[]*/, '').replace(/[^\]]*$/, '')) as unknown as { i: number; value: number | string }[] | null
    for (const r of arr ?? []) { const c = batch[r.i]; if (c) out.set(c.key, r.value) }
  } catch { /* fall back to opus values */ }
  return out
}

// ── Ensemble ──────────────────────────────────────────────────────────────────────
export async function extractPricing(dump: unknown, onStep?: StepFn): Promise<{ pricing: Pricing | null; error?: string }> {
  await onStep?.('Reading rates — Opus & Gemini', 4, 6)
  const [o, g] = await Promise.all([opusExtract(dump), geminiExtract(dump)])
  const base = o.pricing ?? g.pricing
  if (!base) return { pricing: null, error: o.error ?? g.error ?? 'no pricing extracted' }

  // Single extractor available → return it as-is (still useful; just uncross-checked).
  if (!o.pricing || !g.pricing) {
    base.accuracy = { extractors: [o.pricing ? 'opus' : 'gemini'], total_rates: flatten(base).size, agreed: 0, conflicts: 0, adjudicated: 0, single_source: flatten(base).size }
    return { pricing: base }
  }

  await onStep?.('Cross-checking every rate', 5, 6)
  const { conflicts, agreed, single_source: single, total } = reconcile(o.pricing, g.pricing)

  // Judge resolves disagreements against the raw cells.
  const resolved = conflicts.length ? await adjudicate(dump, conflicts) : new Map<string, number | string>()
  let adjudicated = 0
  for (const cov of o.pricing.coverages) {
    for (const row of cov.rates ?? []) {
      for (const planCode of Object.keys(row.by_plan ?? {})) {
        const k = rateKey(cov, planCode, row.band)
        if (resolved.has(k)) { row.by_plan[planCode] = resolved.get(k)!; adjudicated++ }
      }
    }
  }

  o.pricing.accuracy = { extractors: ['opus', 'gemini'], total_rates: total, agreed, conflicts: conflicts.length, adjudicated, single_source: single }
  return { pricing: o.pricing }
}
