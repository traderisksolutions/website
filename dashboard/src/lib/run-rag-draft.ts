/**
 * RAG draft generation: embed email thread → similarity search → Gemini reply
 * Saves to rag_thread_drafts + rag_draft_sources.
 *
 * Mirrors the GDrive draft route in capability:
 * - Classifies email type (SKIP guard, 6 types)
 * - Injects few-shot examples from prompt_examples
 * - Injects anti-patterns from low-scoring draft_evaluations
 * - Reads campaign context + outbound lead profile from email_threads
 * - Type-specific instructions matching GDrive quality
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

const VALID_TYPES = ['PRICING', 'COVERAGE', 'RENEWAL', 'DOCUMENT', 'CLAIMS', 'CONVERSATION'] as const
type EmailType = typeof VALID_TYPES[number]

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

  const lastMsgText = messages.slice(-3).map(m => (m.body_text ?? '').slice(0, 3000)).join('\n---\n')

  // 2. Embed + classify + fetch campaign context — all in parallel
  const classifyPrompt = `Classify this email for a Singapore insurance brokerage. Reply with EXACTLY one word from this list:

SKIP       — spam, newsletter, promotional email, automated notification, delivery receipt, out-of-office
PRICING    — client asking for a quote, premium, or indicative cost for insurance coverage
COVERAGE   — client asking what a policy covers, whether a scenario is covered, or about exclusions/terms
RENEWAL    — renewing an existing policy, or asking about expiry/renewal options
DOCUMENT   — requesting a document (certificate of insurance, policy wording, endorsement, invoice)
CLAIMS     — reporting an incident, asking about a claim, or requesting claims assistance
CONVERSATION — general back-and-forth, follow-up, relationship email, or anything not in the above

EMAIL:
${lastMsgText}

Reply with one word only.`

  const [embedding, classifyData, ctxRows] = await Promise.all([
    embedText(threadText.slice(0, 8000), key),
    fetch(`${GEMINI_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: classifyPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 12 },
      }),
    }).then(r => r.json()).catch(() => ({})),
    fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}&select=campaign_context&limit=1`, {
      headers: sbHeaders(), cache: 'no-store',
    }).then(r => r.ok ? r.json() : []).catch(() => []),
  ])

  // Resolve email type; bail on SKIP
  const verdict   = ((classifyData as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase()
  if (verdict.startsWith('SKIP')) {
    console.log('[run-rag-draft] SKIP — not an enquiry, skipping draft')
    return
  }
  const emailType: EmailType = VALID_TYPES.find(t => verdict.startsWith(t)) ?? 'CONVERSATION'
  console.log('[run-rag-draft] email type:', emailType)

  // 3. Chunk search (needs embedding from step 2)
  if (embedding.length === 0) {
    console.warn('[run-rag-draft] embedding returned empty — skipping')
    return
  }
  const sources = await searchChunks(embedding)
  if (sources.length === 0) {
    console.log('[run-rag-draft] no relevant chunks found for thread', thread_id)
    return
  }

  // 4. Campaign context
  const ctx = Array.isArray(ctxRows) ? (ctxRows as { campaign_context?: { campaign_name?: string; product_type?: string; step_replied_to?: number; outbound_lead_id?: string } }[])[0]?.campaign_context : null
  let campaignCtxStr = ''
  if (ctx?.campaign_name) {
    campaignCtxStr = `\nCAMPAIGN CONTEXT: This contact replied to a TRS cold outreach campaign "${ctx.campaign_name}" (${ctx.product_type} focus${ctx.step_replied_to ? `, step ${ctx.step_replied_to}` : ''}). This is their first real engagement — acknowledge their interest warmly and continue naturally. Do NOT explicitly reference the campaign or that this was a cold email.`
  }

  // 5. Few-shots + anti-patterns + lead profile — parallel
  const [fewShotRows, apRows, leadRows] = await Promise.all([
    fetch(
      `${SB_URL}/rest/v1/prompt_examples?email_type=eq.${emailType}&order=score.desc,created_at.desc&limit=2&select=context_summary,ideal_reply`,
      { headers: sbHeaders(), cache: 'no-store' }
    ).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(
      `${SB_URL}/rest/v1/draft_evaluations?email_type=eq.${emailType}&score=lte.3&order=created_at.desc&limit=6&select=eval_json`,
      { headers: sbHeaders(), cache: 'no-store' }
    ).then(r => r.ok ? r.json() : []).catch(() => []),
    ctx?.outbound_lead_id
      ? fetch(
          `${SB_URL}/rest/v1/outbound_leads?id=eq.${ctx.outbound_lead_id}&select=title,headline,current_company,industry,employee_count&limit=1`,
          { headers: sbHeaders(), cache: 'no-store' }
        ).then(r => r.ok ? r.json() : []).catch(() => [])
      : Promise.resolve([]),
  ])

  // Few-shot section
  let fewShotSection = ''
  const fewShots = Array.isArray(fewShotRows)
    ? (fewShotRows as { context_summary?: string; ideal_reply: string }[])
    : []
  if (fewShots.length > 0) {
    fewShotSection = `\n━━ EXAMPLES OF EXCELLENT ${emailType} REPLIES — learn the pattern, match this quality ━━\n` +
      fewShots.map((ex, i) =>
        `[Example ${i + 1}]${ex.context_summary ? `\nContext: ${ex.context_summary}` : ''}\nReply:\n${ex.ideal_reply.slice(0, 1200)}`
      ).join('\n\n') + '\n'
  }

  // Anti-pattern section
  let antiPatternSection = ''
  const learnings = (Array.isArray(apRows) ? apRows as { eval_json: { key_learning?: string } | null }[] : [])
    .map(r => r.eval_json?.key_learning)
    .filter((l): l is string => typeof l === 'string' && l.length > 15)
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, 4)
  if (learnings.length > 0) {
    antiPatternSection = `\n━━ AVOID THESE PATTERNS (learned from heavily-edited or rejected ${emailType} drafts — do NOT repeat these mistakes) ━━\n` +
      learnings.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n'
  }

  // Lead profile
  let leadProfileStr = ''
  const lead = Array.isArray(leadRows) && leadRows.length > 0
    ? (leadRows as { title: string | null; headline: string | null; current_company: string | null; industry: string | null; employee_count: number | null }[])[0]
    : null
  if (lead) {
    const role = lead.title || lead.headline || null
    const profileParts = [
      role                 && `Role: ${role}`,
      lead.current_company && `Company: ${lead.current_company}`,
      lead.industry        && `Industry: ${lead.industry}`,
      lead.employee_count  && `~${lead.employee_count.toLocaleString()} employees`,
    ].filter((p): p is string => Boolean(p))
    if (profileParts.length > 0) {
      leadProfileStr = `\nLEAD PROFILE (outbound contact — use to personalise tone and examples): ${profileParts.join(' | ')}`
    }
  }

  // 6. Type-specific instructions (knowledge chunks are always present here)
  const chunkSources = Array.from(new Set(sources.map(s => s.file_name))).join(', ')
  const typeInstructions = (() => {
    switch (emailType) {
      case 'PRICING':
        return `━━ PRICING ENQUIRY ━━
The retrieved knowledge passages may contain premium figures, coverage limits, or deductibles.
If pricing figures are present, structure as bullet points:
  • [Insurer] — SGD [premium] premium | SGD [sum insured] covered | SGD [deductible] deductible
After the bullets, recommend the best option and why.
If no pricing data in the retrieved knowledge: "We will revert with indicative pricing within 2 business days."
Ask for any missing details needed to obtain a quote (coverage amount, specific risk details, etc.).`

      case 'COVERAGE':
        return `━━ COVERAGE QUESTION ━━
Answer directly in the first sentence. Quote the relevant passage from the retrieved knowledge and name the source.
If no passage answers the question: "We will check your policy wording and revert within 2 business days."
2–3 sentences unless the client asked multiple distinct questions.`

      case 'RENEWAL':
        return `━━ RENEWAL ━━
Retrieved knowledge: ${chunkSources} — reference product specs or coverage details if relevant to this renewal.
- Ask for: current insurer, sum insured, expiry date, any changes to the risk (new locations, headcount changes, fleet additions, etc.)
- If renewal terms are already in the thread: confirm next steps clearly
- 2–3 short sentences`

      case 'DOCUMENT':
        return `━━ DOCUMENT REQUEST ━━
Retrieved knowledge: ${chunkSources} — if the retrieved passages describe the document being requested (policy wording, COI format, endorsement terms), reference that knowledge.
- Confirm what they need and when TRS will provide it: "We will send your [document type] by [end of day / within 24 hours]."
- If you cannot identify the specific document from the thread: ask one focused clarifying question
- 2–3 sentences maximum — do not over-explain`

      case 'CLAIMS':
        return `━━ CLAIMS ━━
Retrieved knowledge: ${chunkSources} — reference claims procedures or notification requirements only if clearly stated in the retrieved passages. Do not infer or fabricate.
- One sentence acknowledging the situation (brief, calm, no drama)
- Ask for: date of incident, policy number (if known), brief description of what happened, estimated amount of loss/damage
- Do NOT promise or imply anything about coverage, liability, or outcome
- 2–3 sentences`

      default: // CONVERSATION
        return `━━ CONVERSATION / FOLLOW-UP ━━
Retrieved knowledge: ${chunkSources} — reference if the conversation touches on a specific product or coverage detail naturally.
- Continue the thread naturally — respond to what was actually asked or said
- Match the tone and length of the client's latest message. If they wrote 2 sentences, write 2–3 back.
- 1–3 sentences is usually enough
- If they asked a direct question, answer it in the first sentence`
    }
  })()

  // 7. Build knowledge chunks block
  const chunksText = sources
    .map((s, i) => `[Source ${i + 1}: ${s.file_name} — section ${s.chunk_index + 1} (${Math.round(s.similarity * 100)}% match)]\n${s.content}`)
    .join('\n\n---\n\n')

  // 8. Build full prompt
  const prompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage. You draft replies that Account Executives review and send. Replies must read like a senior AE wrote them — direct, specific, no filler.
${campaignCtxStr}
${typeInstructions}
${fewShotSection}${antiPatternSection}
━━ UNIVERSAL RULES ━━
- Start with exactly "${salutation}"
- Lead immediately with the answer or action — no warm-up sentences
- BANNED PHRASES (never use): "Thank you for reaching out / contacting us / your email", "We hope this email finds you well", "Please do not hesitate to contact us", "I trust this answers your query", "Please be advised", "Kindly note", "As per our conversation", "As always, we appreciate"
- Match brevity to the thread: if the client wrote 2 sentences, write 2–3 back. Don't over-explain.
- Short sentences — aim for 15–20 words max
- 2–5 paragraphs maximum
- Do NOT include any closing, sign-off, or signature — the signature is appended separately by the sender
- Body text only — no subject line
- Only cite figures or terms from the retrieved knowledge above — never fabricate${leadProfileStr}

━━ CONVERSATION THREAD ━━
${threadText}

━━ RETRIEVED KNOWLEDGE ━━
The following passages were retrieved from TRS's knowledge base as relevant to this enquiry:

${chunksText}

Write only the email body starting with "${salutation}". End after the last paragraph — no closing line or signature.`

  // 9. Generate draft
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
  void logGeminiUsage('rag_draft_reply', geminiData.usageMetadata ?? {}, thread_id)

  const content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  if (!content) throw new Error('Gemini returned empty RAG draft')

  // 10. Save RAG draft — try with email_type, fall back if column missing
  let draftRows: unknown
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rag_thread_drafts`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({ thread_id, message_id, content, email_type: emailType }),
    })
    if (!r.ok) throw new Error(await r.text())
    draftRows = await r.json()
  } catch {
    const r = await fetch(`${SB_URL}/rest/v1/rag_thread_drafts`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({ thread_id, message_id, content }),
    })
    if (!r.ok) throw new Error(`RAG draft insert failed: ${await r.text()}`)
    draftRows = await r.json()
  }
  const draft = Array.isArray(draftRows)
    ? (draftRows as { id: string }[])[0]
    : (draftRows as { id: string })
  if (!draft?.id) throw new Error('No draft id returned')

  // 11. Save source attributions
  await fetch(`${SB_URL}/rest/v1/rag_draft_sources`, {
    method:  'POST',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify(sources.map(s => ({
      draft_id:    draft.id,
      file_id:     s.file_id,
      file_name:   s.file_name,
      chunk_index: s.chunk_index,
      similarity:  s.similarity,
      content:     s.content.slice(0, 500),
    }))),
  })

  console.log('[run-rag-draft] saved draft for thread', thread_id, '| type:', emailType, '| sources:', chunkSources)
}
