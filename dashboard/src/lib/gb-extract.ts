/**
 * Pricing Matrix extraction. Three independent extractors read an insurer rate PDF, then an
 * Opus judge reconciles them and flags every numeric disagreement for human review.
 *
 *   A. Gemini deep  — long-context read of the whole document, footnotes included
 *   B. Gemini flash — an independent second read, different tier, same document
 *   C. Code parser  — deterministic text parse of the rate rows (no model) as a numeric check
 *   Judge (deep)    — merges A/B, cross-checks against C, and re-reads only the disputed cells
 *
 * A and the judge ran on Opus 4.8 until 2 Oct 2026. What makes this pipeline trustworthy is not
 * the model: it is that two independent reads must agree, a deterministic parser has to have
 * seen the number, and every disagreement is surfaced for a person before the table is approved.
 * Those checks are unchanged, and a frontier model was being paid per page to do work the deep
 * tier's long-context read does. A premium is the one number in this system that must never be
 * wrong, so the human gate stays regardless of which model read it.
 *
 * Output is a FLAT list of price points — one row per (product × member type × plan × age
 * band) — so any matrix shape fits and the models can't "sample" a nested structure.
 */
import { logAiUsage } from './gemini-usage'
import { GEMINI_FLASH, GEMINI_DEEP, geminiUrl } from './gemini-models'
import { agentKey } from './ai-agents'
import { logError } from './error-log'

// ── Shared shape ────────────────────────────────────────────────────────────────
export type MemberType = 'employee' | 'dependant' | null
export type PriceRow    = { product_title: string; member_type: MemberType; plan_code: string; band_label: string; age_min: number | null; age_max: number | null; price: number; dimensions?: Record<string, unknown> }
export type CoverageRow = { product_title: string; member_type: MemberType; plan_code: string; item_label: string; value_numeric: number | null; value_text: string | null; unit: string | null }
export type GbPlan      = { product_title: string; plan_code: string; plan_name?: string | null; hospital_type?: string | null; beds?: string | null; co_payment?: string | null }
export type GbBenefit   = { product_title?: string | null; plan_code?: string | null; category?: string | null; benefit_name: string; value_text?: string | null; value_numeric?: number | null; unit?: string | null; notes?: string | null }
export type GbExtraction = {
  insurer_name?: string | null; plan_year?: number | null; effective_date?: string | null
  age_basis?: 'next_birthday' | 'last_birthday' | null
  pricing: PriceRow[]; coverage: CoverageRow[]; plans: GbPlan[]; benefits: GbBenefit[]
}

export type ParserRow   = { band_label: string; age_min: number | null; age_max: number | null; numbers: number[] }
export type Conflict    = { product_title: string; member_type: MemberType; plan_code: string; band_label: string; opus: number | null; gemini: number | null; parser_seen: boolean; note?: string }
export type JudgeResult = { merged: GbExtraction; conflicts: Conflict[]; confidence: number; summary: string }

const EMPTY: GbExtraction = { pricing: [], coverage: [], plans: [], benefits: [] }

// ── Prompt shared by the two LLM extractors ─────────────────────────────────────
const SCHEMA_HINT = `Return ONLY valid JSON (no markdown fences) matching:
{
  "insurer_name": string|null,
  "plan_year": number|null,
  "effective_date": "YYYY-MM-DD"|null,            // rate/policy effective date if printed
  "age_basis": "next_birthday"|"last_birthday"|null,   // from the age column / footnote ("age next/last birthday")
  "pricing":  [ { "product_title": string, "member_type": "employee"|"dependant"|null, "plan_code": string, "band_label": string, "age_min": number|null, "age_max": number|null, "price": number } ],
  "coverage": [ { "product_title": string, "member_type": "employee"|"dependant"|null, "plan_code": string, "item_label": string, "value_numeric": number|null, "value_text": string|null, "unit": string|null } ],
  "plans":    [ { "product_title": string, "plan_code": string, "plan_name": string|null, "hospital_type": string|null, "beds": string|null, "co_payment": string|null } ],
  "benefits": [ { "product_title": string|null, "plan_code": string|null, "category": string|null, "benefit_name": string, "value_text": string|null, "value_numeric": number|null, "unit": string|null, "notes": string|null } ]
}

CRITICAL — COMPLETENESS (this is the whole point):
- The PDF usually has MULTIPLE premium tables across several pages. Process EVERY table on EVERY page.
- product_title = the product name, written in FULL with the printed abbreviation kept in brackets, e.g. "Group Term Life + Group Additional Critical Illness (GTL+GACI)", "Group Hospital & Surgical + Extended Major Medical (GHS+EMM)". Keep the bracketed abbreviation EXACTLY as printed (same tokens and "+" joins) so the same product reads identically across every table. See NAMING below for how to source the full wording.
- member_type from the table title: "...FOR EMPLOYEE..." -> "employee"; "...FOR DEPENDANT/DEPENDENT..." -> "dependant"; otherwise null.
- Output ONE "pricing" row for EVERY (plan column × age-band row) in EVERY premium table. If a table has 10 age bands and 4 plans, that is 40 rows — output all 40. NEVER sample, summarise, truncate, or output only the first band. Transcribe every printed number EXACTLY (keep cents; strip thousands commas).
- band_label verbatim ("Up to 29", "30-34", "70-74"). Parse age_min/age_max ("Up to 29" -> {0,29}).
- Sum-assured / coverage matrices (e.g. GACI "37 Critical Illnesses" sum assured per plan) go in "coverage", NOT "pricing".
- Also capture plan tier attributes (hospital type / beds / co-pay) in "plans" and any descriptive benefit lines in "benefits".

NAMING — NO BARE ABBREVIATIONS:
- Applies to EVERY human-readable name field: product_title, plan_name, category, item_label, benefit_name (and any plan_code that is itself an acronym).
- Whenever a value is an abbreviation/acronym (e.g. GTL, GACI, GADD, GHS, EMM, GHS-FW, GOS, CI, TPD, PA), write it as "Full Name (ABBR)" — spell out the full term and keep the exact printed abbreviation in brackets.
- Source the full wording ONLY from what is actually printed in THIS PDF: cover page, product/section headings, footnotes, legends or a glossary, benefit descriptions. Search the WHOLE document for where each acronym is defined.
- If the PDF genuinely never spells an abbreviation out anywhere, leave it EXACTLY as printed — never invent, guess, or normalise an expansion.
- Pure tier labels that are not acronyms (Plan 1, Plan 2, Class 1, Tier A, "Up to 29") are NOT abbreviations — leave them unchanged.

Before you finish, self-check: for each premium table, does every age band appear for every plan and the correct member_type? If any row is missing, add it. Completeness matters more than anything else.`

function stripJson(s: string): string {
  const t = s.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = t.indexOf('{'); const b = t.lastIndexOf('}')
  return a >= 0 && b > a ? t.slice(a, b + 1) : t
}
function safeParse(s: string): GbExtraction {
  try {
    const o = JSON.parse(stripJson(s))
    if (o && (Array.isArray(o.pricing) || Array.isArray(o.products))) {
      return { insurer_name: o.insurer_name ?? null, plan_year: o.plan_year ?? null, effective_date: o.effective_date ?? null, age_basis: o.age_basis ?? null,
        pricing: Array.isArray(o.pricing) ? o.pricing : [], coverage: Array.isArray(o.coverage) ? o.coverage : [],
        plans: Array.isArray(o.plans) ? o.plans : [], benefits: Array.isArray(o.benefits) ? o.benefits : [] }
    }
  } catch { /* fall through */ }
  return EMPTY
}

// ── A. Gemini deep (native PDF, long context) ───────────────────────────────────
/** Named extractWithOpus until 2 Oct 2026; the export name is kept so the route and its stored
 *  extraction runs keep lining up. */
export async function extractWithDeep(pdfBase64: string, profileHint: string): Promise<{ data: GbExtraction; raw: string; error?: string }> {
  const { key } = agentKey('pricingmatrix')
  if (!key) return { data: EMPTY, raw: '', error: 'No Gemini API key configured' }
  try {
    const res = await fetch(`${geminiUrl(GEMINI_DEEP)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: `You are a meticulous insurance data extractor. Extract EVERY premium and coverage table from this PDF, completely.\n${profileHint}\n\n${SCHEMA_HINT}` },
        ] }],
        // Thinking tokens come out of this same allowance, so a budget sized for the answer alone
        // returns an empty candidate with HTTP 200 rather than an error.
        generationConfig: { temperature: 0, maxOutputTokens: 60000, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      void logError({ source: 'gemini', feature: 'gb_extract_judge', statusCode: res.status, message: errText.slice(0, 1000) })
      return { data: EMPTY, raw: '', error: `Gemini ${res.status}: ${errText.slice(0, 300)}` }
    }
    const j = await res.json()
    const text: string = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
    void logAiUsage({ provider: 'gemini', model: GEMINI_DEEP, feature: 'gb_extract_schedule',
                      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
                      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { gb: 'extract_deep' } })
    return { data: safeParse(text), raw: text }
  } catch (e) {
    return { data: EMPTY, raw: '', error: e instanceof Error ? e.message : 'deep read failed' }
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
          { text: `Extract EVERY premium and coverage table from this insurance PDF, completely.\n${profileHint}\n\n${SCHEMA_HINT}` },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 60000 },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      void logError({ source: 'gemini', feature: 'gb_extract_gemini', statusCode: res.status, message: errText })
      return { data: EMPTY, raw: '', error: `Gemini ${res.status}: ${errText.slice(0, 300)}` }
    }
    const j = await res.json()
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    void logAiUsage({ provider: 'gemini', model: GEMINI_FLASH, feature: 'email_analysis', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { gb: 'extract_gemini' } })
    return { data: safeParse(text), raw: text }
  } catch (e) {
    return { data: EMPTY, raw: '', error: e instanceof Error ? e.message : 'gemini failed' }
  }
}

// ── C. Deterministic code parser (text rate rows) ───────────────────────────────
export function bandBounds(label: string): { age_min: number | null; age_max: number | null; renewal_only: boolean } {
  const renewal_only = /\*/.test(label)
  const l = label.toLowerCase()
  let m: RegExpMatchArray | null
  if ((m = l.match(/up to\s*(\d+)/)))          return { age_min: 0, age_max: +m[1], renewal_only }
  if ((m = l.match(/(\d+)\s*[-–]\s*(\d+)/)))    return { age_min: +m[1], age_max: +m[2], renewal_only }
  if ((m = l.match(/(\d+)\s*(?:and|&)\s*(?:above|over|\+)/))) return { age_min: +m[1], age_max: null, renewal_only }
  if ((m = l.match(/(?:above|over|>)\s*(\d+)/))) return { age_min: +m[1], age_max: null, renewal_only }
  return { age_min: null, age_max: null, renewal_only }
}

export function parseRatesFromText(text: string): ParserRow[] {
  const rows: ParserRow[] = []
  const bandRe = /(up to\s*\d+|\d+\s*[-–]\s*\d+\*?|\d+\s*(?:and|&)\s*(?:above|over)|(?:above|over)\s*\d+)/i
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const bm = line.match(bandRe)
    if (!bm) continue
    const band_label = bm[0].replace(/\s+/g, ' ')
    const rest = line.slice((bm.index ?? 0) + bm[0].length)
    const numbers: number[] = []
    for (const nm of Array.from(rest.matchAll(/\$?\s*([\d,]+(?:\.\d{1,2})?)/g))) {
      const tokenHadDollarOrComma = /[$,]/.test(nm[0]) || /\.\d/.test(nm[0])
      const val = parseFloat(nm[1].replace(/,/g, ''))
      if (!isFinite(val)) continue
      if (tokenHadDollarOrComma || val >= 100) numbers.push(val)
    }
    if (numbers.length) { const { age_min, age_max } = bandBounds(band_label); rows.push({ band_label, age_min, age_max, numbers }) }
  }
  return rows
}

// ── Judge: reconcile A + B, cross-check numbers vs C ─────────────────────────────
export const priceKey = (r: { product_title: string; member_type: MemberType; plan_code: string; band_label: string }) =>
  `${r.product_title}|${r.member_type ?? ''}|${r.plan_code}|${r.band_label}`

function indexPricing(e: GbExtraction): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of e.pricing ?? []) m.set(priceKey(r), r.price)
  return m
}

export async function judgeExtractions(opus: GbExtraction, gemini: GbExtraction, parser: ParserRow[]): Promise<JudgeResult> {
  const parserNums = new Set<number>()
  for (const r of parser) for (const n of r.numbers) parserNums.add(Math.round(n * 100) / 100)
  const seenByParser = (n: number) => parserNums.has(Math.round(n * 100) / 100)

  const opusIdx = indexPricing(opus)
  const gemIdx  = indexPricing(gemini)

  // Base on whichever extractor found more price points; fold in cells only the other saw.
  const richer = (opus.pricing?.length ?? 0) >= (gemini.pricing?.length ?? 0) ? opus : gemini
  const poorer = richer === opus ? gemini : opus
  const merged: GbExtraction = {
    insurer_name:   opus.insurer_name ?? gemini.insurer_name ?? null,
    plan_year:      opus.plan_year ?? gemini.plan_year ?? null,
    effective_date: opus.effective_date ?? gemini.effective_date ?? null,
    age_basis:      opus.age_basis ?? gemini.age_basis ?? null,
    pricing:  [...(richer.pricing ?? [])],
    coverage: dedupeCoverage([...(opus.coverage ?? []), ...(gemini.coverage ?? [])]),
    plans:    dedupePlans([...(opus.plans ?? []), ...(gemini.plans ?? [])]),
    benefits: (richer.benefits ?? []).length >= (poorer.benefits ?? []).length ? (richer.benefits ?? []) : (poorer.benefits ?? []),
  }
  const present = new Set(merged.pricing.map(priceKey))
  for (const r of poorer.pricing ?? []) { const k = priceKey(r); if (!present.has(k)) { present.add(k); merged.pricing.push(r) } }

  // The text parser can't read image-based tables (it finds few/no numbers). If it confirms
  // less than ~40% of the prices it's unreliable → ignore it, so we don't flag every cell
  // (which would flood the Opus judge and take forever).
  let confirmed = 0
  for (const r of merged.pricing) if (seenByParser(r.price)) confirmed++
  const parserReliable = merged.pricing.length >= 10 && confirmed / merged.pricing.length >= 0.4

  const conflicts: Conflict[] = []
  for (const r of merged.pricing) {
    const k = priceKey(r)
    const o = opusIdx.has(k) ? opusIdx.get(k)! : null
    const g = gemIdx.has(k) ? gemIdx.get(k)! : null
    const parserSeen = seenByParser(r.price)
    const disagree = o !== null && g !== null && Math.abs(o - g) > 0.001
    const onlyOne  = (o === null) !== (g === null)
    const notConfirmed = parserReliable && !parserSeen
    if (disagree || onlyOne || notConfirmed) {
      conflicts.push({ product_title: r.product_title, member_type: r.member_type, plan_code: r.plan_code, band_label: r.band_label,
        opus: o, gemini: g, parser_seen: parserSeen,
        note: disagree ? 'Opus and Gemini disagree' : onlyOne ? `Only ${o !== null ? 'Opus' : 'Gemini'} found this cell` : 'Not confirmed by the text parser' })
    }
  }

  const total = merged.pricing.length
  const confidence = total === 0 ? 0 : Math.max(0, Math.round(((total - conflicts.length) / total) * 10000) / 100)
  const summary = `${total} price points · ${conflicts.length} to review · ${merged.coverage.length} coverage rows`
  return { merged, conflicts, confidence, summary }
}

function dedupePlans(rows: GbPlan[]): GbPlan[] {
  const seen = new Set<string>(); const out: GbPlan[] = []
  for (const p of rows) { const k = `${p.product_title}|${p.plan_code}`; if (!seen.has(k)) { seen.add(k); out.push(p) } }
  return out
}
function dedupeCoverage(rows: CoverageRow[]): CoverageRow[] {
  const seen = new Set<string>(); const out: CoverageRow[] = []
  for (const c of rows) { const k = `${c.product_title}|${c.member_type ?? ''}|${c.plan_code}|${c.item_label}`; if (!seen.has(k)) { seen.add(k); out.push(c) } }
  return out
}

// ── Judge — a focused re-read of the disputed cells only ────────────────────────
export type Adjudication = Record<string, { price: number | null; confidence: number; reason: string }>
export const conflictKey = priceKey

export async function adjudicate(pdfBase64: string, conflicts: Conflict[]): Promise<Adjudication> {
  const { key } = agentKey('pricingmatrix')
  if (!key || conflicts.length === 0) return {}
  try {
    // The two reads are labelled first/second rather than by model, so the judge has no reason to
    // favour either: it is being asked what the page says, not which extractor it trusts.
    const list = conflicts.slice(0, 200).map(c => ({ key: priceKey(c), product: c.product_title, member_type: c.member_type, plan: c.plan_code, age_band: c.band_label, first_read: c.opus, second_read: c.gemini }))
    const res = await fetch(`${geminiUrl(GEMINI_DEEP)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: `Two extractors disagreed on these premium cells (or a text parser couldn't confirm them). For EACH, find the exact price printed in the PDF for that product + member type + plan + age band and report the value you actually read.\n\nCELLS:\n${JSON.stringify(list, null, 2)}\n\nReturn ONLY JSON: { "<key>": { "price": number|null, "confidence": 0-100, "reason": string } } using the exact "key" values above. price=null if you genuinely cannot find it.` },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 30000, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      void logError({ source: 'gemini', feature: 'gb_extract_judge', statusCode: res.status, message: (await res.text()).slice(0, 1000) })
      return {}
    }
    const j = await res.json()
    const text: string = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
    void logAiUsage({ provider: 'gemini', model: GEMINI_DEEP, feature: 'gb_extract_schedule',
                      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
                      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0, metadata: { gb: 'judge' } })
    try { return JSON.parse(stripJson(text)) as Adjudication } catch { return {} }
  } catch { return {} }
}
