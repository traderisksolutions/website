/**
 * POST /api/nexus/step-draft
 * Body: { case_id?, action, rationale?, party_type?, to_email }
 *
 * A roadmap step (Opus's decision) → a fresh Gemini-drafted reply. Also resolves
 * the recipient's existing engagement thread so the caller can open it there
 * (or fall back to a fresh compose if none exists).
 * Returns { subject, body, to_email, thread_id | null }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logGeminiUsage }            from '@/lib/gemini-usage'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function POST(req: NextRequest) {
  try {
    const { case_id, action, rationale, party_type, to_email } = await req.json() as {
      case_id?: string; action?: string; rationale?: string; party_type?: string; to_email?: string
    }
    if (!action || !to_email) return NextResponse.json({ error: 'action and to_email required' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    // Case brief for grounding (from the latest stored analysis).
    let caseBrief: unknown = null
    if (case_id) {
      const aRes = await fetch(
        `${SB_URL}/rest/v1/case_analyses?case_id=eq.${case_id}&order=created_at.desc&select=structured_analysis&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const a = aRes.ok ? (await aRes.json())[0] : null
      caseBrief = a?.structured_analysis?.case_brief ?? null
    }

    // Resolve the recipient's existing engagement thread (if any).
    let threadId: string | null = null
    const pRes = await fetch(
      `${SB_URL}/rest/v1/email_participants?email=eq.${encodeURIComponent(to_email.toLowerCase())}&select=thread_id&order=thread_id.asc&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    threadId = pRes.ok ? ((await pRes.json())[0]?.thread_id ?? null) : null

    const prompt = `You are a broker at Trade Risk Solutions (TRS), a Singapore insurance broker. A senior strategist has decided on this next action; write the email that carries it out.

Action to accomplish: ${action}
${rationale ? `Why now: ${rationale}` : ''}
Recipient: ${to_email}${party_type ? ` (${party_type})` : ''}
${caseBrief ? `Case context (for grounding only):\n${JSON.stringify(caseBrief, null, 2)}` : ''}

Write a concise, professional email that achieves the action. Singapore business English. Lead with the point. Do not invent facts beyond the context. No generic filler, no sign-off block (a signature is appended). Return ONLY JSON: { "subject": "...", "body": "..." }`

    const gRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }),
    })
    if (!gRes.ok) return NextResponse.json({ error: `gemini error: ${await gRes.text()}` }, { status: 502 })
    const data = await gRes.json()
    if (data?.usageMetadata) logGeminiUsage('draft_email', data.usageMetadata).catch(() => {})
    const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    let parsed: { subject?: string; body?: string }
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) }
    catch { return NextResponse.json({ error: 'could not parse draft' }, { status: 502 }) }

    return NextResponse.json({
      subject:   parsed.subject?.trim() || `Re: ${action}`.slice(0, 120),
      body:      parsed.body?.trim() || '',
      to_email,
      thread_id: threadId,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
