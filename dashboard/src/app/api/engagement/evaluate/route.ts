import { NextRequest, NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<\/p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim()
}

// POST /api/engagement/evaluate
// Body: { draftId?: string }
// Runs evaluation synchronously and returns a full step-by-step trace.
// If draftId is omitted, uses the most recently sent ai_draft.
export async function POST(req: NextRequest) {
  const trace: string[] = []
  const step = (msg: string) => { trace.push(msg); console.log('[eval-debug]', msg) }

  try {
    const body = await req.json().catch(() => ({})) as { draftId?: string }
    const geminiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL

    step(`ENV: GEMINI_API_KEY_DRAFT_EMAIL ${geminiKey ? `set (${geminiKey.slice(0,6)}...)` : 'MISSING'}`)
    step(`ENV: SUPABASE_SERVICE_KEY ${process.env.SUPABASE_SERVICE_KEY ? 'set' : 'MISSING'}`)

    if (!geminiKey) return NextResponse.json({ ok: false, trace, error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' })

    // 1. Resolve draftId — use provided or find most recent sent draft
    let draftId = body.draftId ?? null
    if (!draftId) {
      const r = await fetch(`${SB_URL}/rest/v1/ai_drafts?status=eq.sent&order=sent_at.desc&limit=1&select=id,body,email_type,thread_id,generated_by,sent_at`, { headers: sbHeaders(), cache: 'no-store' })
      const rows = r.ok ? await r.json() : []
      const row = Array.isArray(rows) ? rows[0] : null
      step(`Draft lookup (most recent sent): status=${r.status} found=${!!row} id=${row?.id ?? 'none'} generated_by=${row?.generated_by} sent_at=${row?.sent_at}`)
      if (!row) return NextResponse.json({ ok: false, trace, error: 'No sent drafts found in ai_drafts' })
      draftId = row.id
    }

    // 2. Load the draft
    const dr = await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}&select=id,body,email_type,thread_id,generated_by,status,sent_at&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
    const drafts = dr.ok ? await dr.json() : []
    const draft = Array.isArray(drafts) ? drafts[0] : null
    step(`Draft load: status=${dr.status} found=${!!draft} generated_by=${draft?.generated_by} email_type=${draft?.email_type} body_len=${draft?.body?.length ?? 0} draft_status=${draft?.status}`)
    if (!draft?.body) return NextResponse.json({ ok: false, trace, error: 'Draft not found or has no body' })

    const emailType = draft.email_type ?? 'CONVERSATION'
    const threadId  = draft.thread_id ?? null

    // 3. Resolve human-sent body from email_messages
    let humanBody = ''
    if (threadId) {
      const mr = await fetch(`${SB_URL}/rest/v1/email_messages?thread_id=eq.${encodeURIComponent(threadId)}&direction=eq.outbound&order=sent_at.desc&select=body_text,sent_at&limit=3`, { headers: sbHeaders(), cache: 'no-store' })
      const msgs = mr.ok ? await mr.json() : []
      step(`email_messages lookup: status=${mr.status} count=${Array.isArray(msgs) ? msgs.length : 0}`)
      humanBody = Array.isArray(msgs) && msgs[0] ? (msgs[0].body_text ?? '') : ''
    } else {
      step('thread_id is null — cannot look up email_messages')
    }
    step(`Human body resolved: len=${humanBody.length} chars`)

    if (!humanBody) return NextResponse.json({ ok: false, trace, error: 'Could not resolve human-sent body — no outbound email_messages found for this thread' })

    // Strip signature
    const sigDelimiters = ['\n--\n', '\n___\n', '\n—\n']
    for (const d of sigDelimiters) {
      const idx = humanBody.indexOf(d)
      if (idx > 60) { humanBody = humanBody.slice(0, idx).trim(); step(`Signature stripped at pos=${idx}`) }
    }

    const aiBody = draft.body
    const aiTrim = aiBody.trim().replace(/\s+/g, ' ')
    const huTrim = humanBody.trim().replace(/\s+/g, ' ')
    const longer = Math.max(aiTrim.length, huTrim.length)
    const shorter = Math.min(aiTrim.length, huTrim.length)
    let matching = 0
    for (let i = 0; i < shorter; i++) { if (aiTrim[i] === huTrim[i]) matching++ }
    const overlap = longer > 0 ? matching / longer : 0
    step(`Overlap: ${Math.round(overlap * 100)}% (ai=${aiTrim.length} chars, human=${huTrim.length} chars)`)

    // 4. Short-circuit if >95% overlap
    if (overlap > 0.95) {
      step('Overlap >95% — score=5, skipping Gemini call')
      const saveRes = await fetch(`${SB_URL}/rest/v1/draft_evaluations`, {
        method: 'POST', headers: sbH(),
        body: JSON.stringify({ draft_id: draftId, thread_id: threadId, email_type: emailType, ai_body: aiBody, human_body: humanBody, score: 5,
          eval_json: { what_human_changed: 'No meaningful changes — sent almost as-is.', why_better: 'AI draft was high quality.', key_learning: 'Continue current approach for this email type.', context_summary: `${emailType} email handled well.` } }),
      })
      step(`draft_evaluations INSERT: status=${saveRes.status} ok=${saveRes.ok}`)
      if (!saveRes.ok) { const err = await saveRes.text(); step(`INSERT error: ${err.slice(0, 300)}`) }
      return NextResponse.json({ ok: true, score: 5, trace })
    }

    // 5. Gemini evaluation call
    step('Calling Gemini...')
    const inboundR = threadId
      ? await fetch(`${SB_URL}/rest/v1/email_messages?thread_id=eq.${encodeURIComponent(threadId)}&direction=eq.inbound&order=sent_at.desc&select=body_text&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
      : null
    const inboundRows = inboundR?.ok ? await inboundR.json() : []
    const incomingEmail = Array.isArray(inboundRows) ? (inboundRows[0]?.body_text ?? '') : ''

    const evalPrompt = `You evaluate AI-generated email replies for Trade Risk Solutions, a Singapore insurance brokerage.

EMAIL TYPE: ${emailType}

INCOMING CLIENT EMAIL:
${incomingEmail.slice(0, 2000)}

AI DRAFT (what the AI generated):
${aiBody.slice(0, 2000)}

HUMAN-SENT REPLY (what was actually sent after editing):
${humanBody.slice(0, 2000)}

Score the AI draft on how close it was to what the human sent (1–5):
5 = sent almost as-is — only cosmetic or punctuation edits
4 = good draft, human made small but meaningful improvements
3 = usable but human made significant rewrites, restructuring, or cuts
2 = major problems — human rewrote more than half
1 = AI draft discarded — human wrote from scratch

Return ONLY valid JSON:
{"score":<1-5>,"what_human_changed":"<one sentence>","why_better":"<one sentence>","key_learning":"<one specific rule for ${emailType} emails>","context_summary":"<2-sentence summary>"}`

    const gRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' } }),
    })
    step(`Gemini call: status=${gRes.status} ok=${gRes.ok}`)
    if (!gRes.ok) { const err = await gRes.text(); step(`Gemini error: ${err.slice(0,300)}`); return NextResponse.json({ ok: false, trace, error: 'Gemini call failed' }) }

    const gData = await gRes.json()
    const raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    step(`Gemini raw response: ${raw.slice(0, 200)}`)

    let parsed: Record<string, unknown> = {}
    try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} } catch { step('JSON parse failed') }
    const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : 0
    step(`Parsed score: ${score}`)
    if (!score) return NextResponse.json({ ok: false, trace, error: 'Could not parse score from Gemini response', raw })

    // 6. Store to draft_evaluations
    const evalRes = await fetch(`${SB_URL}/rest/v1/draft_evaluations`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ draft_id: draftId, thread_id: threadId, email_type: emailType, ai_body: aiBody, human_body: humanBody, score, eval_json: parsed }),
    })
    step(`draft_evaluations INSERT: status=${evalRes.status} ok=${evalRes.ok}`)
    if (!evalRes.ok) { const err = await evalRes.text(); step(`INSERT error: ${err.slice(0, 300)}`) }

    // 7. Store to prompt_examples if score >= 4
    if (score >= 4) {
      const exRes = await fetch(`${SB_URL}/rest/v1/prompt_examples`, {
        method: 'POST', headers: sbH(),
        body: JSON.stringify({ email_type: emailType, context_summary: String(parsed.context_summary ?? ''), ideal_reply: humanBody, score }),
      })
      step(`prompt_examples INSERT: status=${exRes.status} ok=${exRes.ok}`)
      if (!exRes.ok) { const err = await exRes.text(); step(`prompt_examples error: ${err.slice(0,300)}`) }
    }

    return NextResponse.json({ ok: true, score, eval_json: parsed, trace })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    trace.push(`EXCEPTION: ${msg}`)
    return NextResponse.json({ ok: false, trace, error: msg }, { status: 500 })
  }
}

// GET /api/engagement/evaluate
// Returns recent evaluations + examples + aggregate stats for the /analytics/eval dashboard.
export async function GET(req: NextRequest) {
  try {
    const sp    = new URL(req.url).searchParams
    const limit = Math.min(parseInt(sp.get('limit') ?? '100'), 200)

    const [evalsRes, examplesRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/draft_evaluations?order=created_at.desc&limit=${limit}&select=id,draft_id,thread_id,email_type,score,eval_json,created_at`, { headers: sbHeaders(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/prompt_examples?order=created_at.desc&limit=50&select=id,email_type,context_summary,ideal_reply,score,created_at`, { headers: sbHeaders(), cache: 'no-store' }),
    ])

    const evaluations: EvalRow[] = evalsRes.ok     ? await evalsRes.json()    : []
    const examples:    ExRow[]   = examplesRes.ok   ? await examplesRes.json() : []

    // Aggregate stats per email type
    const byType: Record<string, { count: number; total: number; scores: number[] }> = {}
    for (const e of Array.isArray(evaluations) ? evaluations : []) {
      const t = e.email_type ?? 'UNKNOWN'
      if (!byType[t]) byType[t] = { count: 0, total: 0, scores: [] }
      byType[t].count++
      byType[t].total += e.score ?? 0
      byType[t].scores.push(e.score ?? 0)
    }
    const stats = Object.entries(byType).map(([type, d]) => ({
      email_type: type,
      count:      d.count,
      avg_score:  d.count ? Math.round((d.total / d.count) * 10) / 10 : 0,
      scores:     d.scores,
    })).sort((a, b) => b.count - a.count)

    return NextResponse.json({ evaluations, examples, stats })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

interface EvalRow {
  id:         string
  draft_id:   string
  thread_id:  string | null
  email_type: string | null
  score:      number
  eval_json:  {
    what_human_changed: string
    why_better:         string
    key_learning:       string
    context_summary:    string
  } | null
  created_at: string
}

interface ExRow {
  id:              string
  email_type:      string
  context_summary: string
  ideal_reply:     string
  score:           number
  created_at:      string
}
