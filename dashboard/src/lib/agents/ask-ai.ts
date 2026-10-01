/**
 * Ask AI — answers a question from the live web, and says where every claim came from.
 *
 * The whole design turns on one measured fact: Google Search grounding is DISCRETIONARY. Passing
 * the google_search tool does not mean the model searches. It decides. On 1 Oct 2026, asked
 * "what did MAS announce about insurance brokers in September 2026", gemini-3.5-flash returned a
 * confident answer having run no search at all — no groundingMetadata, no sources. It skipped the
 * search on the question it was least equipped to answer from memory.
 *
 * So this module never trusts that the tool was used. It reads groundingMetadata off the response
 * and treats "no sources" as a failure state the caller must show, not as a normal answer. An
 * unsourced paragraph about a policy clause is worse than no answer, because it reads identically
 * to a sourced one.
 *
 * Cost, measured: $0.0064 per grounded question on gemini-3.8-flash. Search itself is free for
 * the first 5,000 requests a month across all Gemini 3.x models, then $14 per 1,000.
 */
import { geminiUrl, GEMINI_DEEP } from '@/lib/gemini-models'
import { agentKey } from '@/lib/ai-agents'
import { logAiUsage } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'
import { searchCompany, renderContext, type CompanyChunk } from '@/lib/agents/company-retrieval'

/** A web page the answer leaned on. */
export interface WebSource {
  n:     number
  title: string
  uri:   string
}

export interface AskResult {
  answer:    string
  /** Web pages the model actually retrieved. Empty means it did not search. */
  sources:   WebSource[]
  /** Searches the model chose to run. Useful for showing how it interpreted the question. */
  queries:   string[]
  /** True when the model retrieved at least one web source. */
  grounded:  boolean
  /** Passages from this company's own correspondence, when a company was named. */
  archive:   CompanyChunk[]
  model:     string
  /** Set when the answer should not be trusted as stated. */
  warning:   string | null
}

const SYSTEM = `You answer questions for the staff of Trade Risk Solutions (TRS), a commercial
insurance broker in Singapore. Your readers are brokers and account executives. They know the
trade; they do not need insurance explained from first principles.

HOW TO ANSWER

- Lead with the answer in the first sentence. No preamble, no restating the question.
- Then the reasoning, only as far as it changes what the reader would do.
- Singapore law and market practice are the default context unless the question says otherwise.
- Use the searched sources for anything that can change: regulation, limits, market terms, who
  underwrites what, dates, figures. Mark each such claim with its source number, like [2].
- When sources disagree, say so and say which is more authoritative, rather than averaging them.
- When the sources do not answer the question, say exactly that and say what you would need.
  Never fill the gap from memory and never present an inference as a finding.
- Distinguish what a clause SAYS from what it MEANS in practice, and flag where the practical
  effect depends on the policy wording actually held.
- No disclaimers about being an AI. No "consult a professional" padding — the reader is the
  professional. A genuine legal caveat specific to the question is welcome; boilerplate is not.

STYLE

Short sentences. Plain words. Numbers rather than adjectives. Two to six short paragraphs for an
ordinary question; a clause explanation may use a short list where the clause itself has parts.
No headings unless the answer genuinely has more than one part.

FORMATTING — this is read in a web page, not a maths paper.

- Never use LaTeX or MathJax. No $, $$, \\text, \\frac, \\left, \\times.
- Write a formula as plain text on its own line, e.g.
      payable = assessed loss x (sum insured / actual value at the time of loss)
  then give a worked example in ordinary prose with real figures.
- Markdown only: ## for a heading, * for a list item, **bold** for a term being defined.
- Currency as S$1,000,000 or SGD 1,000,000. Never a bare symbol with no amount.`

interface GeminiPart { text?: string }
interface GroundingChunk { web?: { title?: string; uri?: string } }
interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] }
    finishReason?: string
    groundingMetadata?: {
      webSearchQueries?: string[]
      groundingChunks?: GroundingChunk[]
    }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  error?: { message?: string; code?: number }
}

export async function ask(opts: {
  question: string
  /** When given, this company's own correspondence is searched too and offered as context. */
  companyId?: string | null
  /** Narrow the archive search to these threads. */
  threadIds?: string[] | null
  feature?: 'ask_ai_grounded' | 'ask_ai_clause'
}): Promise<AskResult> {
  const question = (opts.question ?? '').trim()
  if (!question) throw new Error('a question is required')

  const { key, via } = agentKey('askai')
  if (!key) throw new Error('No Gemini key available for Ask AI. Set GEMINI_API_KEY_ASKAI.')

  // The company's own correspondence, when one was named. This is what makes the answer about
  // THIS client rather than about insurance in general — and it is scoped, so one client's
  // papers can never appear in an answer about another.
  let archive: CompanyChunk[] = []
  if (opts.companyId) {
    try {
      archive = await searchCompany({ companyId: opts.companyId, question, limit: 6, threadIds: opts.threadIds ?? null })
    } catch (e) {
      // An answer from the web alone is still useful; losing the archive is not worth failing on.
      console.error('[ask-ai] company archive unavailable:', e)
    }
  }

  const archiveBlock = archive.length
    ? `\n\nWHAT TRS ALREADY HOLDS FOR THIS CLIENT (quote it where it answers the question; cite as A1, A2 …)\n${renderContext(archive)}`
    : ''

  const prompt =
    `${question}\n\n` +
    `Search the web for anything current or authoritative before answering, and cite what you ` +
    `find.${archiveBlock}`

  const model = GEMINI_DEEP
  const res = await fetch(`${geminiUrl(model)}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      // Room for the thinking pass as well as the answer. A tight budget here returns empty text
      // with finishReason MAX_TOKENS and HTTP 200 — a silent blank, not an error.
      generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[ask-ai] ${model} HTTP ${res.status} (key via ${via}): ${body.slice(0, 400)}`)
    void logError({ source: 'gemini', feature: 'ask_ai', statusCode: res.status, message: body.slice(0, 500) })
    throw new Error(`Ask AI could not reach Gemini (HTTP ${res.status}).`)
  }

  const json = await res.json() as GeminiResponse
  const cand = json.candidates?.[0]
  const answer = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()

  const gm = cand?.groundingMetadata ?? {}
  const chunks = gm.groundingChunks ?? []
  const sources: WebSource[] = chunks
    .map((c, i) => ({ n: i + 1, title: c.web?.title ?? '', uri: c.web?.uri ?? '' }))
    .filter(s => s.uri)
  const queries = gm.webSearchQueries ?? []
  const grounded = sources.length > 0

  void logAiUsage({
    provider: 'gemini', model, feature: opts.feature ?? 'ask_ai_grounded',
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0),
  })

  let warning: string | null = null
  if (!answer) {
    warning = `The model returned nothing (${cand?.finishReason ?? 'no reason given'}). Ask again, or more narrowly.`
  } else if (!grounded) {
    warning = archive.length
      ? 'Not checked against the web — this answer comes from the model and from TRS files only. Verify anything that can change.'
      : 'Not checked against the web. The model chose not to search, so this is its own recollection and nothing here is sourced. Treat it as a starting point, not an answer.'
  }

  return { answer, sources, queries, grounded, archive, model, warning }
}
