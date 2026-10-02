/**
 * Group Benefits — the annual read of an insurer's benefit schedule onto the canon.
 *
 * Why this is separate from gb-extract.ts. That pipeline reads PREMIUMS, and it works: 612 real
 * age-banded rates across three insurers. What it never produced was a usable benefit schedule —
 * 28 rows for three insurers and twenty-three products, with ad-hoc categories and, for AIA, no
 * plan code at all. A quote could be totalled and not compared.
 *
 * The fix is not a better free-form extraction. It is asking a bounded question: here are the
 * canonical lines this product has, here are the plan tiers already on record, fill in the values
 * the brochure actually prints. The answer lands directly in the canon with no mapping step
 * afterwards, every row is addressable, and a line the brochure omits comes back omitted rather
 * than invented.
 *
 * Each insurer is read once a plan year, because that is how often insurers reprice. The result
 * is a candidate for a human to approve, never a live schedule — a misread limit becomes a
 * premium quoted to a client, so the gate is the point.
 */
import { GEMINI_DEEP, geminiUrl } from '@/lib/gemini-models'
import { agentKey } from '@/lib/ai-agents'
import { logAiUsage } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'
import { benefitsFor, PRODUCT_BY_CODE, BENEFIT_BY_CODE } from './canon'

export type ScheduleRow = {
  product_code: string
  plan_code: string | null
  canon_benefit: string
  /** Exactly as printed. The broker reads this; the comparison parses it. */
  value_text: string
  value_numeric: number | null
  /** Where in the document it was read, so a disputed figure can be checked. */
  source: string | null
}

export type ScheduleExtraction = {
  rows: ScheduleRow[]
  /** Lines the brochure prints that match no canonical line. Reported so the canon can grow,
   *  never dropped silently — a benefit only one insurer offers is a real finding. */
  unmatched: { product_code: string | null; plan_code: string | null; label: string; value: string }[]
  notes: string | null
  model: string
  error?: string
}

const EMPTY: Omit<ScheduleExtraction, 'model'> = { rows: [], unmatched: [], notes: null }

function prompt(insurerName: string, productCodes: string[], planCodes: Record<string, string[]>): string {
  const lines = productCodes.flatMap(pc => {
    const product = PRODUCT_BY_CODE[pc]
    if (!product) return []
    return [`\n${product.name} (${product.abbrev}) — product_code "${pc}", plan codes on record: ${(planCodes[pc] ?? []).join(', ') || 'none yet'}`,
      ...benefitsFor(pc).map(b => `  ${b.code} | ${b.name} | printed as: ${describe(b.compareAs)}`)]
  }).join('\n')

  return `You are reading a Singapore group employee benefits brochure from ${insurerName} and
transcribing its BENEFIT SCHEDULE onto a fixed list of lines. You are not summarising and not
advising. You are copying printed values into named slots.

THE LINES. Use these codes exactly. Do not invent a code.
${lines}

RULES, in order of importance:

1. Copy what is printed, verbatim, into value_text. "As charged", "$300,000", "1-Bedded",
   "80% of eligible expenses", "Not covered" — all go in as written. Never round, re-word,
   convert a currency or combine two printed figures into one.
2. If the brochure does not state a line, OMIT it. Do not write "nil", "not applicable", "—" or
   a guess. A missing line is a fact worth knowing and the comparison shows it as missing.
3. One row per plan tier. Benefit schedules are printed as a table with one column per plan, so
   a line with five plan columns produces five rows with different plan_code values. Use the
   plan codes listed above where they match what the brochure prints; where the brochure uses a
   different label for the same tier, use the brochure's label.
4. If a line genuinely applies to every tier (a policy-wide term, a geographical scope, a
   pre-existing-conditions clause), write ONE row with plan_code null.
5. value_numeric: only when the printed value is a plain amount — "$300,000" gives 300000,
   "80%" gives 80, "1-Bedded" gives null, "As charged" gives null. Strip currency symbols and
   thousands separators. If you are not certain, use null; value_text is what is authoritative.
6. source: the page number or section heading you read it from, if the document shows one.
7. Anything the brochure prints as a benefit that matches NO code above goes in "unmatched" with
   its printed label and value. Do not force it into a nearby code.

Process every page. Benefit schedules commonly run across several pages and continue after the
premium tables.

Return ONLY this JSON:
{
  "rows": [ { "product_code": "<one of the codes above>", "plan_code": "<label or null>",
              "canon_benefit": "<one of the line codes above>", "value_text": "<verbatim>",
              "value_numeric": <number|null>, "source": "<page/section|null>" } ],
  "unmatched": [ { "product_code": "<code|null>", "plan_code": "<label|null>",
                   "label": "<printed benefit name>", "value": "<printed value>" } ],
  "notes": "<anything that affects how these values should be read, or null>"
}`
}

function describe(compareAs: string): string {
  switch (compareAs) {
    case 'sgd_limit':     return 'a dollar limit'
    case 'sgd_per_visit': return 'a dollar amount per visit'
    case 'sgd_per_day':   return 'a dollar amount per day'
    case 'room_tier':     return 'a ward or bed class'
    case 'percent':       return 'a percentage, or a flat co-payment amount'
    case 'salary_multiple': return 'a multiple of salary'
    case 'days':          return 'a count'
    case 'boolean':       return 'yes or no'
    default:              return 'free text'
  }
}

type Raw = {
  rows?: unknown[]
  unmatched?: unknown[]
  notes?: unknown
}

function clean(raw: Raw, productCodes: string[]): Omit<ScheduleExtraction, 'model'> {
  const allowedProducts = new Set(productCodes)
  const rows: ScheduleRow[] = []
  for (const r of Array.isArray(raw.rows) ? raw.rows : []) {
    const o = r as Record<string, unknown>
    const product_code = String(o.product_code ?? '')
    const canon_benefit = String(o.canon_benefit ?? '')
    const value_text = typeof o.value_text === 'string' ? o.value_text.trim() : ''
    // Defence in depth against a code the model made up, and against a line attributed to a
    // product this document does not cover. Both would land a value in the wrong column.
    const canon = BENEFIT_BY_CODE[canon_benefit]
    if (!canon || !allowedProducts.has(product_code) || canon.productCode !== product_code) continue
    if (!value_text) continue
    const n = o.value_numeric
    rows.push({
      product_code, canon_benefit, value_text,
      plan_code: typeof o.plan_code === 'string' && o.plan_code.trim() ? o.plan_code.trim() : null,
      value_numeric: typeof n === 'number' && isFinite(n) ? n : null,
      source: typeof o.source === 'string' && o.source.trim() ? o.source.trim() : null,
    })
  }
  const unmatched = (Array.isArray(raw.unmatched) ? raw.unmatched : []).map(u => {
    const o = u as Record<string, unknown>
    return {
      product_code: typeof o.product_code === 'string' ? o.product_code : null,
      plan_code:    typeof o.plan_code === 'string' ? o.plan_code : null,
      label:        String(o.label ?? '').trim(),
      value:        String(o.value ?? '').trim(),
    }
  }).filter(u => u.label)
  return { rows, unmatched, notes: typeof raw.notes === 'string' ? raw.notes : null }
}

function parseJson(text: string): Raw {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a < 0 || b <= a) return {}
  try { return JSON.parse(t.slice(a, b + 1)) as Raw } catch { return {} }
}

export async function extractSchedule(
  pdfBase64: string,
  opts: { insurerName: string; productCodes: string[]; planCodes?: Record<string, string[]> },
): Promise<ScheduleExtraction> {
  const productCodes = opts.productCodes.filter(c => PRODUCT_BY_CODE[c])
  if (!productCodes.length) {
    return { ...EMPTY, model: GEMINI_DEEP, error: 'No canonical product for this table — map its label first.' }
  }
  const { key, via } = agentKey('pricingmatrix')
  if (!key) return { ...EMPTY, model: GEMINI_DEEP, error: 'No Gemini API key configured' }

  try {
    const res = await fetch(`${geminiUrl(GEMINI_DEEP)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: prompt(opts.insurerName, productCodes, opts.planCodes ?? {}) },
        ] }],
        // Generous, and deliberately so: a full schedule across seven plan tiers is hundreds of
        // rows, and thinking tokens are drawn from this same allowance. A budget sized for the
        // answer alone returns an empty candidate with HTTP 200 — the failure that silently
        // emptied the email classifiers in September.
        generationConfig: { temperature: 0, maxOutputTokens: 60000, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      void logError({ source: 'gemini', feature: 'gb_extract_schedule', statusCode: res.status,
                      message: errText.slice(0, 1000), metadata: { insurer: opts.insurerName, via } })
      return { ...EMPTY, model: GEMINI_DEEP, error: `Gemini ${res.status}: ${errText.slice(0, 300)}` }
    }
    const j = await res.json()
    void logAiUsage({ provider: 'gemini', model: GEMINI_DEEP, feature: 'gb_extract_schedule',
                      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
                      outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
                      metadata: { insurer: opts.insurerName, products: productCodes } })
    const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '').join('')
    if (!text.trim()) {
      return { ...EMPTY, model: GEMINI_DEEP, error: 'The model returned nothing. Usually the output budget was spent on reasoning.' }
    }
    return { ...clean(parseJson(text), productCodes), model: GEMINI_DEEP }
  } catch (e) {
    return { ...EMPTY, model: GEMINI_DEEP, error: e instanceof Error ? e.message : 'extraction failed' }
  }
}
