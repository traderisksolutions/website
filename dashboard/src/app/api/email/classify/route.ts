/**
 * POST /api/email/classify   Body: { thread_id, message_id }
 *
 * Internal, fire-and-forget inbox triage. Classifies a thread into
 * rfq | claim | renewal | general | other and stores it on email_threads for a
 * badge. Badge only — no drafting, no case, no send. Always 200.
 */
import { NextRequest, NextResponse } from 'next/server'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'

const CATEGORIES = ['rfq', 'claim', 'renewal', 'general', 'other'] as const

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('x-internal-secret') !== (process.env.CRON_SECRET ?? '')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { thread_id, message_id } = await req.json().catch(() => ({})) as { thread_id?: string; message_id?: string }
    if (!thread_id) return NextResponse.json({ ok: true, skipped: 'no thread_id' })

    const apiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
    if (!apiKey) return NextResponse.json({ ok: true, skipped: 'no key' })

    // Subject + latest inbound body for context.
    const mUrl = message_id
      ? `${SB_URL}/rest/v1/email_messages?id=eq.${message_id}&select=subject,body_text&limit=1`
      : `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&direction=eq.inbound&order=sent_at.desc&select=subject,body_text&limit=1`
    const mRes = await fetch(mUrl, { headers: sbH(), cache: 'no-store' })
    const msg  = mRes.ok ? (await mRes.json())[0] : null
    const text = `${msg?.subject ?? ''}\n\n${(msg?.body_text ?? '').slice(0, 4000)}`.trim()
    if (!text) return NextResponse.json({ ok: true, skipped: 'no content' })

    const prompt = `Classify this inbound email to a Singapore insurance broker into exactly ONE category:
- "rfq": a request to obtain / quote insurance cover (new or additional).
- "claim": something about an incident, loss, damage, or an existing claim.
- "renewal": renewing / reviewing an existing policy near expiry.
- "general": admin, endorsements, questions, scheduling — brokerage business but none of the above.
- "other": newsletters, spam, or clearly unrelated.

Return ONLY JSON: { "category": "<one>", "confidence": <0..1> }

Email:
${text}`

    const gRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    })
    if (!gRes.ok) return NextResponse.json({ ok: true, skipped: 'gemini error' })
    const data = await gRes.json()
    const raw  = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    let parsed: { category?: string; confidence?: number }
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) } catch { return NextResponse.json({ ok: true, skipped: 'unparseable' }) }

    const category = (CATEGORIES as readonly string[]).includes(parsed.category ?? '') ? parsed.category : 'other'
    await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}`, {
      method:  'PATCH',
      headers: sbH(),
      body:    JSON.stringify({ category, category_confidence: parsed.confidence ?? null, categorized_at: new Date().toISOString() }),
    }).catch(() => {})

    return NextResponse.json({ ok: true, category })
  } catch (e) {
    return NextResponse.json({ ok: true, error: String(e) })
  }
}
