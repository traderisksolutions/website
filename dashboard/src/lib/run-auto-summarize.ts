import { logGeminiUsage }       from '@/lib/gemini-usage'
import { runRagDraft }           from '@/lib/run-rag-draft'
import { fetchKnowledgeDocs }    from '@/lib/gdrive-knowledge'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type MsgRow      = { direction: string; from_address: string | null; body_text: string | null; sent_at: string }
type SummaryRow  = { summary: string; next_action: string | null; created_at: string }
type FeedbackRow = { original_draft: string | null; final_sent: string | null }

export async function runAutoSummarize(thread_id: string, message_id: string): Promise<void> {
  const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')

  // 1. All messages in thread (oldest first)
  const msgsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`,
    { headers: sbHeaders() }
  )
  const messages: MsgRow[] = msgsRes.ok ? await msgsRes.json() : []
  if (!Array.isArray(messages) || messages.length === 0) return

  // 2. Past summaries for progressive context
  const pastRes = await fetch(
    `${SB_URL}/rest/v1/thread_summaries?thread_id=eq.${thread_id}&order=created_at.desc&limit=3&select=summary,next_action,created_at`,
    { headers: sbHeaders() }
  )
  const pastSummaries: SummaryRow[] = pastRes.ok ? await pastRes.json() : []

  // 3. Recent draft feedback for style learning
  const feedbackRes = await fetch(
    `${SB_URL}/rest/v1/draft_feedback?order=created_at.desc&limit=5&select=original_draft,final_sent`,
    { headers: sbHeaders() }
  )
  const feedback: FeedbackRow[] = feedbackRes.ok ? await feedbackRes.json() : []

  const threadText = messages.map(m => {
    const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
    const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${date}] ${who}:\n${(m.body_text ?? '').slice(0, 8000)}`
  }).join('\n\n---\n\n')

  const docs = await fetchKnowledgeDocs(threadText, key)

  const pastSummaryText = Array.isArray(pastSummaries) && pastSummaries.length > 0
    ? [...pastSummaries].reverse().map(s =>
        `[${new Date(s.created_at).toLocaleDateString('en-SG')}] ${s.summary}${s.next_action ? ` → Next: ${s.next_action}` : ''}`
      ).join('\n')
    : 'No previous summaries — this is the first message in this thread.'

  const feedbackText = Array.isArray(feedback) && feedback.length > 0
    ? feedback.map((f, i) =>
        `Example ${i + 1}:\nAI drafted: "${(f.original_draft ?? '').slice(0, 200)}"\nStaff sent: "${(f.final_sent ?? '').slice(0, 200)}"`
      ).join('\n\n')
    : 'No feedback yet — use professional, warm Singapore business English.'

  const docsNote = docs.length > 0
    ? `The following knowledge documents have been attached: ${docs.map(d => d.name).join(', ')}.
Read all attached documents. Based on the conversation topic, identify which document(s) are directly relevant to this client's enquiry. Use specific figures, coverage terms, or pricing from the relevant document(s) in your draft reply, and cite the document name when you do. If an attached document is unrelated to this enquiry, ignore it entirely. If no attached document contains the specific information needed, state that TRS will revert with specific terms within 5 business days.`
    : 'No knowledge documents are available for this thread — do not fabricate figures or pricing. State that TRS will revert with specific terms within 5 business days.'

  const prompt = `You are an email assistant for Trade Risk Solutions (TRS), a Singapore insurance brokerage.

━━ CONVERSATION THREAD ━━
${threadText}

━━ PREVIOUS SUMMARIES ━━
${pastSummaryText}

━━ COMMUNICATION STYLE EXAMPLES ━━
${feedbackText}

━━ KNOWLEDGE DOCUMENTS ━━
${docsNote}

━━ YOUR TASK ━━
Return ONLY a valid JSON object.

Return {"summary":null,"next_action":null,"draft_reply":null} if the email is ANY of:
- Automated notification, system alert, delivery receipt, or out-of-office reply
- A newsletter, promotional content, or marketing email (even if forwarded by a real person)
- Spam or accidental forward with no genuine client action required
- Purely internal (TRS-to-TRS) with no external client action required

Otherwise return:
{
  "summary": "2-3 sentences: who is the client, what do they need, where does the conversation stand.",
  "next_action": "One specific concrete next step for TRS — name the product, client, and timeframe.",
  "draft_reply": "<full reply following the rules below>"
}

Rules for draft_reply:
- Silently identify the email type: PRICING / COVERAGE / RENEWAL / DOCUMENT / CLAIMS / CONVERSATION
- Start with Dear [FirstName], or Dear Sir/Madam if name unknown
- BANNED: "Thank you for reaching out", "We hope this email finds you well", "Please do not hesitate", "I trust this answers", "Please be advised", "Kindly note"
- Lead immediately with the answer or action — no warm-up sentence
- PRICING: if knowledge docs have pricing, present as bullet points (• Insurer — SGD X | SGD Y covered | SGD Z deductible), then recommend best option. If no pricing in docs: "We will revert with indicative pricing within 2 business days."
- COVERAGE: answer directly, cite the document name if quoting a clause. If uncertain: "We will check your policy wording and revert within 2 business days."
- RENEWAL: ask for current insurer, sum insured, expiry date, any risk changes. 2-3 sentences.
- DOCUMENT: confirm what's being sent and when. 2-3 sentences max.
- CLAIMS: acknowledge briefly, ask for date of incident / policy number / description / estimated amount. Do not promise anything about coverage.
- CONVERSATION: continue naturally, match the client's tone and length
- Match brevity: short client email → short reply. 2-5 paragraphs maximum.
- End with: Best regards,\\nTrade Risk Solutions`

  const parts: unknown[] = docs.map(d => ({ file_data: { mime_type: 'application/pdf', file_uri: d.uri } }))
  parts.push({ text: prompt })

  const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text()
    throw new Error(`Gemini ${geminiRes.status}: ${errText}`)
  }

  const geminiData = await geminiRes.json()
  void logGeminiUsage('auto_summarize', geminiData.usageMetadata ?? {}, thread_id)
  const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!resultText) throw new Error('Gemini returned empty response')

  let result: { summary: string | null; next_action: string | null; draft_reply: string | null }
  try { result = JSON.parse(resultText) }
  catch { throw new Error(`JSON parse failed: ${resultText.slice(0, 200)}`) }

  if (!result.summary) {
    console.log('[auto-summarize] skipped (internal/automated):', thread_id)
    return
  }

  const insertRes = await fetch(`${SB_URL}/rest/v1/thread_summaries`, {
    method:  'POST',
    headers: sbHeaders('return=minimal'),
    body: JSON.stringify({ thread_id, message_id, summary: result.summary, next_action: result.next_action, draft_reply: result.draft_reply }),
  })
  if (!insertRes.ok) throw new Error(`Supabase insert failed: ${await insertRes.text()}`)

  console.log('[auto-summarize] stored for thread', thread_id, '| docs used:', docs.map(d => d.name).join(', ') || 'none')

  // Save auto-draft to ai_drafts (single source of truth).
  // This means users see the draft immediately when opening the thread — no manual generate needed.
  if (result.draft_reply) {
    // Look up contact_id from email_threads so the draft can be sent later
    const tRes      = await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}&select=contact_id&limit=1`, { headers: sbHeaders() })
    const tRows     = tRes.ok ? await tRes.json() : []
    const contactId = Array.isArray(tRows) ? (tRows[0]?.contact_id ?? null) : null

    // Supersede any existing pending drafts for this thread so only the latest is shown
    await fetch(`${SB_URL}/rest/v1/ai_drafts?thread_id=eq.${thread_id}&status=eq.pending`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ status: 'superseded' }),
    })

    // Insert new auto-draft
    const draftRes = await fetch(`${SB_URL}/rest/v1/ai_drafts`, {
      method:  'POST',
      headers: sbHeaders('return=minimal'),
      body: JSON.stringify({
        contact_id:   contactId,
        thread_id:    thread_id,
        channel:      'email',
        body:         result.draft_reply,
        status:       'pending',
        generated_by: 'auto',
      }),
    })
    if (!draftRes.ok) {
      console.error('[auto-summarize] ai_drafts insert failed (non-fatal):', await draftRes.text())
    } else {
      console.log('[auto-summarize] auto-draft saved to ai_drafts for thread', thread_id)
    }
  }

  // Fire RAG draft in parallel — non-fatal, runs alongside GDrive draft
  runRagDraft(thread_id, message_id).catch(e =>
    console.error('[auto-summarize] RAG draft failed (non-fatal):', e instanceof Error ? e.message : e)
  )
}
