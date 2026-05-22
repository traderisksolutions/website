import { NextRequest, NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

// POST /api/engagement/refresh-summary
// Manually trigger AI analysis for a thread (no internal HTTP, Supabase middleware protects this route).
export async function POST(req: NextRequest) {
  let thread_id: string, message_id: string
  try {
    ;({ thread_id, message_id } = await req.json())
    if (!thread_id || !message_id) throw new Error('missing ids')
  } catch {
    return NextResponse.json({ error: 'thread_id and message_id required' }, { status: 400 })
  }

  const key = process.env.GEMINI_API_KEY_DRAFT_EMAIL
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

  // 1. Fetch thread messages
  const msgsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`,
    { headers: sbHeaders() }
  )
  const messages: { direction: string; from_address: string | null; body_text: string | null; sent_at: string }[] =
    msgsRes.ok ? await msgsRes.json() : []
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages found for this thread' }, { status: 404 })
  }

  // 2. Past summaries for context
  const pastRes = await fetch(
    `${SB_URL}/rest/v1/thread_summaries?thread_id=eq.${thread_id}&order=created_at.desc&limit=3&select=summary,next_action,created_at`,
    { headers: sbHeaders() }
  )
  const pastSummaries: { summary: string; next_action: string | null; created_at: string }[] =
    pastRes.ok ? await pastRes.json() : []

  // 3. Build prompt
  const threadText = messages.map(m => {
    const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
    const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `[${date}] ${who}:\n${m.body_text ?? ''}`
  }).join('\n\n---\n\n')

  const pastSummaryText = Array.isArray(pastSummaries) && pastSummaries.length > 0
    ? [...pastSummaries].reverse().map(s =>
        `[${new Date(s.created_at).toLocaleDateString('en-SG')}] ${s.summary}${s.next_action ? ` → Next: ${s.next_action}` : ''}`
      ).join('\n')
    : 'No previous summaries — this is the first message in this thread.'

  const prompt = `You are an email assistant for Trade Risk Solutions, a Singapore insurance brokerage.

━━ CONVERSATION THREAD ━━
${threadText}

━━ PREVIOUS SUMMARIES ━━
${pastSummaryText}

━━ YOUR TASK ━━
Return ONLY a valid JSON object. If the email is purely internal (TRS-to-TRS) with no external client, return {"summary":null,"next_action":null,"draft_reply":null}.

{
  "summary": "2-3 sentences: who is the client, what do they need, where does the conversation stand.",
  "next_action": "One specific concrete next step for TRS.",
  "draft_reply": "Complete ready-to-send reply to the client. Sign off as: Trade Risk Solutions Operations. No subject line."
}`

  // 4. Call Gemini
  const gemRes = await fetch(`${GEMINI_URL}?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 900, responseMimeType: 'application/json' },
    }),
  })

  if (!gemRes.ok) {
    const errText = await gemRes.text()
    console.error('[refresh-summary] Gemini error:', gemRes.status, errText)
    return NextResponse.json({ error: `Gemini ${gemRes.status}: ${errText}` }, { status: 502 })
  }

  const gemData   = await gemRes.json()
  const resultText = gemData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!resultText) {
    const reason = gemData?.candidates?.[0]?.finishReason ?? 'unknown'
    return NextResponse.json({ error: `Gemini returned no content (finishReason: ${reason})` }, { status: 502 })
  }

  let result: { summary: string | null; next_action: string | null; draft_reply: string | null }
  try { result = JSON.parse(resultText) }
  catch { return NextResponse.json({ error: `JSON parse failed: ${resultText.slice(0, 200)}` }, { status: 502 }) }

  if (!result.summary) return NextResponse.json({ ok: true, skipped: 'internal/automated thread' })

  // 5. Store in thread_summaries
  const insertRes = await fetch(`${SB_URL}/rest/v1/thread_summaries`, {
    method:  'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body:    JSON.stringify({ thread_id, message_id, summary: result.summary, next_action: result.next_action, draft_reply: result.draft_reply }),
  })
  if (!insertRes.ok) {
    const err = await insertRes.text()
    return NextResponse.json({ error: `DB insert failed: ${err}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
