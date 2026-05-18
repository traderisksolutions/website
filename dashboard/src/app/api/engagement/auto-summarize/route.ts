import { NextRequest, NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

function sbHeaders(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

type MsgRow      = { direction: string; from_address: string | null; body_text: string | null; sent_at: string }
type SummaryRow  = { summary: string; next_action: string | null; created_at: string }
type FeedbackRow = { original_draft: string | null; final_sent: string | null }

// POST /api/engagement/auto-summarize
// Called by the ingest pipeline after a new message is stored.
// Generates: summary, next_action, draft_reply — stores in thread_summaries.
export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let thread_id: string, message_id: string
  try {
    ({ thread_id, message_id } = await req.json())
    if (!thread_id || !message_id) throw new Error('missing ids')
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    // 1. All messages in this thread (oldest first)
    const msgsRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&order=sent_at.asc&select=direction,from_address,body_text,sent_at`,
      { headers: sbHeaders() }
    )
    const messages: MsgRow[] = msgsRes.ok ? await msgsRes.json() : []
    if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ ok: true })

    // 2. Past summaries for this thread (progressive context, newest first)
    const pastRes = await fetch(
      `${SB_URL}/rest/v1/thread_summaries?thread_id=eq.${thread_id}&order=created_at.desc&limit=3&select=summary,next_action,created_at`,
      { headers: sbHeaders() }
    )
    const pastSummaries: SummaryRow[] = pastRes.ok ? await pastRes.json() : []

    // 3. Recent draft feedback (global — teaches preferred writing style)
    const feedbackRes = await fetch(
      `${SB_URL}/rest/v1/draft_feedback?order=created_at.desc&limit=5&select=original_draft,final_sent`,
      { headers: sbHeaders() }
    )
    const feedback: FeedbackRow[] = feedbackRes.ok ? await feedbackRes.json() : []

    // ── Build prompt sections ─────────────────────────────────────────────────

    const threadText = messages.map(m => {
      const who  = m.direction === 'inbound' ? `CLIENT (${m.from_address})` : 'TRS (us)'
      const date = new Date(m.sent_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      return `[${date}] ${who}:\n${(m.body_text ?? '').slice(0, 800)}`
    }).join('\n\n---\n\n')

    const pastSummaryText = Array.isArray(pastSummaries) && pastSummaries.length > 0
      ? [...pastSummaries].reverse().map(s =>
          `[${new Date(s.created_at).toLocaleDateString('en-SG')}] ${s.summary}${s.next_action ? ` → Next: ${s.next_action}` : ''}`
        ).join('\n')
      : 'No previous summaries — this is the first message in this thread.'

    const feedbackText = Array.isArray(feedback) && feedback.length > 0
      ? feedback.map((f, i) =>
          `Example ${i + 1}:\nAI drafted: "${(f.original_draft ?? '').slice(0, 200)}"\nStaff sent: "${(f.final_sent ?? '').slice(0, 200)}"`
        ).join('\n\n')
      : 'No feedback examples yet — use professional, warm Singapore business English.'

    const prompt = `You are an email assistant for Trade Risk Solutions, a Singapore insurance brokerage.

━━ CONVERSATION THREAD ━━
${threadText}

━━ PREVIOUS SUMMARIES (progressive context — reference these to show conversation progression) ━━
${pastSummaryText}

━━ COMMUNICATION STYLE EXAMPLES (study the difference between what AI wrote and what staff actually sent) ━━
${feedbackText}

━━ YOUR TASK ━━
Return ONLY a valid JSON object with these three fields.
If the email is automated, a notification, or purely internal (no external client), return {"summary":null,"next_action":null,"draft_reply":null}.

{
  "summary": "2-3 sentences. Who is the client, what do they need, where does the conversation stand now. If previous summaries exist, reference how this new message advances or changes the situation.",
  "next_action": "One specific, concrete next step for TRS. Name the product type, the client, and a timeframe. Example: 'Send employee benefits quote for 20 pax at $5k/pax/yr to client within 2 business days.'",
  "draft_reply": "Complete ready-to-send reply email. Structure: (1) Acknowledge the client message, (2) Provide specific information if available or state we will revert within 5 business days, (3) Clear next step for the client. Sign off as: Trade Risk Solutions Operations. Do NOT include a subject line."
}`

    // ── Call Gemini ───────────────────────────────────────────────────────────

    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY not set')

    const geminiRes = await fetch(`${GEMINI_URL}?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.3,
          maxOutputTokens:  900,
          responseMimeType: 'application/json',
        },
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
      console.log('[auto-summarize] skipped (internal/automated thread):', thread_id)
      return NextResponse.json({ ok: true })
    }

    // ── Store in thread_summaries ─────────────────────────────────────────────

    const insertRes = await fetch(`${SB_URL}/rest/v1/thread_summaries`, {
      method:  'POST',
      headers: sbHeaders('return=minimal'),
      body: JSON.stringify({
        thread_id,
        message_id,
        summary:     result.summary,
        next_action: result.next_action,
        draft_reply: result.draft_reply,
      }),
    })

    if (!insertRes.ok) console.error('[auto-summarize] insert failed:', await insertRes.text())
    else console.log('[auto-summarize] stored summary for thread', thread_id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[auto-summarize] fatal:', e)
    return NextResponse.json({ ok: true }) // always ack so ingest doesn't retry
  }
}
