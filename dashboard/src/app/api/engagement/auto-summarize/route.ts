import { NextRequest, NextResponse } from 'next/server'
import { createSign }               from 'crypto'

const SB_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files'
const DRIVE_API   = 'https://www.googleapis.com/drive/v3'
const FOLDER_ID   = process.env.GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID ?? ''

// ── Supabase ──────────────────────────────────────────────────────────────────

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// ── Google Service Account Auth ───────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input)
    ? input.toString('base64')
    : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getServiceAccountToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(raw)

  const now    = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }))

  const unsigned = `${header}.${payload}`
  const signer   = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(creds.private_key))}`

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

type DriveFile = { id: string; name: string; mimeType: string }

async function listDriveFiles(token: string): Promise<DriveFile[]> {
  const q   = encodeURIComponent(`'${FOLDER_ID}' in parents and trashed = false`)
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

// Score a filename against thread text — higher = more relevant
const TOPIC_KEYWORDS = ['construction', 'marine', 'cargo', 'benefits', 'employee', 'fire',
                        'property', 'liability', 'motor', 'travel', 'engineering', 'hull', 'general']

function scoreFile(filename: string, threadText: string): number {
  const name = filename.toLowerCase()
  const text = threadText.toLowerCase()
  return TOPIC_KEYWORDS.filter(k => name.includes(k) && text.includes(k)).length
}

// ── Gemini File API ───────────────────────────────────────────────────────────

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

  const res  = await fetch(`${GEMINI_UPLOAD_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: {
      'Content-Type':           `multipart/related; boundary=${boundary}`,
      'X-Goog-Upload-Protocol': 'multipart',
    },
    body,
  })
  const data = await res.json()
  return data?.file?.uri ?? null
}

// ── Retrieve relevant knowledge docs from Drive ───────────────────────────────

async function fetchKnowledgeDocs(threadText: string, apiKey: string): Promise<
  { name: string; uri: string }[]
> {
  if (!FOLDER_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return []

  try {
    const token = await getServiceAccountToken()
    const files = await listDriveFiles(token)
    const pdfs  = files.filter(f => f.mimeType === 'application/pdf' || f.name.endsWith('.pdf'))

    if (pdfs.length === 0) return []

    // Score by keyword overlap; load all matching docs (up to 4), fallback to first 2 if none match
    const scored = pdfs
      .map(f => ({ ...f, score: scoreFile(f.name, threadText) }))
      .sort((a, b) => b.score - a.score)

    const matching  = scored.filter(f => f.score > 0).slice(0, 4)
    const selected  = matching.length > 0 ? matching : scored.slice(0, 2)

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

// ── Types ─────────────────────────────────────────────────────────────────────

type MsgRow      = { direction: string; from_address: string | null; body_text: string | null; sent_at: string }
type SummaryRow  = { summary: string; next_action: string | null; created_at: string }
type FeedbackRow = { original_draft: string | null; final_sent: string | null }

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== (process.env.CRON_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let thread_id: string, message_id: string
  try {
    ;({ thread_id, message_id } = await req.json())
    if (!thread_id || !message_id) throw new Error('missing ids')
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    // 1. All messages in thread (oldest first)
    const msgsRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`,
      { headers: sbHeaders() }
    )
    const messages: MsgRow[] = msgsRes.ok ? await msgsRes.json() : []
    if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ ok: true })

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

    // ── Build thread text ─────────────────────────────────────────────────────

    const threadText = messages.map(m => {
      const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
      const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `[${date}] ${who}:\n${m.body_text ?? ''}`
    }).join('\n\n---\n\n')

    // 4. Fetch relevant knowledge docs from Drive (non-blocking if it fails)
    const key  = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!key) throw new Error('GEMINI_API_KEY_DRAFT_EMAIL not set')
    const docs = await fetchKnowledgeDocs(threadText, key)

    // ── Build prompt sections ─────────────────────────────────────────────────

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

    // ── Call Gemini with optional file attachments ────────────────────────────

    const parts: unknown[] = docs.map(d => ({
      file_data: { mime_type: 'application/pdf', file_uri: d.uri },
    }))
    parts.push({ text: prompt })

    const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900, responseMimeType: 'application/json' },
      }),
    })

    if (!geminiRes.ok) {
      console.error('[auto-summarize] Gemini error:', geminiRes.status, await geminiRes.text())
      return NextResponse.json({ ok: true })
    }

    const geminiData = await geminiRes.json()
    const resultText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!resultText) { console.error('[auto-summarize] empty Gemini response'); return NextResponse.json({ ok: true }) }

    let result: { summary: string | null; next_action: string | null; draft_reply: string | null }
    try { result = JSON.parse(resultText) }
    catch { console.error('[auto-summarize] JSON parse failed:', resultText); return NextResponse.json({ ok: true }) }

    if (!result.summary) {
      console.log('[auto-summarize] skipped (internal/automated):', thread_id)
      return NextResponse.json({ ok: true })
    }

    // ── Store in thread_summaries ─────────────────────────────────────────────

    const insertRes = await fetch(`${SB_URL}/rest/v1/thread_summaries`, {
      method:  'POST',
      headers: sbHeaders('return=minimal'),
      body: JSON.stringify({ thread_id, message_id, summary: result.summary, next_action: result.next_action, draft_reply: result.draft_reply }),
    })
    if (!insertRes.ok) console.error('[auto-summarize] insert failed:', await insertRes.text())
    else console.log('[auto-summarize] stored for thread', thread_id, '| docs used:', docs.map(d => d.name).join(', ') || 'none')

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[auto-summarize] fatal:', e)
    return NextResponse.json({ ok: true })
  }
}
