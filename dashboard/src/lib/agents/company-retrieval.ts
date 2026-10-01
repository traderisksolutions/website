/**
 * Company-scoped retrieval.
 *
 * The drafter used to see one thread. When an insurer asks for an NRIC that was supplied months
 * ago on a different thread, a thread-scoped model cannot find it however good the prompt is.
 * This indexes every message body and attachment text against the company that owns the thread,
 * so a draft can draw on everything TRS holds for that client and nothing belonging to another.
 *
 * The company filter is not an optimisation. Reading across a client boundary would put one
 * client's correspondence in another's reply, so `companyId` is a required argument everywhere
 * and the SQL function has no default for it.
 */
import { geminiUrl, GEMINI_EMBED } from '@/lib/gemini-models'
import { logError } from '@/lib/error-log'
import { logAiUsage } from '@/lib/gemini-usage'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const sbH = () => {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export const EMBED_DIMS = 768
/** Chunk size in characters. Large enough to keep a clause intact, small enough to stay precise. */
export const CHUNK_CHARS = 1800
export const CHUNK_OVERLAP = 200

export interface CompanyChunk {
  chunk_id:      number
  thread_id:     string | null
  message_id:    string | null
  attachment_id: string | null
  source:        'message' | 'attachment'
  file_name:     string | null
  sent_at:       string | null
  similarity:    number
  content:       string
}

/** Splits long text on paragraph boundaries where it can, with a little overlap so a fact
 *  spanning a boundary is not lost from both sides. Pure, so it is unit-testable. */
export function chunkText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  const clean = (text ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const out: string[] = []
  let i = 0
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length)
    if (end < clean.length) {
      const br = clean.lastIndexOf('\n\n', end)
      if (br > i + size * 0.5) end = br
    }
    const piece = clean.slice(i, end).trim()
    if (piece) out.push(piece)
    if (end >= clean.length) break
    i = Math.max(end - overlap, i + 1)
  }
  return out
}

export async function embedText(text: string, feature = 'company_retrieval_embed'): Promise<number[]> {
  // Three names, because they are not set consistently across environments and retrieval that
  // silently returns nothing is worse than retrieval that fails loudly: a draft would simply
  // lose the archive with no sign anything was missing.
  const key = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
            || process.env.GEMINI_API_KEY_DRAFT_EMAIL
            || process.env.GEMINI_API_KEY_INBOUND
  if (!key) throw new Error('no Gemini key configured for embeddings')
  const res = await fetch(`${geminiUrl(GEMINI_EMBED, 'embedContent')}?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${GEMINI_EMBED}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EMBED_DIMS,
    }),
  })
  if (!res.ok) {
    void logError({ source: 'gemini', feature, statusCode: res.status, message: await res.text() })
    return []
  }
  const j = await res.json() as { embedding?: { values?: number[] } }
  void logAiUsage({ provider: 'gemini', model: GEMINI_EMBED, feature: feature as never,
                    inputTokens: Math.ceil(text.length / 4), outputTokens: 0 })
  return j.embedding?.values ?? []
}

/**
 * Finds the passages in this company's correspondence most relevant to a question.
 * `threadIds` optionally narrows to the threads an operator ticked.
 */
export async function searchCompany(opts: {
  companyId: string
  question: string
  limit?: number
  threshold?: number
  threadIds?: string[] | null
}): Promise<CompanyChunk[]> {
  if (!opts.companyId) throw new Error('companyId is required: retrieval is never cross-company')
  const vec = await embedText(opts.question, 'company_retrieval_query')
  if (vec.length === 0) return []
  const res = await fetch(`${SB_URL}/rest/v1/rpc/match_company_chunks`, {
    method: 'POST', headers: sbH(), cache: 'no-store',
    body: JSON.stringify({
      p_company_id:         opts.companyId,
      query_embedding:      `[${vec.join(',')}]`,
      match_count:          opts.limit ?? 8,
      similarity_threshold: opts.threshold ?? 0.35,
      p_thread_ids:         opts.threadIds ?? null,
    }),
  })
  if (!res.ok) {
    void logError({ source: 'internal', feature: 'company_retrieval_search',
                    statusCode: res.status, message: await res.text() })
    return []
  }
  return await res.json() as CompanyChunk[]
}

/** Renders retrieved passages for a prompt, each labelled with where it came from so the model
 *  can cite a source and a human can check it. */
export function renderContext(chunks: CompanyChunk[]): string {
  if (chunks.length === 0) return ''
  return chunks.map((c, n) => {
    const where = c.source === 'attachment'
      ? `attachment "${c.file_name ?? 'file'}"`
      : 'an earlier email'
    const when = c.sent_at ? ` dated ${c.sent_at.slice(0, 10)}` : ''
    return `[${n + 1}] from ${where}${when}\n${c.content}`
  }).join('\n\n---\n\n')
}
