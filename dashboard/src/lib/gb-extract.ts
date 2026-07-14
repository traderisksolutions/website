/**
 * Group Benefits extraction (Phase 1). Three independent extractors read an insurer rate
 * PDF, then an Opus judge reconciles them and flags every numeric disagreement for human
 * review. Rates (the numbers) must be exact; benefits are captured flexibly (EAV).
 *
 *   A. Opus 4.8   — reads the PDF natively (document block), best at messy tables + footnotes
 *   B. Gemini     — independent vision read (different model family)
 *   C. Code parser — deterministic text parse of the rate rows (no LLM) as a numeric check
 *   Judge (Opus)  — merges A/B, cross-checks the numbers against C, emits conflicts
 */
import { logAiUsage } from './gemini-usage'
import { GEMINI_FLASH, geminiUrl } from './gemini-models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const OPUS = 'claude-opus-4-8'

// ── Shared shape ────────────────────────────────────────────────────────────────
export type GbPlan    = { plan_code: string; plan_name?: string | null; hospital_type?: string | null; beds?: string | null; co_payment?: string | null; renewal_only?: boolean }
export type GbRate    = { plan_code: string; band_label: string; age_min: number | null; age_max: number | null; premium: number; renewal_only?: boolean }
export type GbBenefit = { plan_code?: string | null; category?: string | null; benefit_name: string; value_text?: string | null; value_numeric?: number | null; unit?: string | null; notes?: string | null }
export type GbProduct = { product_code: string; product_name?: string | null; age_basis?: 'next_birthday' | 'last_birthday' | null; plans: GbPlan[]; rates: GbRate[]; benefits: GbBenefit[] }
export type GbExtraction = { insurer_name?: string | null; products: GbProduct[] }

export type ParserRow    = { band_label: string; age_min: number | null; age_max: number | null; numbers: number[] }
export type Conflict     = { product_code: string; plan_code: string; band_label: string; opus: number | null; gemini: number | null; parser_seen: boolean; note?: string }
export type JudgeResult  = { merged: GbExtraction; conflicts: Conflict[]; confidence: number; summary: string }

const EMPTY: GbExtraction = { products: [] }

// ── Prompt shared by the two LLM extractors ─────────────────────────────────────
const SCHEMA_HINT = `Return ONLY valid JSON (no markdown fences) matching:
{
  "insurer_name": string|null,
  "products": [{
    "product_code": "GHS"|"GOC"|"GOS"|string,   // GHS=hospital&surgical, GOC=outpatient clinical, GOS=outpatient specialist rider; else the printed product name
    "product_name": string|null,
    "age_basis": "next_birthday"|"last_birthday"|null,   // read from the age column header (e.g. "AGE NEXT BIRTHDAY")
    "plans": [{ "plan_code": string, "plan_name": string|null, "hospital_type": string|null, "beds": string|null, "co_payment": string|null, "renewal_only": boolean }],
    "rates": [{ "plan_code": string, "band_label": string, "age_min": number|null, "age_max": number|null, "premium": number, "renewal_only": boolean }],
    "benefits": [{ "plan_code": string|null, "category": string|null, "benefit_name": string, "value_text": string|null, "value_numeric": number|null, "unit": string|null, "notes": string|null }]
  }]
}
RULES:
- Transcribe EVERY premium number EXACTLY as printed (keep cents). Never round, never infer a missing cell — omit it.
- band_label is verbatim ("Up to 25", "26-30", "71-75*"). Parse age_min/age_max from it; "Up to 25" -> {0,25}. A trailing "*" (or footnote "for renewal only") -> renewal_only=true.
- Capture co-payment / hospital type / bed type per plan from the schedule (these differentiate insurers).
- For benefits, one row per benefit line per plan (or plan_code=null if a single value spans all plans). Put the printed value in value_text, and value_numeric only when it's a clean dollar amount.
- Include ALL products, plans, age bands and benefit lines you can see across every page.`

function stripJson(s: string): string {
  const t = s.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = t.indexOf('{'); const b = t.lastIndexOf('}')
  return a >= 0 && b > a ? t.slice(a, b + 1) : t
}

function safeParse(s: string): GbExtraction {
  try {
    const o = JSON.parse(stripJson(s))
    if (o && Array.isArray(o.products)) return o as GbExtraction
  } catch { /* fall through */ }
  return EMPTY
}

// ── A. Opus (native PDF) ────────────────────────────────────────────────────────
export async function extractWithOpus(pdfBase64: string, profileHint: string): Promise<{ data: GbExtraction; raw: string; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { data: EMPTY, raw: '', error: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: `You are a meticulous insurance data extractor. Extract the group-benefits rate matrices and benefit schedules from this PDF.\n${profileHint}\n\n${SCHEMA_HINT}` },
          ],
        }],
      }),
    })
    if (!res.ok) return { data: EMPTY, raw: '', error: `Opus ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j = await res.json()
    const text = (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'nexus_strategy', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { gb: 'extract_opus' } })
    return { data: safeParse(text), raw: text }
  } catch (e) {
    return { data: EMPTY, raw: '', error: e instanceof Error ? e.message : 'opus failed' }
  }
}

// ── B. Gemini (inline PDF) ──────────────────────────────────────────────────────
export async function extractWithGemini(pdfBase64: string, profileHint: string): Promise<{ data: GbExtraction; raw: string; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { data: EMPTY, raw: '', error: 'GEMINI key not set' }
  try {
    const res = await fetch(`${geminiUrl(GEMINI_FLASH)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: `Extract the group-benefits rate matrices and benefit schedules from this insurance PDF.\n${profileHint}\n\n${SCHEMA_HINT}` },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32000 },
      }),
    })
    if (!res.ok) return { data: EMPTY, raw: '', error: `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j = await res.json()
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    void logAiUsage({ provider: 'gemini', model: GEMINI_FLASH, feature: 'email_analysis', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { gb: 'extract_gemini' } })
    return { data: safeParse(text), raw: text }
  } catch (e) {
    return { data: EMPTY, raw: '', error: e instanceof Error ? e.message : 'gemini failed' }
  }
}

// ── C. Deterministic code parser (text rate rows) ───────────────────────────────
function bandBounds(label: string): { age_min: number | null; age_max: number | null; renewal_only: boolean } {
  const renewal_only = /\*/.test(label)
  const l = label.toLowerCase()
  let m: RegExpMatchArray | null
  if ((m = l.match(/up to\s*(\d+)/)))          return { age_min: 0, age_max: +m[1], renewal_only }
  if ((m = l.match(/(\d+)\s*[-–]\s*(\d+)/)))    return { age_min: +m[1], age_max: +m[2], renewal_only }
  if ((m = l.match(/(\d+)\s*(?:and|&)\s*(?:above|over|\+)/))) return { age_min: +m[1], age_max: null, renewal_only }
  if ((m = l.match(/(?:above|over|>)\s*(\d+)/))) return { age_min: +m[1], age_max: null, renewal_only }
  return { age_min: null, age_max: null, renewal_only }
}

// Extract, for each age-band row, the premium numbers on that line. Ages (small bare ints)
// are filtered out; premiums have cents, a thousands comma, a $ sign, or are >= 100.
export function parseRatesFromText(text: string): ParserRow[] {
  const rows: ParserRow[] = []
  const bandRe = /(up to\s*\d+|\d+\s*[-–]\s*\d+\*?|\d+\s*(?:and|&)\s*(?:above|over)|(?:above|over)\s*\d+)/i
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const bm = line.match(bandRe)
    if (!bm) continue
    const band_label = bm[0].replace(/\s+/g, ' ')
    // Numbers after the band label on the same line.
    const rest = line.slice((bm.index ?? 0) + bm[0].length)
    const numbers: number[] = []
    for (const nm of Array.from(rest.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g))) {
      const tokenHadDollarOrComma = /[$,]/.test(nm[0]) || /\.\d/.test(nm[0])
      const val = parseFloat(nm[1].replace(/,/g, ''))
      if (!isFinite(val)) continue
      if (tokenHadDollarOrComma || val >= 100) numbers.push(val)
    }
    if (numbers.length) {
      const { age_min, age_max } = bandBounds(band_label)
      rows.push({ band_label, age_min, age_max, numbers })
    }
  }
  return rows
}

// ── Judge (Opus reconciles A + B, cross-checks numbers vs C) ─────────────────────
export async function judgeExtractions(opus: GbExtraction, gemini: GbExtraction, parser: ParserRow[]): Promise<JudgeResult> {
  // Deterministic merge + conflict detection on the RATES (the must-be-exact part).
  // The merged skeleton is Opus's structure (usually strongest on layout); we then walk
  // every (product, plan, band) and compare Opus vs Gemini vs the parser's seen numbers.
  const parserNums = new Set<number>()
  for (const r of parser) for (const n of r.numbers) parserNums.add(Math.round(n * 100) / 100)

  const gemIndex = new Map<string, number>()
  for (const p of gemini.products ?? []) for (const rt of p.rates ?? []) gemIndex.set(`${p.product_code}|${rt.plan_code}|${rt.band_label}`, rt.premium)

  const conflicts: Conflict[] = []
  const merged: GbExtraction = { insurer_name: opus.insurer_name ?? gemini.insurer_name ?? null, products: opus.products ?? [] }

  for (const p of merged.products) {
    for (const rt of p.rates ?? []) {
      const g = gemIndex.get(`${p.product_code}|${rt.plan_code}|${rt.band_label}`) ?? null
      const parserSeen = parserNums.has(Math.round(rt.premium * 100) / 100)
      const disagree = g !== null && Math.abs(g - rt.premium) > 0.001
      if (disagree || !parserSeen) {
        conflicts.push({
          product_code: p.product_code, plan_code: rt.plan_code, band_label: rt.band_label,
          opus: rt.premium, gemini: g, parser_seen: parserSeen,
          note: disagree ? 'Opus and Gemini disagree' : 'Not confirmed by the text parser',
        })
      }
    }
  }
  // Gemini rates that Opus missed entirely.
  const opusKeys = new Set<string>()
  for (const p of opus.products ?? []) for (const rt of p.rates ?? []) opusKeys.add(`${p.product_code}|${rt.plan_code}|${rt.band_label}`)
  for (const p of gemini.products ?? []) for (const rt of p.rates ?? []) {
    const kk = `${p.product_code}|${rt.plan_code}|${rt.band_label}`
    if (!opusKeys.has(kk)) conflicts.push({ product_code: p.product_code, plan_code: rt.plan_code, band_label: rt.band_label, opus: null, gemini: rt.premium, parser_seen: parserNums.has(Math.round(rt.premium * 100) / 100), note: 'Only Gemini found this cell' })
  }

  const totalRates = merged.products.reduce((n, p) => n + (p.rates?.length ?? 0), 0)
  const confidence = totalRates === 0 ? 0 : Math.round(((totalRates - conflicts.length) / totalRates) * 10000) / 100
  const summary = `${totalRates} rate cells · ${conflicts.length} to review · ${merged.products.length} product(s)`
  return { merged, conflicts, confidence: Math.max(0, confidence), summary }
}

// ── Opus judge — focused adjudication of the disputed cells only ─────────────────
// Opus re-reads the PDF for just the cells the two extractors disagreed on (or the parser
// couldn't confirm) and returns the value it reads, with confidence. Bounded: input is the
// small conflict list, output is one line per conflict.
export type Adjudication = Record<string, { premium: number | null; confidence: number; reason: string }>
export const conflictKey = (c: { product_code: string; plan_code: string; band_label: string }) => `${c.product_code}|${c.plan_code}|${c.band_label}`

export async function adjudicateWithOpus(pdfBase64: string, conflicts: Conflict[]): Promise<Adjudication> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || conflicts.length === 0) return {}
  try {
    const list = conflicts.slice(0, 120).map(c => ({ key: conflictKey(c), product: c.product_code, plan: c.plan_code, age_band: c.band_label, opus_value: c.opus, gemini_value: c.gemini }))
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPUS,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: `Two extractors disagreed on these rate cells (or a text parser couldn't confirm them). For EACH, find the exact premium printed in the PDF for that product + plan + age band and report the value you actually read.\n\nCELLS:\n${JSON.stringify(list, null, 2)}\n\nReturn ONLY JSON: { "<key>": { "premium": number|null, "confidence": 0-100, "reason": string } } using the exact "key" values above. premium=null if you genuinely cannot find it.` },
          ],
        }],
      }),
    })
    if (!res.ok) return {}
    const j = await res.json()
    const text = (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('')
    void logAiUsage({ provider: 'anthropic', model: OPUS, feature: 'nexus_strategy', inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0, metadata: { gb: 'judge' } })
    try { return JSON.parse(stripJson(text)) as Adjudication } catch { return {} }
  } catch { return {} }
}
