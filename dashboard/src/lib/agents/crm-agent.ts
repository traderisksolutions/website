/**
 * The client-relationship agent.
 *
 * The drafter in /api/engagement/draft answers one email. This answers a different question:
 * given everything TRS holds for this client, what should we do next on this thread, and what
 * does the reply say?
 *
 * Three sources, in order of authority:
 *   1. the thread itself — what was actually asked
 *   2. the company's record — policies, payments, quotes, open cases, who the people are
 *   3. the company's archive — the passages from other threads and attachments that bear on it
 *
 * All three are scoped to one company. Nothing crosses a client boundary, because an answer that
 * quietly borrows another client's correspondence is the one failure here that cannot be undone
 * by editing the draft.
 *
 * It drafts. It never sends: /api/email/send refuses any non-human caller, and the attachments
 * named here are proposals for a reviewer to attach, not instructions.
 *
 * Runs on gemini-3.8-flash. Measured on a real thread with eight archive passages: $0.0054 a
 * call, against $0.0179 for the same prompt on gemini-3.5-flash, which is an older generation
 * and spent nearly twice the thinking tokens.
 */
import { geminiUrl, GEMINI_DEEP } from '@/lib/gemini-models'
import { agentKey } from '@/lib/ai-agents'
import { logAiUsage } from '@/lib/gemini-usage'
import { logError } from '@/lib/error-log'
import { searchCompany, renderContext as renderArchive, type CompanyChunk } from '@/lib/agents/company-retrieval'
import { buildCitations, renderProvenance, CITE_INSTRUCTION, type Citation, type ProposedAttachment } from '@/lib/agents/guardrails'
import { buildCompanyContext, renderContext as renderCompany } from '@/lib/crm/context'
import { getCompany, sbTry, enc } from '@/lib/crm/db'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

/**
 * Save the reply as a pending draft, superseding any earlier pending one on the thread.
 * Mirrors what /api/engagement/draft did, because this replaces it and the rest of the
 * dashboard — approve, reject, the learning loop — keys off this row.
 */
async function saveDraft(threadId: string, contactId: string | null, body: string, contextUsed: string[]): Promise<string | null> {
  try {
    await fetch(`${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${enc(threadId)}&status=eq.pending`, {
      method: 'PATCH', headers: sbHeaders('return=minimal'),
      body: JSON.stringify({ status: 'superseded' }),
    })
    const res = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({
        contact_id: contactId, thread_id: threadId, channel: 'email', body,
        status: 'pending', generated_by: 'crm_agent',
        context_used: contextUsed.length ? contextUsed : null,
      }),
    })
    if (!res.ok) {
      console.error('[crm-agent] could not save the draft:', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const rows = await res.json()
    return (Array.isArray(rows) ? rows[0]?.id : rows?.id) ?? null
  } catch (e) {
    // A draft on screen the reviewer can still copy is better than failing the whole call.
    console.error('[crm-agent] draft save threw:', e)
    return null
  }
}

export interface NextReply {
  /** What the thread is waiting on, in one or two sentences of fact. */
  situation:   string
  /** The action to take, phrased as an instruction to the handler. */
  nextAction:  string
  /** Anything the reply cannot resolve and a person must. */
  openItems:   string[]
  /** The draft body, ready for a reviewer to edit and send. */
  draft:       string
  citations:   Citation[]
  attachments: ProposedAttachment[]
  provenance:  string
  archive:     CompanyChunk[]
  model:       string
  /** The row in ai_drafts this reply was saved as, so the approve/reject and evaluation flow
   *  keeps working exactly as it did for the drafter this replaces. */
  draftId:     string | null
  /** How much had to be read, so the reader can judge the answer's basis. */
  read:        { threads: number; archivePassages: number; archiveThreads: number }
}

const SYSTEM = `You are the senior account executive at Trade Risk Solutions (TRS), a commercial
insurance broker in Singapore, picking up one of your own threads after a week away.

You are given the thread, what TRS holds on the client, and passages retrieved from the client's
other threads and documents.

Decide what happens next, then write the reply.

RULES THAT MATTER

- The thread's own latest inbound message is what you are answering. Everything else is context.
- Use the archive when it answers something the thread is asking for. That is the point of it:
  an insurer asking for a document supplied months ago on another thread is answerable, and the
  answer is to cite and attach it.
- Never write an identifier, premium, limit or date into the reply by copying it out of a
  document. Say the document is attached and cite it. A wrong NRIC reads exactly like a right one
  until somebody opens the file.
- If the client is owed something TRS has not done, say so in nextAction rather than papering
  over it in the draft.
- openItems is for what a person must decide or obtain. Leave it empty if there is nothing.

THE DRAFT

- Open with the answer or the action. No "thank you for your email", no "I hope this finds you
  well", no "please do not hesitate".
- Match the length of what you are answering. Two sentences gets two or three back.
- Short sentences. 2 to 5 short paragraphs at most.
- No sign-off, no signature, no subject line — those are added by the sender.
- Only state what the thread, the record or the archive supports.

Return ONLY JSON:
{
  "situation":  "what the thread is waiting on",
  "nextAction": "what the handler should do",
  "openItems":  ["anything a person must decide or obtain"],
  "draft":      "the reply body"
}`

interface Raw { situation?: unknown; nextAction?: unknown; openItems?: unknown; draft?: unknown }

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function nextReply(opts: { threadId: string }): Promise<NextReply> {
  const { key, via } = agentKey('crm')
  if (!key) throw new Error('No Gemini key available for the CRM agent. Set GEMINI_API_KEY_CRM.')

  // 1 ── the thread and its company
  const threads = await sbTry<{ id: string; subject: string | null; company_id: string | null; contact_id: string | null }[]>(
    `email_threads?id=eq.${enc(opts.threadId)}&select=id,subject,company_id,contact_id&limit=1`, [])
  const thread = threads[0]
  if (!thread) throw new Error('That thread does not exist.')
  if (!thread.company_id) throw new Error('This thread has no company yet. File it first — /companies/triage.')

  const company = await getCompany(thread.company_id)
  if (!company) throw new Error('The company on this thread could not be loaded.')

  const msgs = await sbTry<{ direction: string; from_address: string | null; body_text: string | null; sent_at: string | null }[]>(
    `email_messages?thread_id=eq.${enc(opts.threadId)}&deleted_at=is.null&select=direction,from_address,body_text,sent_at&order=sent_at.asc`, [])
  const lastInbound = [...msgs].reverse().find(m => m.direction === 'inbound')
  const question = `${thread.subject ?? ''}\n\n${(lastInbound?.body_text ?? '').slice(0, 4000)}`.trim()

  // 2 ── the company record, and 3 ── its archive, excluding this thread.
  // The exclusion is done in the query, not after it: this thread's own messages are the
  // passages most similar to its own last message, so they take every slot and a post-filter
  // leaves nothing.
  const siblings = await sbTry<{ id: string }[]>(
    `email_threads?company_id=eq.${enc(thread.company_id)}&id=neq.${enc(opts.threadId)}&deleted_at=is.null&select=id&limit=500`, [])
  const siblingIds = siblings.map(s => s.id)

  const [ctx, archive] = await Promise.all([
    buildCompanyContext(company, { withExcerpts: true }),
    siblingIds.length && question
      ? searchCompany({ companyId: thread.company_id, question, limit: 8, threadIds: siblingIds })
          .catch(e => { console.error('[crm-agent] archive unavailable:', e); return [] as CompanyChunk[] })
      : Promise.resolve([] as CompanyChunk[]),
  ])

  const { citations, attachments } = buildCitations(archive)
  const archiveThreads = new Set(archive.map(a => a.thread_id).filter(Boolean)).size

  const threadText = msgs.slice(-15).map(m => {
    const who = m.direction === 'inbound' ? `CLIENT (${m.from_address ?? ''})` : 'TRS (us)'
    const when = m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
    return `[${when}] ${who}:\n${(m.body_text ?? '').slice(0, 3000)}`
  }).join('\n\n---\n\n')

  const prompt = [
    `COMPANY: ${company.name}`,
    `THREAD: ${thread.subject ?? '(no subject)'}`,
    '',
    '━━ WHAT TRS HOLDS ON THIS CLIENT ━━',
    renderCompany(ctx),
    '',
    '━━ THIS THREAD ━━',
    threadText || '(no messages)',
    '',
    lastInbound
      ? `━━ THE MESSAGE YOU ARE ANSWERING ━━\n${(lastInbound.body_text ?? '').slice(0, 12000)}`
      : '━━ NOTE ━━\nNo inbound message on this thread. Decide whether TRS owes a follow-up.',
    archive.length ? `\n━━ FROM THIS CLIENT'S OTHER THREADS AND DOCUMENTS ━━\n${renderArchive(archive)}` : '',
    archive.length ? `\n━━ CITING ━━\n${CITE_INSTRUCTION}` : '',
  ].join('\n')

  const model = GEMINI_DEEP
  const res = await fetch(`${geminiUrl(model)}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, responseMimeType: 'application/json', maxOutputTokens: 4000 },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[crm-agent] ${model} HTTP ${res.status} (key via ${via}): ${body.slice(0, 400)}`)
    void logError({ source: 'gemini', feature: 'crm_next_reply', statusCode: res.status, message: body.slice(0, 500), threadId: opts.threadId })
    throw new Error(`The CRM agent could not reach Gemini (HTTP ${res.status}).`)
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  }
  void logAiUsage({
    provider: 'gemini', model, feature: 'crm_next_reply', threadId: opts.threadId,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0),
  })

  const raw = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
  let parsed: Raw = {}
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Raw
  } catch {
    const finish = json.candidates?.[0]?.finishReason ?? 'unknown'
    console.error(`[crm-agent] reply was not JSON (finishReason=${finish}): ${raw.slice(0, 300)}`)
    throw new Error(`The CRM agent's answer was not readable (${finish}). Try again.`)
  }

  const draft = str(parsed.draft, 8000)
  // What the draft was actually built from, shown to the reviewer so they can judge it.
  const contextUsed = [
    `company record for ${company.name}`,
    archive.length
      ? `${archive.length} passage${archive.length === 1 ? '' : 's'} from ${archiveThreads} other thread${archiveThreads === 1 ? '' : 's'}`
      : null,
  ].filter((v): v is string => v !== null)

  const draftId = draft ? await saveDraft(opts.threadId, thread.contact_id ?? null, draft, contextUsed) : null

  return {
    situation:  str(parsed.situation, 600),
    nextAction: str(parsed.nextAction, 600),
    openItems:  Array.isArray(parsed.openItems) ? parsed.openItems.map(v => str(v, 300)).filter(Boolean).slice(0, 8) : [],
    draft,
    citations, attachments,
    provenance: renderProvenance(citations),
    archive, model, draftId,
    read: { threads: 1 + archiveThreads, archivePassages: archive.length, archiveThreads },
  }
}
