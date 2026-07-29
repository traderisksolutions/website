/**
 * Pricing Matrix v2 — rate table extraction (Opus + Gemini, cross-checked against BOTH the xlsx
 * calculator and the brochure PDF where both are available).
 *
 * This is now the SOURCE of the numbers (not just a transparency readout) — once approved, every
 * quote is computed from what this produces (see pm-calc.ts), with no further AI calls. Numbers
 * are copied verbatim from whichever document states them — never invented, rounded, or adjusted.
 * Where the two models disagree, or where only one source has a cell, an Opus judge re-reads the
 * raw material and decides; anything still uncertain is surfaced to the human reviewer.
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { GEMINI_PRO, geminiUrl } from '@/lib/gemini-models'
import type { Coverage, Rules, Accuracy, RateTable } from '@/lib/pm-rates'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type ExtractedRateTable = { age_basis: RateTable['age_basis']; coverages: Coverage[]; rules: Rules }
export type StepFn = (label: string, step: number, total: number) => void | Promise<void>

const SYSTEM = `You extract an insurer group-benefits calculator's RATE TABLES and PRICING RULES for
transparent, computable pricing. You are given (a) a structured dump of the insurer's Excel
calculator (sheets/values/formulas) and/or (b) the insurer's brochure PDF. Cross-reference both when
both are present — the brochure often states rules in prose that the workbook only encodes as a
formula, and the workbook usually has the complete rate matrix the brochure only summarises.
You ONLY read numbers/rules that are actually present in the material — NEVER invent, round, guess,
or interpolate a rate or a rule.

Return ONLY this JSON (no prose, no markdown fence):
{
  "age_basis": "ANB" | "ALB" | null,   // Age Next Birthday vs Age Last Birthday — from a footnote/column header
  "coverages": [
    { "code": "<short form as printed, e.g. GHS>", "full_name": "<spelled out, e.g. Group Hospital & Surgical>",
      "member_type": "<Employee | Dependant | omit if the coverage doesn't split by member type>",
      "derivation": "<one or two plain sentences: age basis, how the plan is chosen, loadings/co-insurance/panel effects, discounts, GST>",
      "plans": [ { "code": "Plan 1", "label": "Plan 1", "attrs": "<e.g. S$300k limit, 1-bed private, or omit>" } ],
      "age_bands": [ "0-25", ... ],
      "rates": [ { "band": "0-25", "by_plan": { "Plan 1": 448, "Plan 2": 358 } } ] } ],
  "rules": {
    "group_size_loading": [ { "min": 1, "max": 1, "loading_pct": 50 }, { "min": 5, "max": 9, "loading_pct": -5 } ] | omit if none stated,
    "loading_excludes": [ "<coverage codes NOT subject to the group-size loading, e.g. Term Life/CI/PA>" ] | omit,
    "quote_basis_exclusions": { "new_business": [ "<age bands priced only on renewal>" ], "renewal": [ "<age bands priced only on new business>" ] } | omit,
    "gst": { "inclusive": true|false, "rate": 0.09 } | omit if GST isn't mentioned
  }
}

Rules:
- Read the rate matrices from the workbook's rate/table sheets (often hidden) and/or the brochure's
  premium tables. Include EVERY plan and EVERY age band — never sample. Copy each rate EXACTLY
  (keep decimals; "N/A" where the sheet/brochure shows it).
- Expand abbreviations to full names (GHS -> Group Hospital & Surgical, GTL -> Group Term Life, GACI ->
  Group Additional Critical Illness, GPA -> Group Personal Accident, GP -> General Practitioner
  (Outpatient), SP -> Specialist (Outpatient)). Keep the printed short form in "code".
- Split by member type / variant (Employee vs Dependant, panel vs non-panel, co-insurance) into separate
  coverage entries or plan labels — never lose rows.
- Pricing RULES (loadings, exclusions, GST) are usually stated in a notes section, footnote, or a
  "Notes"/instructions sheet — read them carefully and encode them structurally. If a rule isn't
  stated anywhere, omit that field entirely rather than guessing a default.`

function extractJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try { return JSON.parse(t.slice(s, e + 1)) as T } catch { return null }
}

function buildUserContent(dump: unknown, brochureBase64?: string, forGemini = false) {
  const parts: unknown[] = []
  if (brochureBase64) {
    parts.push(forGemini
      ? { inline_data: { mime_type: 'application/pdf', data: brochureBase64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: brochureBase64 } })
  }
  const text = dump ? `Workbook dump:\n${JSON.stringify(dump)}` : 'No workbook dump — brochure PDF is the only source.'
  parts.push(forGemini ? { text } : { type: 'text', text })
  return parts
}

// ── A. Opus extractor ───────────────────────────────────────────────────────────
async function opusExtract(dump: unknown, brochureBase64?: string): Promise<{ table: ExtractedRateTable | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { table: null, error: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 20000, thinking: { type: 'adaptive' }, system: SYSTEM,
        messages: [{ role: 'user', content: buildUserContent(dump, brochureBase64, false) }] }),
    })
    const j = await res.json()
    if (!res.ok) return { table: null, error: `Anthropic ${res.status}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_rate_extract', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'rates_opus' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const table = extractJson<ExtractedRateTable>(text)
    return table && Array.isArray(table.coverages) ? { table } : { table: null, error: 'unparseable' }
  } catch (e) { return { table: null, error: String(e) } }
}

// ── B. Gemini extractor ─────────────────────────────────────────────────────────
async function geminiExtract(dump: unknown, brochureBase64?: string): Promise<{ table: ExtractedRateTable | null; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { table: null, error: 'GEMINI key not set' }
  try {
    const res = await fetch(`${geminiUrl(GEMINI_PRO)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM }, ...buildUserContent(dump, brochureBase64, true)] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32000, responseMimeType: brochureBase64 ? undefined : 'application/json' },
      }),
    })
    if (!res.ok) return { table: null, error: `Gemini ${res.status}` }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: GEMINI_PRO, feature: 'pm_rate_extract', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { pm: 'rates_gemini' } })
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const table = extractJson<ExtractedRateTable>(text)
    return table && Array.isArray(table.coverages) ? { table } : { table: null, error: 'unparseable' }
  } catch (e) { return { table: null, error: String(e) } }
}

// ── C. Reconcile — compare every dollar value across the two extractions ──────────
export type Conflict = { key: string; coverage: string; member_type?: string; plan: string; band: string; opus: number | string; gemini: number | string }

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const mkKey = (covId: string, member: unknown, plan: string, band: string) => `${covId}|${norm(member)}|${norm(plan)}|${norm(band)}`
const covIds = (cov: Coverage) => Array.from(new Set([cov.code, cov.full_name].map(norm).filter(Boolean)))
const primaryId = (cov: Coverage) => norm(cov.code || cov.full_name)
const rateKey = (cov: Coverage, planCode: string, band: string) => mkKey(primaryId(cov), cov.member_type, planCode, band)

function flatten(t: ExtractedRateTable): Map<string, number | string> {
  const m = new Map<string, number | string>()
  for (const cov of t.coverages ?? []) for (const row of cov.rates ?? []) for (const [planCode, v] of Object.entries(row.by_plan ?? {}))
    if (v !== undefined && v !== null && v !== '') m.set(rateKey(cov, planCode, row.band), v)
  return m
}
function pricingIndex(t: ExtractedRateTable): Map<string, number | string> {
  const m = new Map<string, number | string>()
  for (const cov of t.coverages ?? []) for (const row of cov.rates ?? []) for (const [planCode, v] of Object.entries(row.by_plan ?? {})) {
    if (v === undefined || v === null || v === '') continue
    for (const id of covIds(cov)) m.set(mkKey(id, cov.member_type, planCode, row.band), v)
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
export function reconcile(opus: ExtractedRateTable, gemini: ExtractedRateTable): { conflicts: Conflict[]; agreed: number; single_source: number; total: number } {
  const gm = pricingIndex(gemini)
  const conflicts: Conflict[] = []
  let agreed = 0, single = 0, total = 0
  for (const cov of opus.coverages ?? []) {
    for (const row of cov.rates ?? []) {
      for (const planCode of Object.keys(row.by_plan ?? {})) {
        total++
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

/** Rules are mostly scalar/short — flag disagreement rather than trying to diff arrays cell by cell. */
export type RuleConflict = { field: string; opus: unknown; gemini: unknown }
export function reconcileRules(opus: Rules, gemini: Rules): RuleConflict[] {
  const out: RuleConflict[] = []
  if (opus.gst && gemini.gst && (opus.gst.inclusive !== gemini.gst.inclusive || opus.gst.rate !== gemini.gst.rate))
    out.push({ field: 'gst', opus: opus.gst, gemini: gemini.gst })
  const loadA = JSON.stringify(opus.group_size_loading ?? null), loadB = JSON.stringify(gemini.group_size_loading ?? null)
  if (opus.group_size_loading && gemini.group_size_loading && loadA !== loadB)
    out.push({ field: 'group_size_loading', opus: opus.group_size_loading, gemini: gemini.group_size_loading })
  return out
}

// ── D. Opus judge on the disputed cells ──────────────────────────────────────────
async function adjudicate(dump: unknown, brochureBase64: string | undefined, conflicts: Conflict[]): Promise<Map<string, number | string>> {
  const out = new Map<string, number | string>()
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !conflicts.length) return out
  const batch = conflicts.slice(0, 80)
  try {
    const content: unknown[] = []
    if (brochureBase64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: brochureBase64 } })
    content.push({ type: 'text', text: JSON.stringify({ disputes: batch.map((c, i) => ({ i, coverage: c.coverage, member_type: c.member_type, plan: c.plan, band: c.band, opus: c.opus, gemini: c.gemini })), workbook_values: (dump as { values?: unknown } | undefined)?.values }) })
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPUS, max_tokens: 6000, thinking: { type: 'adaptive' },
        system: 'Two readings of the same insurer material disagree on some rate cells. Using the raw workbook values and/or brochure PDF provided, return the CORRECT value for each disputed cell exactly as printed/computed. Return ONLY a JSON array: [{"i": <index>, "value": <number or "N/A">}]. Never invent — if you cannot confirm, return the "opus" value.',
        messages: [{ role: 'user', content }] }),
    })
    const j = await res.json()
    if (!res.ok) return out
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_rate_extract', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'rates_judge' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const arr = extractJson<{ i: number; value: number | string }[]>(text.replace(/^[^[]*/, '').replace(/[^\]]*$/, '')) as unknown as { i: number; value: number | string }[] | null
    for (const r of arr ?? []) { const c = batch[r.i]; if (c) out.set(c.key, r.value) }
  } catch { /* fall back to opus values */ }
  return out
}

// ── Ensemble ──────────────────────────────────────────────────────────────────────
export async function extractRateTable(
  dump: unknown, brochureBase64: string | undefined, onStep?: StepFn,
): Promise<{ table: ExtractedRateTable | null; accuracy?: Accuracy; ruleConflicts?: RuleConflict[]; error?: string }> {
  await onStep?.('Reading rates — Opus & Gemini', 1, 3)
  const [o, g] = await Promise.all([opusExtract(dump, brochureBase64), geminiExtract(dump, brochureBase64)])
  const base = o.table ?? g.table
  if (!base) {
    const msg = [o.error && `opus: ${o.error}`, g.error && `gemini: ${g.error}`].filter(Boolean).join('; ')
    return { table: null, error: msg || 'no rate table extracted' }
  }

  if (!o.table || !g.table) {
    return { table: base, accuracy: { extractors: [o.table ? 'opus' : 'gemini'], total_rates: flatten(base).size, agreed: 0, conflicts: 0, adjudicated: 0, single_source: flatten(base).size } }
  }

  await onStep?.('Cross-checking every rate', 2, 3)
  const { conflicts, agreed, single_source: single, total } = reconcile(o.table, g.table)
  const ruleConflicts = reconcileRules(o.table.rules ?? {}, g.table.rules ?? {})

  const resolved = conflicts.length ? await adjudicate(dump, brochureBase64, conflicts) : new Map<string, number | string>()
  await onStep?.('Reconciling', 3, 3)
  let adjudicated = 0
  for (const cov of o.table.coverages) {
    for (const row of cov.rates ?? []) {
      for (const planCode of Object.keys(row.by_plan ?? {})) {
        const k = rateKey(cov, planCode, row.band)
        if (resolved.has(k)) { row.by_plan[planCode] = resolved.get(k)!; adjudicated++ }
      }
    }
  }

  // Merge rules: prefer Opus, fall back to Gemini field-by-field where Opus omitted it.
  o.table.rules = { ...g.table.rules, ...o.table.rules }
  o.table.age_basis = o.table.age_basis ?? g.table.age_basis

  return { table: o.table, accuracy: { extractors: ['opus', 'gemini'], total_rates: total, agreed, conflicts: conflicts.length, adjudicated, single_source: single }, ruleConflicts }
}
