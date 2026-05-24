/**
 * RAG draft generation: embed email thread → similarity search → Gemini reply
 * Saves to rag_thread_drafts + rag_draft_sources.
 */

const SB_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const EMBED_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

import { logGeminiUsage } from '@/lib/gemini-usage'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export type RagSource = {
  file_id:     string
  file_name:   string
  chunk_index: number
  similarity:  number
  content:     string
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   'models/text-embedding-004',
      content: { parts: [{ text: text.slice(0, 8000) }] },
    }),
  })
  const data = await res.json()
  return data.embedding?.values ?? []
}

async function searchChunks(embedding: number[]): Promise<RagSource[]> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/match_knowledge_chunks`, {
    method:  'POST',
    headers: { ...sbHeaders('return=representation'), Prefer: 'return=representation' },
    body: JSON.stringify({
      query_embedding:      `[${embedding.join(',')}]`,
      match_count:          6,
      similarity_threshold: 0.4,
    }),
  })
  if (!res.ok) {
    console.warn('[run-rag-draft] chunk search failed:', await res.text())
    return []
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

export async function runRagDraft(thread_id: string, message_id: string): Promise<void> {
  const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')

  // 1. Fetch thread messages
  const msgsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`,
    { headers: sbHeaders() }
  )
  const messages: { direction: string; from_address: string | null; body_text: string | null; sent_at: string }[] =
    msgsRes.ok ? await msgsRes.json() : []
  if (!Array.isArray(messages) || messages.length === 0) return

  const threadText = messages.map(m => {
    const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
    const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${date}] ${who}:\n${m.body_text ?? ''}`
  }).join('\n\n---\n\n')

  // 2. Embed the thread text and search for relevant chunks
  const embedding = await embedText(threadText.slice(0, 8000), key)
  if (embedding.length === 0) {
    console.warn('[run-rag-draft] embedding returned empty — skipping')
    return
  }

  const sources = await searchChunks(embedding)
  if (sources.length === 0) {
    console.log('[run-rag-draft] no relevant chunks found for thread', thread_id)
    return
  }

  // 3. Build prompt with retrieved chunks
  const chunksText = sources
    .map((s, i) => `[Source ${i + 1}: ${s.file_name} — section ${s.chunk_index + 1} (${Math.round(s.similarity * 100)}% match)]\n${s.content}`)
    .join('\n\n---\n\n')

  const prompt = `You are an email assistant for Trade Risk Solutions, a Singapore insurance brokerage.
You have been given relevant excerpts retrieved from our pricing knowledge base that match this client conversation.

━━ CONVERSATION THREAD ━━
${threadText}

━━ RETRIEVED KNOWLEDGE (RAG) ━━
The following passages were retrieved from our knowledge base because they are semantically relevant to this conversation:

${chunksText}

━━ YOUR TASK ━━
Write a complete, ready-to-send email reply using ONLY information from the retrieved knowledge above.
- If specific pricing figures, coverage terms, or limits are mentioned in the retrieved passages, cite them precisely.
- If the retrieved passages do not contain the specific information needed, state that TRS will revert with specific terms within 5 business days.
- Do NOT fabricate figures.
- Sign off as: Trade Risk Solutions Operations
- No subject line.
- Return only the email body text, nothing else.`

  const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  })

  if (!geminiRes.ok) {
    throw new Error(`Gemini ${geminiRes.status}: ${await geminiRes.text()}`)
  }

  const geminiData = await geminiRes.json()
  void logGeminiUsage('draft_reply', geminiData.usageMetadata ?? {}, thread_id)

  const content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  if (!content) throw new Error('Gemini returned empty RAG draft')

  // 4. Save the RAG draft
  const draftInsert = await fetch(`${SB_URL}/rest/v1/rag_thread_drafts`, {
    method:  'POST',
    headers: sbHeaders('return=representation'),
    body:    JSON.stringify({ thread_id, message_id, content }),
  })
  if (!draftInsert.ok) throw new Error(`RAG draft insert failed: ${await draftInsert.text()}`)
  const draftRows = await draftInsert.json()
  const draft = Array.isArray(draftRows) ? draftRows[0] : draftRows
  if (!draft?.id) throw new Error('No draft id returned')

  // 5. Save source attributions
  const sourceRows = sources.map(s => ({
    draft_id:    draft.id,
    file_id:     s.file_id,
    file_name:   s.file_name,
    chunk_index: s.chunk_index,
    similarity:  s.similarity,
    content:     s.content.slice(0, 500), // cap for storage
  }))
  await fetch(`${SB_URL}/rest/v1/rag_draft_sources`, {
    method:  'POST',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify(sourceRows),
  })

  console.log('[run-rag-draft] saved RAG draft for thread', thread_id, '| sources:', sources.map(s => s.file_name).join(', '))
}
