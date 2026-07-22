/**
 * RFQ Quote Decision (#4) — the "grand analysis" for an RFQ case.
 *
 * When insurers reply with quotes, Nexus's Run Analysis produces a per-LINE
 * decision: each insurer laid out objectively (benefits + downsides), then a
 * broker recommendation with reasoning. Headline + key-difference depth; for a
 * deeper clause-by-clause read the employee asks Opus in the consultant chat
 * (which has live attachment read-tools).
 *
 * Figures come straight from the persisted rfq_quotes (verbatim, DB-sourced) —
 * the model only reasons about pros/cons/recommendation, never invents numbers.
 */
import { productLineLabel } from '@/lib/product-lines'
import { logAnthropicUsage, logGeminiUsage } from '@/lib/gemini-usage'

const SB_URL        = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const GEMINI_PRO    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export type QuoteOptionAnalysis = {
  dispatch_id:      string
  insurer_name:     string
  premium?:         string | null
  excess?:          string | null
  limit_indemnity?: string | null
  validity?:        string | null
  pros:             string[]
  cons:             string[]
}

export type LineDecision = {
  rfq_request_id:          string
  product_line:            string
  product_line_label:      string
  options:                 QuoteOptionAnalysis[]
  recommended_dispatch_id: string | null
  recommended_insurer:     string | null
  rationale:               string
  caveats:                 string[]
}

export type QuoteDecisionV1 = {
  generated_ts: string
  lines:        LineDecision[]
  note:         string
}

type QuoteRow = {
  dispatch_id: string; rfq_request_id: string | null; insurer_name: string | null; product_line: string | null
  premium: string | null; excess: string | null; limit_indemnity: string | null
  validity: string | null; key_terms: string[] | null; exclusions: string[] | null; summary: string | null
}

function parseJson(raw: string): unknown {
  const s = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(s) } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* noop */ } }
  return null
}

// Model returns per-line reasoning keyed by dispatch_id; figures stay DB-sourced.
type ModelLine = {
  rfq_request_id?: string
  recommended_dispatch_id?: string | null
  rationale?: string
  caveats?: string[]
  options?: { dispatch_id: string; pros?: string[]; cons?: string[] }[]
}

async function reason(prompt: string): Promise<{ lines?: ModelLine[] } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (key) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 5000, thinking: { type: 'adaptive' }, messages: [{ role: 'user', content: prompt }] }),
      })
      if (res.ok) {
        const data = await res.json()
        void logAnthropicUsage('rfq_quote_decision', data?.usage)
        const text = ((data?.content ?? []) as { type?: string; text?: string }[]).find(b => b.type === 'text')?.text ?? ''
        const parsed = parseJson(text) as { lines?: ModelLine[] } | null
        if (parsed?.lines) return parsed
      }
    } catch { /* fall through to Gemini */ }
  }
  const gkey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
  if (gkey) {
    try {
      const res = await fetch(`${GEMINI_PRO}?key=${gkey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }),
      })
      if (res.ok) {
        const data = await res.json()
        void logGeminiUsage('rfq_quote_decision', data?.usageMetadata ?? {}, null, 'gemini-3.1-pro-preview')
        return parseJson((data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()) as { lines?: ModelLine[] } | null
      }
    } catch { /* noop */ }
  }
  return null
}

export async function buildQuoteDecision(caseId: string): Promise<QuoteDecisionV1 | null> {
  // Quotes captured on this case.
  const qRes = await fetch(
    `${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${caseId}&select=dispatch_id,rfq_request_id,insurer_name,product_line,premium,excess,limit_indemnity,validity,key_terms,exclusions,summary`,
    { headers: sbH(), cache: 'no-store' },
  )
  const quotes: QuoteRow[] = qRes.ok ? await qRes.json() : []
  if (!Array.isArray(quotes) || quotes.length === 0) return null

  // Group quotes into lines (rfq_request_id; fall back to product_line).
  const byLine = new Map<string, QuoteRow[]>()
  for (const q of quotes) {
    const key = q.rfq_request_id ?? `pl:${q.product_line ?? 'unknown'}`
    if (!byLine.has(key)) byLine.set(key, [])
    byLine.get(key)!.push(q)
  }

  // Build one prompt covering every line with quotes.
  const linesForPrompt = Array.from(byLine.entries()).map(([lineKey, qs]) => {
    const opts = qs.map(q => [
      `  - dispatch_id: ${q.dispatch_id}`,
      `    insurer: ${q.insurer_name ?? 'Insurer'}`,
      `    premium: ${q.premium ?? 'not stated'}`,
      `    excess: ${q.excess ?? 'not stated'}`,
      `    limit: ${q.limit_indemnity ?? 'not stated'}`,
      `    validity: ${q.validity ?? 'not stated'}`,
      q.key_terms?.length ? `    key_terms: ${q.key_terms.join('; ')}` : null,
      q.exclusions?.length ? `    exclusions: ${q.exclusions.join('; ')}` : null,
      q.summary ? `    summary: ${q.summary}` : null,
    ].filter(Boolean).join('\n')).join('\n')
    return `LINE ${lineKey} (${productLineLabel(qs[0].product_line ?? '')}):\n${opts}`
  }).join('\n\n')

  const prompt = `You are a senior insurance broker at Trade Risk Solutions (TRS), Singapore, deciding which insurer quote to recommend to the client — per line of insurance.

For EACH line below, analyse the insurer options and decide. Rules:
- Assess apples-to-apples: options may quote different limits/excess/scope — call out where they are NOT directly comparable.
- For EACH insurer option, give concrete BENEFITS (pros) and DOWNSIDES (cons) grounded ONLY in the figures/terms provided. Do not invent numbers or coverage.
- Then pick ONE option to recommend (recommended_dispatch_id) and explain WHY in a short, honest rationale (value, cover, terms) — balanced, not salesy.
- Add caveats where relevant: quotes nearing expiry (validity), missing figures, or coverage gaps the client must accept.
- Depth is headline + key differences. Do not attempt a full clause-by-clause wording comparison here.

${linesForPrompt}

Return ONLY JSON:
{
  "lines": [
    {
      "rfq_request_id": "<the LINE id exactly as given>",
      "recommended_dispatch_id": "<dispatch_id of the pick, or null if genuinely too close>",
      "rationale": "why this pick (or the trade-off if no clear winner)",
      "caveats": ["expiry / comparability / gaps"],
      "options": [
        { "dispatch_id": "<id>", "pros": ["benefit"], "cons": ["downside"] }
      ]
    }
  ]
}`

  const out = await reason(prompt)
  if (!out?.lines) return null

  const modelByLine = new Map<string, ModelLine>()
  for (const ml of out.lines) if (ml.rfq_request_id) modelByLine.set(ml.rfq_request_id, ml)

  const lines: LineDecision[] = Array.from(byLine.entries()).map(([lineKey, qs]) => {
    const ml = modelByLine.get(lineKey)
    const proConById = new Map((ml?.options ?? []).map(o => [o.dispatch_id, o]))
    const options: QuoteOptionAnalysis[] = qs.map(q => {
      const pc = proConById.get(q.dispatch_id)
      return {
        dispatch_id:     q.dispatch_id,
        insurer_name:    q.insurer_name ?? 'Insurer',
        premium:         q.premium,
        excess:          q.excess,
        limit_indemnity: q.limit_indemnity,
        validity:        q.validity,
        pros:            Array.isArray(pc?.pros) ? pc!.pros : [],
        cons:            Array.isArray(pc?.cons) ? pc!.cons : [],
      }
    })
    const recId = ml?.recommended_dispatch_id ?? null
    return {
      rfq_request_id:          qs[0].rfq_request_id ?? lineKey,
      product_line:            qs[0].product_line ?? '',
      product_line_label:      productLineLabel(qs[0].product_line ?? ''),
      options,
      recommended_dispatch_id: recId,
      recommended_insurer:     recId ? (qs.find(q => q.dispatch_id === recId)?.insurer_name ?? null) : null,
      rationale:               ml?.rationale ?? '',
      caveats:                 Array.isArray(ml?.caveats) ? ml!.caveats : [],
    }
  })

  return {
    generated_ts: new Date().toISOString(),
    lines,
    note: 'Headline comparison. For a deeper clause-by-clause T&C read, ask Opus in the chat — it can pull the exact wording from the quote attachments.',
  }
}
