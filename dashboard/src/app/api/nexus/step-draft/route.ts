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
import { logError }                  from '@/lib/error-log'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// Case-insensitive resolution of the recipient's most recent engagement thread.
async function resolveThreadForEmail(email: string): Promise<string | null> {
  const e = email.trim()
  if (!e) return null
  // ilike (no wildcards) = case-insensitive exact match.
  const pat = encodeURIComponent(e)
  // 1. As a participant (from/to/cc) on any thread.
  const p = await fetch(`${SB_URL}/rest/v1/email_participants?email=ilike.${pat}&select=thread_id&limit=1`, { headers: sbH(), cache: 'no-store' })
  const pid = p.ok ? (await p.json())[0]?.thread_id : null
  if (pid) return pid
  // 2. As a message sender (older threads may predate email_participants).
  const m = await fetch(`${SB_URL}/rest/v1/email_messages?from_address=ilike.${pat}&deleted_at=is.null&select=thread_id&order=sent_at.desc&limit=1`, { headers: sbH(), cache: 'no-store' })
  const mid = m.ok ? (await m.json())[0]?.thread_id : null
  if (mid) return mid
  // 3. As the thread's contact.
  const t = await fetch(`${SB_URL}/rest/v1/email_threads?contact.email=ilike.${pat}&deleted_at=is.null&select=id,contact:contacts!inner(email)&limit=1`, { headers: sbH(), cache: 'no-store' })
  const tid = t.ok ? (await t.json())[0]?.id : null
  return tid ?? null
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

    // Resolve the recipient's existing engagement thread. Match CASE-INSENSITIVELY
    // (stored addresses keep their original casing, e.g. "Josephine.wee@…") and
    // fall back to the message from-address so an existing thread is always found.
    const threadId = await resolveThreadForEmail(to_email)

    // Close the round-trip: attach this party's thread to the case so their
    // replies flow back into Nexus and the "new replies" bell fires for them too.
    if (case_id && threadId) {
      await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
        method: 'POST',
        headers: { ...sbH(), Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ case_id, thread_id: threadId, party_type: party_type ?? 'other', party_label: to_email }),
      }).catch(() => {})
    }

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
    if (!gRes.ok) {
      const errText = await gRes.text()
      void logError({ source: 'gemini', feature: 'nexus_step_draft', statusCode: gRes.status, message: errText, resourceType: 'nexus_case', resourceId: case_id })
      return NextResponse.json({ error: `gemini error: ${errText}` }, { status: 502 })
    }
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
