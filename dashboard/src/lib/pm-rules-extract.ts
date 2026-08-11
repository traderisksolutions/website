/**
 * Pricing Matrix v3 — extraction of an insurer's CALCULATION LOGIC (as opposed to pm-rates-extract.ts,
 * which extracts the populated numbers). Several insurers' Excel calculators are closer to a blank
 * formula shell — input cells + formulas for loading %, tier selection, GST — than a populated rate
 * grid; that logic has to be read from the workbook's FORMULAS (dump.formulas, see api/pm_dump.py),
 * not its values.
 *
 * Deliberately a BOUNDED set of step primitives (RuleStep), not a general expression language — every
 * step stays auditable against a source_ref (a cell ref or brochure anchor) instead of being an
 * opaque formula string, preserving the same human-review trust model as the rate table.
 *
 * `age_band_lookup`-only output reproduces today's flat-lookup pricing exactly — this pipeline is a
 * strict superset of the old one, never a replacement for calculators that are genuinely just a rate
 * grid (most of them, still handled by pm-rates-extract.ts + pm-calc.ts's existing priceLine()).
 */
import { logAiUsage } from '@/lib/gemini-usage'
import { GEMINI_PRO, geminiUrl } from '@/lib/gemini-models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

export type RuleStep =
  | { type: 'age_band_lookup'; id: string; coverage_code: string; plan_field: string; output: string; source_ref?: string }
  | { type: 'flat_rate'; id: string; coverage_code: string; plan_field: string; value_ref: string | number; output: string; source_ref?: string }
  | { type: 'percentage_loading'; id: string; applies_to: string[] | 'all'; basis: 'headcount' | 'variable'; variable?: string
      bands: { min: number; max: number | null; pct: number }[]; excludes?: string[]; output: string; source_ref?: string }
  | { type: 'conditional_tier_selection'; id: string; variable: string
      when: { if: { field: string; op: 'eq' | 'gte' | 'lte' | 'between' | 'in'; value: unknown }; then: string }[]
      else?: string; output: string; source_ref?: string }
  | { type: 'combine'; id: string; op: 'add' | 'subtract' | 'multiply'; inputs: string[]; output: string; source_ref?: string }
  | { type: 'gst_adjustment'; id: string; input_ref: string; inclusive: boolean; rate: number; output: string; source_ref?: string }

export type ExcelShape = 'embedded_table' | 'formula_shell' | 'hybrid'

type Dump = {
  sheets?: { name: string }[]
  values?: Record<string, Record<string, unknown>>
  formulas?: Record<string, Record<string, string>>
}

// ── Excel-shape detection ──────────────────────────────────────────────────────
/** Cheap heuristic first (cell-density ratio) so most calculators never need an AI call at all;
 *  only genuinely ambiguous cases (neither clearly dense-values nor clearly formula-dominant) fall
 *  back to one lightweight Opus call — same cost tier as the old classify-categories call, not the
 *  full dual-model ensemble this file uses for the rules themselves. */
export async function detectExcelShape(dump: unknown): Promise<ExcelShape> {
  const d = dump as Dump | null
  if (!d?.values && !d?.formulas) return 'formula_shell'

  const valueCount = Object.values(d.values ?? {}).reduce((n, sheet) => n + Object.keys(sheet).length, 0)
  const formulaCount = Object.values(d.formulas ?? {}).reduce((n, sheet) => n + Object.keys(sheet).length, 0)
  const total = valueCount + formulaCount
  if (total === 0) return 'formula_shell'

  const formulaRatio = formulaCount / total
  // Heavily numeric with few formulas -> a populated rate grid. Heavily formula-driven with few
  // standalone values -> a calculation shell. Anything in between is genuinely ambiguous (a workbook
  // that has BOTH a real rate grid on one sheet and real loading/GST formulas on another) and needs
  // a model to actually look, rather than guessing from a bare ratio.
  if (formulaRatio < 0.15 && valueCount > 20) return 'embedded_table'
  if (formulaRatio > 0.5) return 'formula_shell'

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return formulaRatio > 0.3 ? 'formula_shell' : 'hybrid'
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS, max_tokens: 300,
        system: 'Look at this insurer Excel calculator dump (sheet names, a sample of populated values, and a sample of formulas). Classify it as exactly one word: "embedded_table" (it has its own real, populated rate/premium grid you could read numbers straight off), "formula_shell" (it is mostly blank input cells + calculation formulas, no real populated rate grid), or "hybrid" (both). Return ONLY that one word.',
        messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({ sheets: d.sheets?.map(s => s.name), values_sample: Object.fromEntries(Object.entries(d.values ?? {}).slice(0, 3)), formulas_sample: Object.fromEntries(Object.entries(d.formulas ?? {}).slice(0, 3)) }) }] }],
      }),
    })
    const j = await res.json()
    if (!res.ok) return formulaRatio > 0.3 ? 'formula_shell' : 'hybrid'
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_shape_detect', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: {} })
    const text = ((j.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '').trim().toLowerCase()
    if (text.includes('embedded_table')) return 'embedded_table'
    if (text.includes('formula_shell')) return 'formula_shell'
    if (text.includes('hybrid')) return 'hybrid'
    return 'hybrid'
  } catch { return formulaRatio > 0.3 ? 'formula_shell' : 'hybrid' }
}

// ── Rule-step extraction (Opus + Gemini, same ensemble shape as pm-rates-extract.ts) ──────────────
const SYSTEM = `You read an insurer group-benefits Excel calculator's FORMULAS (and, where given, its
brochure PDF) and translate its CALCULATION LOGIC into a small set of structured step primitives — not
a literal formula transcription. The goal: someone re-running these steps against a census and the
insurer's rate tables gets the exact same premium the workbook itself would compute.

You are given the workbook's formula cells (dump.formulas) and its populated value cells (dump.values)
for context (e.g. to see what a named range or lookup table actually contains).

Return ONLY this JSON (no prose, no markdown fence):
{ "rules": [ <ordered array of step objects, each ONE of the shapes below> ] }

Every step has an "id" (short slug, e.g. "hs_loading"), an "output" (the variable name later steps or
the final premium reads), and an OPTIONAL "source_ref" (the cell reference the logic came from, e.g.
"Sheet2!C14" — include this whenever the logic traces to one identifiable cell/formula, it's what a
human reviewer checks your translation against).

Step shapes:
1. age_band_lookup — a straight rate-table lookup by age band + selected plan (the common case; if
   the ENTIRE calculator is just this, per coverage, with no other logic, that's fine — most are).
   { "type": "age_band_lookup", "id", "coverage_code", "plan_field", "output", "source_ref"? }
2. flat_rate — a single fixed rate regardless of age (e.g. a flat Term Life rate per $1000 sum
   assured). { "type": "flat_rate", "id", "coverage_code", "plan_field", "value_ref": <cell ref or
   literal number>, "output", "source_ref"? }
3. percentage_loading — a % adjustment applied based on group size or another variable (e.g. +50% for
   a 1-life group, -10% for 10+). { "type": "percentage_loading", "id", "applies_to": [<coverage
   codes>] | "all", "basis": "headcount" | "variable", "variable"?: "<name if basis is variable>",
   "bands": [ { "min", "max"|null, "pct" } ], "excludes"?: [<coverage codes explicitly NOT subject to
   this loading>], "output", "source_ref"? }
4. conditional_tier_selection — the workbook auto-picks a plan/value based on a condition rather than
   the user picking it directly. { "type": "conditional_tier_selection", "id", "variable", "when": [
   { "if": { "field", "op": "eq"|"gte"|"lte"|"between"|"in", "value" }, "then": "<value if true>" } ],
   "else"?, "output", "source_ref"? }
5. combine — arithmetic combination of earlier steps' outputs. { "type": "combine", "id",
   "op": "add"|"subtract"|"multiply", "inputs": [<output names>], "output", "source_ref"? }
6. gst_adjustment — GST inclusive/exclusive handling. { "type": "gst_adjustment", "id", "input_ref":
   "<output name>", "inclusive": true|false, "rate": <e.g. 0.09>, "output", "source_ref"? }

Rules:
- Read the ACTUAL formulas — do not guess generic insurance logic. If a cell's formula is just
  =VLOOKUP(age, RateTable, plan_column), that is an age_band_lookup step naming the coverage/plan it
  belongs to; if a cell computes =BaseRate*(1+LoadingPct), emit BOTH the lookup step producing
  BaseRate and either a percentage_loading or combine step for the multiplication, chained via
  "output"/references — never collapse multi-step logic into one step that hides what's happening.
- If the calculator is genuinely just a flat per-coverage age-band lookup with no other logic
  (the common case), output ONLY age_band_lookup steps, one per coverage — do not invent loading or
  conditional steps that aren't actually in the formulas.
- NEVER invent a loading percentage, threshold, or condition that isn't traceable to an actual
  formula or a stated rule in the brochure. If you cannot confidently translate a piece of logic,
  omit it rather than guessing — an incomplete-but-correct rule set is safer than a wrong one.`

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
  const text = dump ? `Workbook formulas + values:\n${JSON.stringify(dump)}` : 'No workbook dump — brochure PDF only, expect mostly age_band_lookup steps inferred from stated rate tables.'
  parts.push(forGemini ? { text } : { type: 'text', text })
  return parts
}

async function opusExtract(dump: unknown, brochureBase64?: string): Promise<{ rules: RuleStep[] | null; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { rules: null, error: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      // No extended thinking — see pm-rates-extract.ts's opusExtract for why. Translating formula
      // logic genuinely benefits more from reasoning than plain transcription does, but this
      // stage is already best-effort (never fails the pipeline) and reliability on the free plan
      // matters more right now than the accuracy this might cost on a genuinely complex formula.
      body: JSON.stringify({ model: OPUS, max_tokens: 16000, system: SYSTEM,
        messages: [{ role: 'user', content: buildUserContent(dump, brochureBase64, false) }] }),
    })
    const j = await res.json()
    if (!res.ok) return { rules: null, error: `Anthropic ${res.status}` }
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'pm_rules_extract', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { pm: 'rules_opus' } })
    const text = (j.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    const parsed = extractJson<{ rules: RuleStep[] }>(text)
    return parsed && Array.isArray(parsed.rules) ? { rules: parsed.rules } : { rules: null, error: 'unparseable' }
  } catch (e) { return { rules: null, error: String(e) } }
}

async function geminiExtract(dump: unknown, brochureBase64?: string): Promise<{ rules: RuleStep[] | null; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { rules: null, error: 'GEMINI key not set' }
  try {
    const res = await fetch(`${geminiUrl(GEMINI_PRO)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM }, ...buildUserContent(dump, brochureBase64, true)] }],
        generationConfig: { temperature: 0, maxOutputTokens: 24000, responseMimeType: brochureBase64 ? undefined : 'application/json' },
      }),
    })
    if (!res.ok) return { rules: null, error: `Gemini ${res.status}` }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: GEMINI_PRO, feature: 'pm_rules_extract', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { pm: 'rules_gemini' } })
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    const parsed = extractJson<{ rules: RuleStep[] }>(text)
    return parsed && Array.isArray(parsed.rules) ? { rules: parsed.rules } : { rules: null, error: 'unparseable' }
  } catch (e) { return { rules: null, error: String(e) } }
}

/** Structural reconciliation: unlike the rate table's cell-by-cell diff, arbitrary rule graphs
 *  aren't diffed step-by-step (that's exactly the complexity the bounded vocabulary avoids) — a
 *  single issue is raised per calculator when the two readings' step sequences differ materially
 *  (different length, or different step types at the same position), for a human to pick/hand-edit. */
export function rulesDiffer(opus: RuleStep[], gemini: RuleStep[]): boolean {
  if (opus.length !== gemini.length) return true
  const covCode = (s: RuleStep) => 'coverage_code' in s ? s.coverage_code : undefined
  return opus.some((s, i) => s.type !== gemini[i]?.type || covCode(s) !== covCode(gemini[i]))
}

export type StepFn = (label: string, step: number, total: number) => void | Promise<void>

export async function extractComputationRules(
  dump: unknown, brochureBase64: string | undefined, onStep?: StepFn,
): Promise<{ rules: RuleStep[] | null; source: ExcelShape; structurallyDisputed: boolean; error?: string }> {
  await onStep?.('Detecting calculator shape', 1, 3)
  const source = await detectExcelShape(dump)

  await onStep?.('Reading calculation logic — Opus & Gemini', 2, 3)
  const [o, g] = await Promise.all([opusExtract(dump, brochureBase64), geminiExtract(dump, brochureBase64)])
  const base = o.rules ?? g.rules
  if (!base) {
    const msg = [o.error && `opus: ${o.error}`, g.error && `gemini: ${g.error}`].filter(Boolean).join('; ')
    return { rules: null, source, structurallyDisputed: false, error: msg || 'no rules extracted' }
  }
  if (!o.rules || !g.rules) return { rules: base, source, structurallyDisputed: false }

  await onStep?.('Cross-checking calculation logic', 3, 3)
  const disputed = rulesDiffer(o.rules, g.rules)
  // Prefer Opus's reading as the stored draft either way — a structural dispute just means a human
  // needs to look before approving, same "auto-store, gate on review" pattern as the rate table.
  return { rules: o.rules, source, structurallyDisputed: disputed }
}
