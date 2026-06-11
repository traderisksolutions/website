import { createSign }     from 'crypto'
import { logGeminiUsage } from '@/lib/gemini-usage'
import { runRagDraft }    from '@/lib/run-rag-draft'

const SB_URL         = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const GEMINI_UPLOAD  = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const DRIVE_API      = 'https://www.googleapis.com/drive/v3'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getServiceAccountToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(raw)
  const now   = Math.floor(Date.now() / 1000)
  const hdr   = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const pay   = b64url(JSON.stringify({
    iss: creds.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const unsigned = `${hdr}.${pay}`
  const signer   = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(creds.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

type DriveFile = { id: string; name: string; mimeType: string }

async function listDriveFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const q   = encodeURIComponent(`'${folderId}' in parents and trashed = false`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=30`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return Array.isArray(data.files) ? data.files : []
}

async function downloadDriveFile(token: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return Buffer.from(await res.arrayBuffer())
}

const TOPIC_KEYWORDS = ['construction', 'marine', 'cargo', 'benefits', 'employee', 'fire',
                        'property', 'liability', 'motor', 'travel', 'engineering', 'hull', 'general']

function scoreFile(filename: string, threadText: string): number {
  const name = filename.toLowerCase()
  const text = threadText.toLowerCase()
  return TOPIC_KEYWORDS.filter(k => name.includes(k) && text.includes(k)).length
}

async function uploadToGemini(pdf: Buffer, filename: string, apiKey: string): Promise<string | null> {
  const boundary = `trs_${Date.now()}`
  const meta     = JSON.stringify({ display_name: filename })
  const body     = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
    Buffer.from(meta),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res  = await fetch(`${GEMINI_UPLOAD}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, 'X-Goog-Upload-Protocol': 'multipart' },
    body,
  })
  const data = await res.json()
  return data?.file?.uri ?? null
}

async function fetchKnowledgeDocs(threadText: string, apiKey: string): Promise<{ name: string; uri: string }[]> {
  const folderId = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID ?? ''
  if (!folderId || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return []
  try {
    const token  = await getServiceAccountToken()
    const files  = await listDriveFiles(token, folderId)
    const pdfs   = files.filter(f => f.mimeType === 'application/pdf' || f.name.endsWith('.pdf'))
    if (pdfs.length === 0) return []
    const scored   = pdfs.map(f => ({ ...f, score: scoreFile(f.name, threadText) })).sort((a, b) => b.score - a.score)
    const matching = scored.filter(f => f.score > 0).slice(0, 4)
    const selected = matching.length > 0 ? matching : scored.slice(0, 2)
    const results: { name: string; uri: string }[] = []
    for (const file of selected) {
      const pdf = await downloadDriveFile(token, file.id)
      const uri = await uploadToGemini(pdf, file.name, apiKey)
      if (uri) {
        results.push({ name: file.name, uri })
        console.log('[auto-summarize] loaded doc:', file.name, '(score:', file.score, ')')
      }
    }
    return results
  } catch (e) {
    console.error('[auto-summarize] Drive fetch failed (non-fatal):', e)
    return []
  }
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
    return `[${date}] ${who}:\n${m.body_text ?? ''}`
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

  const prompt = `You are an email assistant for Trade Risk Solutions, a Singapore insurance brokerage.

━━ CONVERSATION THREAD ━━
${threadText}

━━ PREVIOUS SUMMARIES ━━
${pastSummaryText}

━━ COMMUNICATION STYLE EXAMPLES ━━
${feedbackText}

━━ KNOWLEDGE DOCUMENTS ━━
${docsNote}

━━ YOUR TASK ━━
Return ONLY a valid JSON object. If the email is automated, a notification, or purely internal with no external client, return {"summary":null,"next_action":null,"draft_reply":null}.

{
  "summary": "2-3 sentences: who is the client, what do they need, where does the conversation stand. Reference previous summaries to show progression.",
  "next_action": "One specific concrete next step for TRS — name the product, client, and timeframe.",
  "draft_reply": "Complete ready-to-send reply. (1) Acknowledge client message. (2) Provide specific figures from attached docs if available, or state 5-business-day turnaround. (3) Clear next step for the client. Sign off as: Trade Risk Solutions Operations. No subject line."
}`

  const parts: unknown[] = docs.map(d => ({ file_data: { mime_type: 'application/pdf', file_uri: d.uri } }))
  parts.push({ text: prompt })

  const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: 'application/json' },
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
      body:    JSON.stringify({ status: 'rejected', rejection_note: 'Superseded by newer auto-draft' }),
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
