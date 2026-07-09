/**
 * Quote verification (#1) — a deterministic + second-model failsafe run BEFORE a
 * quote comparison is sent to the client, to catch a jumbled/hallucinated figure
 * (e.g. 254,000 silently becoming 245,000).
 *
 * For each captured figure we run three checks:
 *   1. Source match  — the number appears VERBATIM in the insurer's source text.
 *   2. Excerpt match — the number appears in the excerpt that was cited for it.
 *   3. Consensus     — a SECOND model (Gemini 2.5 Pro) re-reads the same source
 *                      and agrees on the number.
 * Any failure flags the figure for human review.
 */
import { loadSources, extract } from '@/lib/rfq-quote-extract'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export type FieldCheck = {
  field:           string
  value:           string | null
  status:          'verified' | 'review' | 'empty'
  reasons:         string[]
  excerpt:         string | null
  source:          string | null
  consensus_value: string | null
}
export type QuoteVerification = {
  dispatch_id:  string
  insurer_name: string | null
  product_line: string | null
  fields:       FieldCheck[]
  ok:           boolean          // all non-empty fields verified
  note?:        string
}

// Numeric tokens in a string, normalised (commas removed) with a decimal-stripped
// variant, so "SGD 254,000.00" matches "254000" and "254000.00".
export function numTokens(s: string): Set<string> {
  const set = new Set<string>()
  for (const m of s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const noComma = m.replace(/,/g, '')
    set.add(noComma)
    set.add(noComma.replace(/\.\d+$/, ''))
  }
  return set
}
const sigTokens = (s: string) => Array.from(numTokens(s)).filter(t => t.replace('.', '').length >= 2)

const FIELDS: { key: 'premium' | 'excess' | 'limit_indemnity' | 'validity'; label: string }[] = [
  { key: 'premium',         label: 'Premium' },
  { key: 'excess',          label: 'Excess' },
  { key: 'limit_indemnity', label: 'Limit' },
  { key: 'validity',        label: 'Validity' },
]

type QuoteRow = {
  dispatch_id: string; insurer_name: string | null; product_line: string | null
  premium: string | null; excess: string | null; limit_indemnity: string | null; validity: string | null
  evidence: Record<string, { excerpt: string | null; source: string | null }> | null
}

function checkField(
  label: string, value: string | null,
  ev: { excerpt: string | null; source: string | null } | undefined,
  corpusTokens: Set<string>, corpusAvailable: boolean, consensusValue: string | null,
): FieldCheck {
  const base = { field: label, value, excerpt: ev?.excerpt ?? null, source: ev?.source ?? null, consensus_value: consensusValue }
  if (!value) return { ...base, status: 'empty', reasons: [] }

  const reasons: string[] = []
  const valTokens = sigTokens(value)

  // 1. Source match.
  if (valTokens.length && corpusAvailable && !valTokens.some(t => corpusTokens.has(t))) {
    reasons.push('Figure not found verbatim in the insurer’s source')
  }
  if (!corpusAvailable) reasons.push('Source text unavailable — could not verify against the insurer’s email/attachments')

  // 2. Excerpt match.
  if (valTokens.length) {
    if (!ev?.excerpt) reasons.push('No source excerpt was captured for this figure')
    else if (!valTokens.some(t => numTokens(ev.excerpt!).has(t))) reasons.push('Figure does not appear in its own cited excerpt')
  }

  // 3. Second-model consensus.
  if (valTokens.length && consensusValue) {
    if (!valTokens.some(t => numTokens(consensusValue).has(t))) reasons.push(`Second model read “${consensusValue}”`)
  }

  return { ...base, status: reasons.length ? 'review' : 'verified', reasons }
}

// Pure, testable wrapper: verify one figure against the raw source text.
export function verifyFigure(
  label: string, value: string | null, excerpt: string | null,
  corpusText: string, consensusValue: string | null,
): FieldCheck {
  return checkField(label, value, { excerpt, source: null }, numTokens(corpusText), corpusText.trim().length > 0, consensusValue)
}

export async function verifyQuotes(caseId: string): Promise<QuoteVerification[]> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
  const qRes = await fetch(
    `${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${caseId}&select=dispatch_id,insurer_name,product_line,premium,excess,limit_indemnity,validity,evidence`,
    { headers: sbH(), cache: 'no-store' },
  )
  const quotes: QuoteRow[] = qRes.ok ? await qRes.json() : []
  if (!Array.isArray(quotes) || quotes.length === 0) return []

  // dispatch_id → thread_id
  const dispIds = quotes.map(q => q.dispatch_id).filter(Boolean)
  const dRes = dispIds.length
    ? await fetch(`${SB_URL}/rest/v1/rfq_dispatches?id=in.(${dispIds.join(',')})&select=id,thread_id`, { headers: sbH(), cache: 'no-store' })
    : null
  const threadByDispatch = new Map<string, string | null>(
    (dRes?.ok ? await dRes.json() : []).map((d: { id: string; thread_id: string | null }) => [d.id, d.thread_id]),
  )

  const out: QuoteVerification[] = []
  for (const q of quotes) {
    const threadId = threadByDispatch.get(q.dispatch_id) ?? null
    const corpus = threadId ? (await loadSources(threadId)).text : ''
    const corpusAvailable = corpus.trim().length > 0
    const corpusTokens = numTokens(corpus)

    // Second-model consensus pass (Gemini 2.5 Pro) on the same source.
    const consensus = (corpusAvailable && key) ? await extract(corpus, key, 'gemini-2.5-pro') : null

    const fields = FIELDS.map(f => checkField(
      f.label, q[f.key], q.evidence?.[f.key], corpusTokens, corpusAvailable,
      consensus ? consensus[f.key]?.value ?? null : null,
    ))
    const ok = fields.every(f => f.status !== 'review')
    out.push({
      dispatch_id: q.dispatch_id, insurer_name: q.insurer_name, product_line: q.product_line,
      fields, ok,
      note: !corpusAvailable ? 'Source text was not available for this insurer — figures could not be cross-checked.' : undefined,
    })
  }
  return out
}
