/**
 * POST /api/nexus/rfq/quotes   Body: { case_id }
 *
 * For each insurer that has REPLIED to an RFQ on this case, reads their latest
 * inbound message and AI-extracts the quote (premium, excess, key terms) so the
 * broker can compare side by side. On-demand (button-triggered) — no writes.
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

type Quote = {
  insurer_name: string; product_line: string
  premium: string | null; excess: string | null; key_terms: string[]; validity: string | null; summary: string | null
}

async function extractQuote(text: string, apiKey: string): Promise<Partial<Quote>> {
  const prompt = `An insurer has replied to a request for quotation. Extract the quote details from their email. Return ONLY JSON:
{ "premium": "<annual premium incl. currency, or null>", "excess": "<excess/deductible, or null>", "key_terms": ["<notable term, sub-limit, or exclusion>"], "validity": "<quote validity/expiry, or null>", "summary": "<one-line summary of the offer>" }

Email:
${text.slice(0, 8000)}`
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
  })
  if (!res.ok) return {}
  const data = await res.json()
  if (data?.usageMetadata) logGeminiUsage('email_analysis', data.usageMetadata).catch(() => {})
  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  try { return JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) } catch { return {} }
}

export async function POST(req: NextRequest) {
  try {
    const { case_id } = await req.json() as { case_id?: string }
    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_EMAIL_ANALYSIS not set' }, { status: 500 })

    // Request ids for this case → replied dispatches with a linked thread.
    const rRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?case_id=eq.${case_id}&select=id`, { headers: sbH(), cache: 'no-store' })
    const reqIds = (rRes.ok ? await rRes.json() : []).map((r: { id: string }) => r.id)
    if (reqIds.length === 0) return NextResponse.json([])

    const dRes = await fetch(
      `${SB_URL}/rest/v1/rfq_dispatches?rfq_request_id=in.(${reqIds.join(',')})&status=eq.replied&thread_id=not.is.null&select=insurer_name,product_line,thread_id`,
      { headers: sbH(), cache: 'no-store' }
    )
    const dispatches: { insurer_name: string | null; product_line: string | null; thread_id: string }[] = dRes.ok ? await dRes.json() : []

    const quotes = await Promise.all(dispatches.map(async d => {
      const mRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?thread_id=eq.${d.thread_id}&direction=eq.inbound&order=sent_at.desc&select=body_text&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const body = mRes.ok ? (await mRes.json())[0]?.body_text : null
      const extracted = body ? await extractQuote(String(body), apiKey) : {}
      return {
        insurer_name: d.insurer_name ?? 'Insurer',
        product_line: productLineLabel(d.product_line ?? ''),
        premium:   extracted.premium   ?? null,
        excess:    extracted.excess    ?? null,
        key_terms: Array.isArray(extracted.key_terms) ? extracted.key_terms : [],
        validity:  extracted.validity  ?? null,
        summary:   extracted.summary   ?? null,
      } as Quote
    }))

    return NextResponse.json(quotes)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
