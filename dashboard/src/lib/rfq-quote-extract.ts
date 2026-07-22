/**
 * Shared insurer-quote extraction (Workstream 1).
 *
 * Given a replied RFQ dispatch, read the insurer's latest inbound email body AND
 * the parsed text of every attachment on that thread, then extract the quote with
 * an anti-hallucination contract: every figure is returned VERBATIM (word-for-word,
 * with currency) plus a verbatim source excerpt, or null. Persisted to rfq_quotes,
 * keyed by dispatch_id (idempotent upsert).
 *
 * Used by both the on-demand compare endpoint and the ingest auto-capture trigger.
 */
import { logGeminiUsage } from '@/lib/gemini-usage'
import { logRfqEvent }    from '@/lib/rfq-log'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const geminiUrl  = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type FieldEvidence = { value: string | null; excerpt: string | null; source: string | null }
type ExtractedQuote = {
  premium:         FieldEvidence
  excess:          FieldEvidence
  limit_indemnity: FieldEvidence
  validity:        FieldEvidence
  key_terms:       string[]
  exclusions:      string[]
  summary:         string | null
  primary_source:  string | null
}

const EMPTY_FIELD: FieldEvidence = { value: null, excerpt: null, source: null }

export type QuoteRow = {
  dispatch_id: string
  insurer_name: string | null
  product_line: string | null
  premium: string | null
  excess: string | null
  limit_indemnity: string | null
  validity: string | null
  key_terms: string[]
  exclusions: string[]
  summary: string | null
  evidence: Record<string, { excerpt: string | null; source: string | null }>
  primary_source: string | null
}

// Build the labelled source corpus: email body + each attachment's parsed text.
export async function loadSources(threadId: string): Promise<{ text: string; hasContent: boolean; messageId: string | null }> {
  const [mRes, aRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/email_messages?thread_id=eq.${threadId}&direction=eq.inbound&order=sent_at.desc&select=id,body_text&limit=1`, { headers: sbH(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/email_attachments?thread_id=eq.${threadId}&parsed_text=not.is.null&select=filename,parsed_text&order=created_at.asc`, { headers: sbH(), cache: 'no-store' }),
  ])
  const msg  = mRes.ok ? (await mRes.json())[0] : null
  const atts = aRes.ok ? await aRes.json() : []

  const parts: string[] = []
  if (msg?.body_text) parts.push(`=== SOURCE: email body ===\n${String(msg.body_text).slice(0, 12_000)}`)
  for (const a of (Array.isArray(atts) ? atts : [])) {
    if (a.parsed_text) parts.push(`=== SOURCE: attachment: ${a.filename} ===\n${String(a.parsed_text).slice(0, 20_000)}`)
  }
  return { text: parts.join('\n\n'), hasContent: parts.length > 0, messageId: msg?.id ?? null }
}

export async function extract(corpus: string, apiKey: string, model = 'gemini-3.6-flash'): Promise<ExtractedQuote | null> {
  const prompt = `You are extracting an insurance quotation for a Singapore broker (Trade Risk Solutions). Below are one or more SOURCE blocks (the insurer's email body and/or attachment text). Extract the quote STRICTLY.

RULES — read carefully:
- Copy every figure EXACTLY as written, word for word, including the currency symbol/code and thousands separators (e.g. "SGD 12,500.00 per annum"). Do NOT round, convert currencies, add, combine, or infer any number.
- For each figure you MUST also return an "excerpt": a short VERBATIM span (copied character-for-character from the SOURCE) that contains that figure, and "source": the exact SOURCE label it came from (e.g. "email body" or "attachment: quote.pdf").
- If a value is not explicitly stated in the SOURCES, return null for its "value", "excerpt" and "source". NEVER guess. Do not pull a number from an unrelated line.
- If two different figures could be the premium, prefer the one explicitly labelled premium/total payable; if genuinely ambiguous, return null.

Return ONLY JSON:
{
  "premium":         { "value": "<verbatim or null>", "excerpt": "<verbatim span or null>", "source": "<label or null>" },
  "excess":          { "value": "<verbatim or null>", "excerpt": "<verbatim span or null>", "source": "<label or null>" },
  "limit_indemnity": { "value": "<verbatim or null>", "excerpt": "<verbatim span or null>", "source": "<label or null>" },
  "validity":        { "value": "<quote valid-until, verbatim or null>", "excerpt": "<verbatim span or null>", "source": "<label or null>" },
  "key_terms":       ["<notable term / sub-limit, verbatim where numeric>"],
  "exclusions":      ["<notable exclusion>"],
  "summary":         "<one-line plain summary of the offer>",
  "primary_source":  "<the SOURCE label where the premium was found, or the most informative source>"
}

SOURCES:
${corpus.slice(0, 30_000)}`

  const res = await fetch(`${geminiUrl(model)}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (data?.usageMetadata) logGeminiUsage('email_analysis', data.usageMetadata, null, model).catch(() => {})
  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  try {
    const p = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim())
    return {
      premium:         p.premium         ?? EMPTY_FIELD,
      excess:          p.excess          ?? EMPTY_FIELD,
      limit_indemnity: p.limit_indemnity ?? EMPTY_FIELD,
      validity:        p.validity        ?? EMPTY_FIELD,
      key_terms:       Array.isArray(p.key_terms)  ? p.key_terms.filter(Boolean)  : [],
      exclusions:      Array.isArray(p.exclusions) ? p.exclusions.filter(Boolean) : [],
      summary:         p.summary ?? null,
      primary_source:  p.primary_source ?? null,
    }
  } catch { return null }
}

/**
 * Extract + persist the quote for one replied dispatch. Returns the stored row,
 * or null if there is nothing to read yet. Idempotent (upsert on dispatch_id).
 */
export async function extractAndStoreQuote(dispatchId: string): Promise<QuoteRow | null> {
  const apiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
  if (!apiKey) return null

  const dRes = await fetch(
    `${SB_URL}/rest/v1/rfq_dispatches?id=eq.${dispatchId}&select=id,rfq_request_id,insurer_name,product_line,thread_id&limit=1`,
    { headers: sbH(), cache: 'no-store' }
  )
  const d = dRes.ok ? (await dRes.json())[0] : null
  if (!d?.thread_id) return null

  const rRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${d.rfq_request_id}&select=case_id&limit=1`, { headers: sbH(), cache: 'no-store' })
  const caseId = rRes.ok ? (await rRes.json())[0]?.case_id : null

  const { text, hasContent, messageId } = await loadSources(d.thread_id)
  if (!hasContent) return null

  const ex = await extract(text, apiKey)
  if (!ex) return null

  const evidence = {
    premium:         { excerpt: ex.premium.excerpt,         source: ex.premium.source },
    excess:          { excerpt: ex.excess.excerpt,          source: ex.excess.source },
    limit_indemnity: { excerpt: ex.limit_indemnity.excerpt, source: ex.limit_indemnity.source },
    validity:        { excerpt: ex.validity.excerpt,        source: ex.validity.source },
  }
  const row = {
    case_id:           caseId,
    rfq_request_id:    d.rfq_request_id,
    dispatch_id:       d.id,
    insurer_name:      d.insurer_name,
    product_line:      d.product_line,
    premium:           ex.premium.value,
    excess:            ex.excess.value,
    limit_indemnity:   ex.limit_indemnity.value,
    validity:          ex.validity.value,
    key_terms:         ex.key_terms,
    exclusions:        ex.exclusions,
    summary:           ex.summary,
    evidence,
    primary_source:    ex.primary_source,
    source_message_id: messageId,
    extracted_by:      'gemini-3.6-flash',
    raw:               ex,
    updated_at:        new Date().toISOString(),
  }

  const upRes = await fetch(`${SB_URL}/rest/v1/rfq_quotes?on_conflict=dispatch_id`, {
    method:  'POST',
    headers: sbH('return=representation,resolution=merge-duplicates'),
    body:    JSON.stringify(row),
  })
  if (!upRes.ok) return null
  const saved = (await upRes.json())[0]
  void logRfqEvent({
    event_type: 'quoted', case_id: caseId, rfq_request_id: d.rfq_request_id, dispatch_id: d.id, quote_id: saved?.id,
    insurer_name: d.insurer_name, summary: `Quote captured from ${d.insurer_name ?? 'insurer'}`,
    detail: { premium: saved?.premium ?? null, primary_source: saved?.primary_source ?? null },
  })
  return {
    dispatch_id: d.id,
    insurer_name: d.insurer_name,
    product_line: d.product_line,
    premium: saved.premium, excess: saved.excess, limit_indemnity: saved.limit_indemnity, validity: saved.validity,
    key_terms: saved.key_terms ?? [], exclusions: saved.exclusions ?? [], summary: saved.summary,
    evidence: saved.evidence ?? {}, primary_source: saved.primary_source,
  }
}
