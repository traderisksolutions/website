/**
 * What a document is, and which policy it belongs to. The filename rules in taxonomy.ts answer
 * most of it for free; the housekeeping agent reads the text of the rest (and of every document
 * whose policy number, insurer or period would place it), and is told to leave a field null
 * rather than guess.
 */
import { callGemini } from '@/lib/ai-call'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { classifyByName, DOC_TYPES, isDocType } from './taxonomy'

export type DocRead = {
  doc_type: string
  title: string | null
  insurer_name: string | null
  insured_name: string | null
  policy_number: string | null
  period_from: string | null
  period_to: string | null
  premium_text: string | null
  class_of_insurance: string | null
  confidence: number
  classified_by: 'rule' | 'agent'
}

const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null
const str = (v: unknown, max = 200) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

/** The agent's answer, cleaned: unknown types become the filename's type, then 'other'. Pure. */
export function cleanRead(raw: Record<string, unknown> | null, filename: string): DocRead {
  const byName = classifyByName(filename)
  const agentType = raw && isDocType(raw.doc_type) ? raw.doc_type as string : null
  const conf = raw && typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0
  // A confident read of the text beats the filename; a weak one does not.
  const doc_type = agentType && agentType !== 'other' && (conf >= 0.6 || !byName) ? agentType : byName ?? agentType ?? 'other'
  return {
    doc_type,
    title: str(raw?.title, 120),
    insurer_name: str(raw?.insurer_name, 120),
    insured_name: str(raw?.insured_name, 160),
    policy_number: str(raw?.policy_number, 80),
    period_from: date(raw?.period_from),
    period_to: date(raw?.period_to),
    premium_text: str(raw?.premium_text, 80),
    class_of_insurance: str(raw?.class_of_insurance, 80),
    confidence: agentType ? conf : byName ? 0.7 : 0,
    classified_by: agentType ? 'agent' : 'rule',
  }
}

const TYPE_LIST = DOC_TYPES.map(t => `${t.slug} (${t.label})`).join(', ')

/**
 * Reads a document. With no text worth reading (a scan with no OCR, a spreadsheet the parser
 * skipped) the filename rule is the answer.
 */
export async function readDocument(d: { filename: string; text: string | null; subject?: string | null; from?: string | null; documentId?: string }): Promise<DocRead> {
  const text = (d.text ?? '').trim()
  if (text.length < 40) return cleanRead(null, d.filename)
  const system = `You file documents for an insurance broker in Singapore and Malaysia.
Classify ONE document and read its key facts. doc_type is one of: ${TYPE_LIST}.
Definitions: cover_note = an insurer's cover note, hold cover or confirmation of cover before the policy issues; policy_schedule = the policy's schedule (insured, period, sum insured, premium); insurer_debit_note = the insurer's invoice or debit note; trs_debit_note = Trade Risk Solutions' own debit note; quotation = a priced offer; proposal_form = a form the client fills for the insurer; member_list = a list of employees or members; claims_history = a record of past claims.
Return JSON only: { "doc_type": slug, "title": a 3–6 word title, "insurer_name": the insurer that issued it or null, "insured_name": the insured or proposer or null, "policy_number": verbatim or null, "period_from": "YYYY-MM-DD" or null, "period_to": "YYYY-MM-DD" or null, "premium_text": the total premium verbatim with currency or null, "class_of_insurance": e.g. "Goods in Transit" or null, "confidence": 0 to 1 }.
Dates in the document are day-first (28/10/2026 is 28 October 2026). Never guess a field: null when the document does not state it.`
  const head = `FILENAME: ${d.filename}\n${d.subject ? `EMAIL SUBJECT: ${d.subject}\n` : ''}${d.from ? `FROM: ${d.from}\n` : ''}\n`
  const { text: out } = await callGemini({
    agent: 'housekeeping', feature: 'document_classify', model: GEMINI_LITE, system, json: true, temperature: 0, maxOutputTokens: 1200,
    metadata: { document_id: d.documentId ?? null, filename: d.filename }, parts: [{ text: head + text.slice(0, 12_000) }],
  })
  let raw: Record<string, unknown> | null = null
  try { raw = out ? JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, '')) : null } catch { raw = null }
  return cleanRead(raw, d.filename)
}

// ── Which policy ────────────────────────────────────────────────────────────────────────────

export type PolicyCandidate = {
  id: string
  policy_number: string | null
  cover_note_no: string | null
  insurer: string | null
  class_of_insurance: string | null
  label: string | null
  start_date: string | null
  end_date: string | null
  lifecycle: string
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const firstWord = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/)[0] ?? ''

/**
 * The policy a document belongs to, among the company's policies. Pure.
 *   1. the policy or cover-note number matches exactly;
 *   2. else one policy from the same insurer whose period covers the document's;
 *   3. else one policy from the same insurer at all;
 *   4. else null: the document waits in the company's "To sort" tray.
 */
export function matchPolicy(doc: Pick<DocRead, 'policy_number' | 'insurer_name' | 'period_from' | 'period_to'>, policies: PolicyCandidate[]): string | null {
  const no = norm(doc.policy_number)
  if (no.length >= 5) {
    const hit = policies.find(p => norm(p.policy_number) === no || norm(p.cover_note_no) === no)
    if (hit) return hit.id
  }
  const ins = firstWord(doc.insurer_name)
  if (!ins || ins.length < 3) return null
  const same = policies.filter(p => firstWord(p.insurer) === ins)
  if (doc.period_from) {
    const inPeriod = same.filter(p => (!p.start_date || p.start_date <= doc.period_from!) && (!p.end_date || p.end_date >= doc.period_from!))
    if (inPeriod.length === 1) return inPeriod[0].id
  }
  return same.length === 1 ? same[0].id : null
}
