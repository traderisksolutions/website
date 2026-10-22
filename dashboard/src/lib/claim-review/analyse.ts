/**
 * Claim second opinion (corpcover.com): read the policy and the insurer's decision, then rule on
 * each reason the insurer gave against the clause it relies on.
 *
 * Lean version of Nexus for the test phase: one Opus call with the PDFs attached (Claude reads
 * PDFs natively), a forced tool call for a fixed JSON shape, then every quoted clause is checked
 * word for word against the text extracted from the uploaded files. Nothing is sent to the client
 * until an adviser has read it.
 */
import { fetchOpus } from '@/lib/anthropic-models'

export type Verdict = 'supported' | 'not_supported' | 'unclear'

export type ReasonFinding = {
  reason: string
  clause_ref: string
  clause_quote: string
  verdict: Verdict
  reasoning: string
  question_for_insurer: string
  /** Set after the call: the quote was found word for word in the uploaded text. null = text not extractable. */
  quote_verified?: boolean | null
}

export type ClaimReport = {
  claim: {
    policyholder: string; insurer: string; policy_type: string; policy_number: string
    claim_type: string; loss_date: string; decision_date: string
    amount_claimed: string; amount_paid: string; insurer_decision: string
  }
  summary: string
  overall: 'policyholder_favoured' | 'mixed' | 'insurer_favoured'
  reasons: ReasonFinding[]
  clauses_for_policyholder: { clause_ref: string; clause_quote: string; why: string; quote_verified?: boolean | null }[]
  missing_documents: string[]
  next_steps: string[]
}

export type ReportRun = ClaimReport & {
  generated_at: string; model: string; files: { name: string; bytes: number }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

const str = { type: 'string' }
const TOOL = {
  name: 'submit_claim_report',
  description: 'Submit the second-opinion reading of this claim.',
  input_schema: {
    type: 'object',
    required: ['claim', 'summary', 'overall', 'reasons', 'clauses_for_policyholder', 'missing_documents', 'next_steps'],
    properties: {
      claim: {
        type: 'object',
        required: ['policyholder', 'insurer', 'policy_type', 'policy_number', 'claim_type', 'loss_date', 'decision_date', 'amount_claimed', 'amount_paid', 'insurer_decision'],
        properties: Object.fromEntries(['policyholder', 'insurer', 'policy_type', 'policy_number', 'claim_type', 'loss_date', 'decision_date', 'amount_claimed', 'amount_paid', 'insurer_decision'].map(k => [k, str])),
      },
      summary: { type: 'string', description: 'Three sentences at most: what was claimed, what the insurer decided, and what the wording shows.' },
      overall: { type: 'string', enum: ['policyholder_favoured', 'mixed', 'insurer_favoured'] },
      reasons: {
        type: 'array',
        items: {
          type: 'object',
          required: ['reason', 'clause_ref', 'clause_quote', 'verdict', 'reasoning', 'question_for_insurer'],
          properties: {
            reason: { type: 'string', description: "The insurer's stated reason, close to its own words." },
            clause_ref: { type: 'string', description: 'Section, condition or exclusion number and title, e.g. "Exclusion 4(b) Wear and tear".' },
            clause_quote: { type: 'string', description: 'The relevant clause copied word for word from the policy document. Empty if the insurer cited no clause and none applies.' },
            verdict: { type: 'string', enum: ['supported', 'not_supported', 'unclear'] },
            reasoning: { type: 'string', description: 'Why, in plain English, citing facts from the documents.' },
            question_for_insurer: { type: 'string' },
          },
        },
      },
      clauses_for_policyholder: {
        type: 'array',
        items: { type: 'object', required: ['clause_ref', 'clause_quote', 'why'], properties: { clause_ref: str, clause_quote: str, why: str } },
      },
      missing_documents: { type: 'array', items: str },
      next_steps: { type: 'array', items: str },
    },
  },
}

const SYSTEM = `You read insurance policies and insurers' claim decisions for Corp Cover, a second-opinion service for policyholders in Singapore, Malaysia and Hong Kong.

Rules:
- Answer only from the documents provided. If a fact is not in them, say it is not in the documents.
- For each reason the insurer gave, find the clause it relies on (or the clause that governs it if the insurer cited none) and copy that clause word for word into clause_quote. Never paraphrase inside clause_quote.
- verdict: "supported" when the wording and facts support the insurer's reason; "not_supported" when they do not; "unclear" when the wording is ambiguous or a fact is missing. When unsure, choose "unclear".
- Do not promise an outcome, do not give legal advice, and do not tell the policyholder to sue. Write for a business owner with no insurance background: short sentences, British spelling, define any insurance term once.
- clauses_for_policyholder: clauses that help the policyholder (cover grants, extensions, conditions the insurer must meet), quoted word for word.
- missing_documents: documents that would change a finding if seen.
- next_steps: what the policyholder should do next, in order, starting with the questions to put to the insurer in writing.
Submit the result with the submit_claim_report tool.`

export type UploadedFile = { name: string; type: string; data: Buffer }

function block(f: UploadedFile) {
  const b64 = f.data.toString('base64')
  if (f.type === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 }, title: f.name }
  if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return { type: 'image', source: { type: 'base64', media_type: f.type, data: b64 } }
  return { type: 'text', text: `File ${f.name}:\n${f.data.toString('utf8').slice(0, 200_000)}` }
}

/** Text of the uploaded PDFs for the quote check. Empty when a file is a scan. */
export async function extractText(files: UploadedFile[]): Promise<string> {
  const out: string[] = []
  for (const f of files) {
    if (f.type !== 'application/pdf') { if (f.type.startsWith('text/')) out.push(f.data.toString('utf8')); continue }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('pdf-parse') as Record<string, unknown> & ((d: Buffer) => Promise<{ text?: string }>)
      const Cls = (mod as { PDFParse?: new (o: { data: Buffer }) => { getText: () => Promise<{ text?: string }> } }).PDFParse
      if (Cls) { const r = await new Cls({ data: f.data }).getText(); out.push(r.text ?? '') }
      else if (typeof mod === 'function') out.push((await mod(f.data)).text ?? '')
    } catch { /* scanned or unreadable: quotes from it stay unchecked */ }
  }
  return out.join('\n')
}

const norm = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9]+/g, ' ').trim()

/** true = found word for word (ignoring case, spacing and punctuation); null = no text to check against. */
export function quoteFound(quote: string, corpus: string): boolean | null {
  if (!quote.trim()) return null
  if (corpus.trim().length < 200) return null
  return norm(corpus).includes(norm(quote))
}

export async function analyseClaim(files: UploadedFile[], context: string): Promise<ReportRun> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  const { res, model } = await fetchOpus({
    max_tokens: 16000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: [...files.map(block), { type: 'text', text: `Claim details from the intake form:\n${context}\n\nRead every document, then submit the report.` }] }],
  }, key)
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json() as { content: { type: string; name?: string; input?: ClaimReport }[]; usage?: ReportRun['usage'] }
  const out = j.content.find(c => c.type === 'tool_use' && c.name === TOOL.name)?.input
  if (!out || !Array.isArray(out.reasons)) throw new Error('No report in the model response')

  const corpus = await extractText(files)
  out.reasons = out.reasons.map(r => ({ ...r, quote_verified: quoteFound(r.clause_quote, corpus) }))
  out.clauses_for_policyholder = (out.clauses_for_policyholder ?? []).map(c => ({ ...c, quote_verified: quoteFound(c.clause_quote, corpus) }))
  return { ...out, generated_at: new Date().toISOString(), model, files: files.map(f => ({ name: f.name, bytes: f.data.length })), usage: j.usage }
}
