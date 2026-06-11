/**
 * RAG draft generation: embed email thread → similarity search → Gemini reply
 * Saves to rag_thread_drafts + rag_draft_sources.
 */

const SB_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const EMBED_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

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
      model:                'models/gemini-embedding-001',
      content:              { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: 768,
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

export async function runRagDraft(thread_id: string, message_id: string, contactName?: string | null): Promise<void> {
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

  const hasRealName = contactName && !contactName.includes('@')
  const firstName   = hasRealName ? contactName.split(' ')[0] : null
  const salutation  = firstName ? `Dear ${firstName},` : 'Dear Sir/Madam,'

  const threadText = messages.map(m => {
    const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
    const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${date}] ${who}:\n${(m.body_text ?? '').slice(0, 8000)}`
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

  const prompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage. You draft replies that Account Executives review and send. Replies must read like a senior AE wrote them — direct, specific, no filler.

━━ CONVERSATION THREAD ━━
${threadText}

━━ RETRIEVED KNOWLEDGE ━━
The following passages were retrieved from TRS's knowledge base as relevant to this enquiry:

${chunksText}

━━ YOUR TASK ━━
First, silently identify which type of email this is (do not write the type in the reply):
- PRICING    — asking for a quote, premium, or indicative cost
- COVERAGE   — what does the policy cover, is X excluded, does this scenario qualify
- RENEWAL    — renewing or asking about an expiring policy
- DOCUMENT   — requesting a document (COI, policy wording, endorsement, invoice)
- CLAIMS     — reporting an incident or asking about a claim
- CONVERSATION — general back-and-forth, follow-up, or relationship email

Then write the reply using the pattern for that type:

PRICING: If the retrieved knowledge contains premium figures, coverage limits or deductibles, present options as bullet points:
  • [Insurer] — SGD [premium] premium | SGD [sum insured] covered | SGD [deductible] deductible
After the bullets, recommend the best option. If no pricing is in the knowledge: "We will revert with indicative pricing within 2 business days."

COVERAGE: Answer directly in the first sentence. Quote the relevant passage from the retrieved knowledge and name the source document. If no passage answers the question: "We will check your policy wording and revert within 2 business days."

RENEWAL: Ask for the details needed to obtain renewal/comparison quotes — current insurer, sum insured, expiry date, any changes to the risk. 2–3 sentences.

DOCUMENT: Confirm what they need and when it'll be sent. 2–3 sentences maximum.

CLAIMS: One sentence acknowledging the situation. Ask for: date of incident, policy number (if known), description of what happened, estimated amount. Do NOT confirm or promise anything about coverage. 2–3 sentences.

CONVERSATION: Continue naturally. Match the client's tone and length. 1–3 sentences is usually enough.

━━ UNIVERSAL RULES ━━
- Start with exactly "${salutation}"
- Lead with the answer — no warm-up sentences
- BANNED PHRASES (never use): "Thank you for reaching out / contacting us / your email", "We hope this email finds you well", "Please do not hesitate to contact us", "I trust this answers your query", "Please be advised", "Kindly note", "As per our conversation"
- Match brevity: if the client wrote 2 sentences, write 2–3 back. Don't over-explain.
- 2–5 paragraphs maximum
- End with: "Best regards,\nTrade Risk Solutions"
- Only cite figures or terms from the retrieved knowledge above — never fabricate
- Body text only — no subject line`

  const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
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
