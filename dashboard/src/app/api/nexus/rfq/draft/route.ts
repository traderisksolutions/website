/**
 * POST /api/nexus/rfq/draft
 * Body: { rfq_request_id, contact_id }
 *
 * Generates a personalized RFQ email from TRS (broker) to one insurer contact for
 * a single request line. Returns { subject, body, to_email, insurer_name } — the
 * Nexus panel then reviews and sends it via the existing draft-create + email/send.
 * No DB writes here; dispatch is recorded on send via /api/nexus/rfq/dispatch.
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
    const { rfq_request_id, contact_id } = await req.json() as { rfq_request_id?: string; contact_id?: string }
    if (!rfq_request_id || !contact_id) return NextResponse.json({ error: 'rfq_request_id and contact_id required' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    // Load the request line.
    const rRes = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}&select=product_line,insured_name,summary,key_details,client_message_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rfq = rRes.ok ? (await rRes.json())[0] : null
    if (!rfq) return NextResponse.json({ error: 'request not found' }, { status: 404 })

    // Load the insurer contact.
    const cRes = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?id=eq.${contact_id}&select=contact_name,contact_email,insurers(name)&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const contact = cRes.ok ? (await cRes.json())[0] : null
    if (!contact?.contact_email) return NextResponse.json({ error: 'insurer contact not found' }, { status: 404 })
    const insurerName = contact.insurers?.name ?? 'your team'

    // Optional: original client email for extra context.
    let clientContext = ''
    if (rfq.client_message_id) {
      const mRes = await fetch(
        `${SB_URL}/rest/v1/email_messages?id=eq.${rfq.client_message_id}&select=body_text&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const m = mRes.ok ? (await mRes.json())[0] : null
      if (m?.body_text) clientContext = String(m.body_text).slice(0, 4000)
    }

    const lineLabel = productLineLabel(rfq.product_line)
    const prompt = `You are a broker at Trade Risk Solutions (TRS), a corporate insurance broker in Singapore. Write a concise, professional email to ${contact.contact_name || insurerName} at ${insurerName} requesting a quotation on behalf of our client.

Line of insurance: ${lineLabel}
Client / insured: ${rfq.insured_name || 'our client'}
Request summary: ${rfq.summary || '(see details)'}
Key details provided: ${rfq.key_details || '(none captured — ask for what you need)'}

${clientContext ? `For context, the client's original message:\n"""${clientContext}"""\n` : ''}
Guidance:
- Address the insurer contact by name if given.
- State clearly that we are seeking terms/a quotation for the line above for the named client.
- Include the key details we have; where information is missing, politely ask for what the insurer needs to quote.
- Keep it to a few short paragraphs. Professional broker-to-underwriter tone.
- Do NOT invent facts, premiums, or coverage figures not provided.
- Do NOT include a signature or sign-off block (it is appended automatically).

Return ONLY JSON: { "subject": "<email subject>", "body": "<plain-text email body>" }`

    const gRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    })
    if (!gRes.ok) return NextResponse.json({ error: `gemini error: ${await gRes.text()}` }, { status: 502 })
    const data = await gRes.json()
    if (data?.usageMetadata) logGeminiUsage('draft_email', data.usageMetadata).catch(() => {})

    const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    let parsed: { subject?: string; body?: string }
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim())
    } catch {
      return NextResponse.json({ error: 'could not parse draft' }, { status: 502 })
    }

    return NextResponse.json({
      subject:      parsed.subject?.trim() || `Quotation request — ${lineLabel} — ${rfq.insured_name || 'client'}`,
      body:         parsed.body?.trim() || '',
      to_email:     contact.contact_email,
      insurer_name: insurerName,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
