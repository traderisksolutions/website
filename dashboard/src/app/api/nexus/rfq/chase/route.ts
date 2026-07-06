/**
 * POST /api/nexus/rfq/chase   Body: { dispatch_id }
 *
 * Manual SLA follow-up: sends a short chaser to an insurer that hasn't replied
 * to an RFQ. On the original thread when known, otherwise a fresh email. Manual
 * only — there is no auto-chase.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logGeminiUsage }            from '@/lib/gemini-usage'
import { productLineLabel }          from '@/lib/product-lines'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function POST(req: NextRequest) {
  try {
    const { dispatch_id } = await req.json() as { dispatch_id?: string }
    if (!dispatch_id) return NextResponse.json({ error: 'dispatch_id required' }, { status: 400 })

    const dRes = await fetch(
      `${SB_URL}/rest/v1/rfq_dispatches?id=eq.${dispatch_id}&select=to_email,insurer_name,product_line,thread_id,rfq_request_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const d = dRes.ok ? (await dRes.json())[0] : null
    if (!d?.to_email) return NextResponse.json({ error: 'dispatch not found' }, { status: 404 })

    // Insured name for context.
    let insured = 'our client'
    if (d.rfq_request_id) {
      const rRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${d.rfq_request_id}&select=insured_name&limit=1`, { headers: sbH(), cache: 'no-store' })
      insured = (rRes.ok ? (await rRes.json())[0]?.insured_name : null) || insured
    }
    const lineLabel = productLineLabel(d.product_line ?? '')

    // Short chaser body (Gemini) with a safe fallback.
    let body = `Dear ${d.insurer_name ?? 'team'},\n\nFollowing up on our quotation request for ${lineLabel} cover for ${insured}. Could you share your terms, or let us know if you need anything further to quote?\n\nThank you.`
    const apiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (apiKey) {
      const prompt = `Write a brief, polite follow-up chaser from a Trade Risk Solutions broker to ${d.insurer_name ?? 'an insurer'} about a pending quotation request for ${lineLabel} cover for ${insured}. 2-3 sentences. Singapore business English. No filler, no sign-off block. Return ONLY JSON: { "body": "..." }`
      const g = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }),
      })
      if (g.ok) {
        const data = await g.json()
        if (data?.usageMetadata) logGeminiUsage('draft_email', data.usageMetadata).catch(() => {})
        const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
        try { const p = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); if (p.body) body = p.body } catch { /* keep fallback */ }
      }
    }

    // Resolve DB thread_id → so send threads the chaser onto the original conversation.
    const origin = new URL(req.url).origin
    const draftRes = await fetch(`${origin}/api/nexus/draft-create`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({ thread_id: d.thread_id ?? null, body, email_type: 'RFQ_CHASE', to_email: d.to_email }),
    })
    const draftData = await draftRes.json()
    if (!draftRes.ok || !draftData.draftId) return NextResponse.json({ error: draftData.error || 'draft failed' }, { status: 500 })

    const sendRes = await fetch(`${origin}/api/email/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        draftId:       draftData.draftId,
        toEmail:       d.to_email,
        customSubject: `Following up — quotation request (${lineLabel}) — ${insured}`,
      }),
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) return NextResponse.json({ error: sendData.error || 'send failed' }, { status: 500 })

    // Bump updated_at so the "waiting Nd" clock resets from the chase.
    await fetch(`${SB_URL}/rest/v1/rfq_dispatches?id=eq.${dispatch_id}`, {
      method:  'PATCH',
      headers: { ...sbH(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ updated_at: new Date().toISOString() }),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
