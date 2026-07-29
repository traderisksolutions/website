/**
 * AI extraction for the PDF bulk-import review queue. Debit notes are far more uniform
 * documents than the group-benefits rate tables (gb-extract.ts's 3-model ensemble + judge),
 * so a single Gemini Flash call — reading the PDF directly as inline_data, same technique as
 * extractWithGemini there — is enough, with the company match done in-process afterward.
 */
import { geminiUrl, GEMINI_FLASH } from '@/lib/gemini-models'
import { logAiUsage } from '@/lib/gemini-usage'

export type ExtractedDebitNote = {
  client_name:        string | null
  client_address:     string | null
  debit_note_no:      string | null
  cover_note_no:      string | null
  policy_number:      string | null
  class_of_insurance: string | null
  insurer:            string | null
  description:        string | null
  period_start:       string | null   // YYYY-MM-DD
  period_end:         string | null   // YYYY-MM-DD
  currency:           string | null
  gross_premium:      number | null
  gst_amount:         number | null
  issue_date:         string | null   // YYYY-MM-DD
  payment_due_date:   string | null   // YYYY-MM-DD
}

const EMPTY: ExtractedDebitNote = {
  client_name: null, client_address: null, debit_note_no: null, cover_note_no: null,
  policy_number: null, class_of_insurance: null, insurer: null, description: null,
  period_start: null, period_end: null, currency: 'SGD', gross_premium: null, gst_amount: null,
  issue_date: null, payment_due_date: null,
}

const SCHEMA_HINT = `Return ONLY a JSON object (no markdown fences, no prose) with exactly these keys:
{
  "client_name": string|null,        // the insured / billed party's name
  "client_address": string|null,     // full mailing address, newline-joined if multi-line
  "debit_note_no": string|null,      // or the invoice/document number if it's a tax invoice
  "cover_note_no": string|null,
  "policy_number": string|null,
  "class_of_insurance": string|null, // e.g. "Contractors' All Risk", "Work Injury Compensation"
  "insurer": string|null,            // the insurance company's name
  "description": string|null,        // site address / project description, if present
  "period_start": "YYYY-MM-DD"|null, // period of insurance / cover start date
  "period_end": "YYYY-MM-DD"|null,   // period of insurance / cover end date — this is the renewal date
  "currency": string|null,           // ISO code e.g. "SGD"
  "gross_premium": number|null,      // the premium amount BEFORE GST
  "gst_amount": number|null,         // GST amount if shown, else null
  "issue_date": "YYYY-MM-DD"|null,   // the document's own date
  "payment_due_date": "YYYY-MM-DD"|null
}
All dates must be normalised to YYYY-MM-DD regardless of the source format (e.g. "2-Jun-26" → "2026-06-02").`

function safeParse(text: string): ExtractedDebitNote {
  try {
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return { ...EMPTY, ...parsed }
  } catch { return EMPTY }
}

export async function extractDebitNoteFromPdf(pdfBase64: string): Promise<{ data: ExtractedDebitNote; raw: string; error?: string }> {
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS || process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return { data: EMPTY, raw: '', error: 'GEMINI key not set' }
  try {
    const res = await fetch(`${geminiUrl(GEMINI_FLASH)}?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: `Extract the debit note / tax invoice details from this insurance billing document.\n\n${SCHEMA_HINT}` },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4000 },
      }),
    })
    if (!res.ok) return { data: EMPTY, raw: '', error: `Gemini ${res.status}: ${(await res.text()).slice(0, 300)}` }
    const j = await res.json()
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    void logAiUsage({ provider: 'gemini', model: GEMINI_FLASH, feature: 'debit_note_extract', inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 })
    return { data: safeParse(text), raw: text }
  } catch (e) {
    return { data: EMPTY, raw: '', error: e instanceof Error ? e.message : 'gemini extraction failed' }
  }
}

// ── Company name matching (in-process — the companies table is small enough that a Postgres
// trigram RPC isn't worth the extra migration surface) ─────────────────────────────────────
const SUFFIX_RE = /\b(pte\.?|private|ltd\.?|limited|inc\.?|llp|llc|corp\.?|company|co\.?)\b/g
const norm = (s: string) => s.toLowerCase().replace(SUFFIX_RE, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

function similarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '))
  const shared = Array.from(wa).filter(w => wb.has(w)).length
  return shared / Math.max(wa.size, wb.size)
}

export function bestCompanyMatch(name: string, candidates: { id: string; name: string }[]): { id: string; name: string; score: number } | null {
  if (!name.trim() || candidates.length === 0) return null
  let best: { id: string; name: string; score: number } | null = null
  for (const c of candidates) {
    const score = similarity(name, c.name)
    if (!best || score > best.score) best = { id: c.id, name: c.name, score }
  }
  return best && best.score >= 0.4 ? best : null
}
