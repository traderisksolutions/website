/**
 * AI extraction for the PDF bulk-import review queue. Debit notes are far more uniform
 * documents than the group-benefits rate tables (gb-extract.ts's 3-model ensemble + judge),
 * so a single Gemini Flash call — reading the PDF directly as inline_data, same technique as
 * extractWithGemini there — is enough, with the company match done in-process afterward.
 *
 * A real renewal/new-business event is 2-3 separate documents (an insurer Tax Invoice addressed
 * to the client, a separate insurer "Commission" statement addressed to Trade Risk Solutions,
 * and sometimes a pre-existing TRS-branded debit note) that all need extracting individually
 * then merging into one canonical record — see mergeBundleExtractions below.
 */
import { geminiUrl, GEMINI_FLASH } from '@/lib/gemini-models'
import { logAiUsage } from '@/lib/gemini-usage'

export type DocType = 'client_invoice' | 'commission_statement' | 'trs_debit_note' | 'other'

export type ExtractedDebitNote = {
  doc_type:           DocType
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
  commission_rate:    number | null   // percentage, e.g. 10 for 10%
  commission_amount:  number | null
  issue_date:         string | null   // YYYY-MM-DD
  payment_due_date:   string | null   // YYYY-MM-DD
}

const EMPTY: ExtractedDebitNote = {
  doc_type: 'other',
  client_name: null, client_address: null, debit_note_no: null, cover_note_no: null,
  policy_number: null, class_of_insurance: null, insurer: null, description: null,
  period_start: null, period_end: null, currency: 'SGD', gross_premium: null, gst_amount: null,
  commission_rate: null, commission_amount: null, issue_date: null, payment_due_date: null,
}

const SCHEMA_HINT = `Return ONLY a JSON object (no markdown fences, no prose) with exactly these keys:
{
  "doc_type": "client_invoice"|"commission_statement"|"trs_debit_note"|"other",
    // client_invoice: billed to / addressed to the insured client (the policyholder company).
    // commission_statement: billed to / addressed to "Trade Risk Solutions" itself, and shows a
    //   "Commission X%" line — this is the insurer telling TRS its commission, not the client.
    // trs_debit_note: a "TRADE RISK SOLUTIONS" letterhead document titled "Debit Note", sent by
    //   TRS to its client (not an insurer document at all).
    // other: anything else.
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
  "commission_rate": number|null,    // e.g. 10 for "Commission 10.000%" — only on commission_statement docs
  "commission_amount": number|null,  // the commission dollar amount on that same line
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
          { text: `Extract the debit note / tax invoice / commission statement details from this insurance billing document.\n\n${SCHEMA_HINT}` },
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

// ── Merge a bundle's per-file extractions into one canonical record ────────────────────────────
// client_invoice is the primary source for client/policy/premium/GST fields (it's the document
// that actually carries them); commission_statement fills in commission_rate/commission_amount,
// which client_invoice never has. Any field still missing falls back to whatever other file has
// it. Policy-number disagreement across files becomes a warning, never a silent pick, since a
// real mismatch (a typo in one of the source documents) needs a human to look at it.
export function mergeBundleExtractions(files: { docType: DocType; data: ExtractedDebitNote }[]): { merged: ExtractedDebitNote; warning: string | null } {
  if (files.length === 0) return { merged: EMPTY, warning: null }

  const byType = (t: DocType) => files.find(f => f.docType === t)?.data
  const clientInvoice = byType('client_invoice')
  const trsDn         = byType('trs_debit_note')
  const commissionDoc = byType('commission_statement')
  const others        = files.filter(f => f.docType === 'other').map(f => f.data)

  const priorityOrder = [clientInvoice, trsDn, commissionDoc, ...others].filter((d): d is ExtractedDebitNote => !!d)
  const merged: ExtractedDebitNote = { ...EMPTY }
  for (const cand of priorityOrder) {
    for (const key of Object.keys(merged) as (keyof ExtractedDebitNote)[]) {
      if ((merged[key] === null || merged[key] === undefined) && cand[key] != null) {
        (merged as Record<string, unknown>)[key] = cand[key]
      }
    }
  }
  // Commission always comes from the commission statement specifically, if one was provided.
  if (commissionDoc?.commission_rate   != null) merged.commission_rate   = commissionDoc.commission_rate
  if (commissionDoc?.commission_amount != null) merged.commission_amount = commissionDoc.commission_amount

  const policyNumbers = Array.from(new Set(files.map(f => f.data.policy_number).filter((p): p is string => !!p)))
  const warning = policyNumbers.length > 1
    ? `Policy number differs across the uploaded files: ${policyNumbers.join(' vs ')} — please confirm before approving.`
    : null

  return { merged, warning }
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
