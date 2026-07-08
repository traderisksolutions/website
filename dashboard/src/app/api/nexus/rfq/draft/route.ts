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
    // Accept EITHER a persisted request (rfq_request_id) OR a staged line
    // (product_line + insured_name) so drafting works before a case exists.
    const { rfq_request_id, contact_id, product_line, insured_name, client_message_id } =
      await req.json() as {
        rfq_request_id?: string; contact_id?: string
        product_line?: string; insured_name?: string; client_message_id?: string
      }
    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })
    if (!rfq_request_id && !product_line) return NextResponse.json({ error: 'rfq_request_id or product_line required' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY_DRAFT_EMAIL
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_DRAFT_EMAIL not set' }, { status: 500 })

    // Resolve the request line — from the persisted row, or from the staged fields.
    let rfq: { product_line: string; insured_name: string | null; summary: string | null; key_details: string | null; client_message_id: string | null }
    if (rfq_request_id) {
      const rRes = await fetch(
        `${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}&select=product_line,insured_name,summary,key_details,client_message_id&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const row = rRes.ok ? (await rRes.json())[0] : null
      if (!row) return NextResponse.json({ error: 'request not found' }, { status: 404 })
      rfq = row
    } else {
      rfq = { product_line: product_line!, insured_name: insured_name ?? null, summary: null, key_details: null, client_message_id: client_message_id ?? null }
    }

    // Load the insurer contact.
    const cRes = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?id=eq.${contact_id}&select=contacts(first_name,last_name,email),insurers(name)&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const contactRow = cRes.ok ? (await cRes.json())[0] : null
    const contact = contactRow ? { contact_name: [contactRow.contacts?.first_name, contactRow.contacts?.last_name].filter(Boolean).join(' ') || null, contact_email: contactRow.contacts?.email ?? null, insurers: contactRow.insurers } : null
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

    // House master template (Settings → RFQ Email Template) — the AI uses it as a
    // style/structure reference, filling placeholders and adapting nuance.
    let templateBlock = ''
    try {
      const tRes = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.rfq_email_template&limit=1`, { headers: sbH(), cache: 'no-store' })
      const tRow = tRes.ok ? (await tRes.json())[0] : null
      if (tRow?.value) {
        const t = JSON.parse(tRow.value) as { subject?: string; body?: string }
        if (t?.subject || t?.body) {
          templateBlock = `\nHOUSE MASTER TEMPLATE — follow this closely for tone, structure and wording. Fill the {placeholders} from the facts below and adapt nuance for this specific insurer; omit any sentence whose information is missing (e.g. no deadline). Do NOT copy the sign-off/signature — that is appended automatically.
Subject template: ${t.subject || '(none)'}
Body template:
"""
${t.body || '(none)'}
"""
Placeholder map: {insured}=client name, {product_line}=line of insurance, {insurer_name}=insurer, {contact_name}=insurer contact, {key_details}=details captured, {deadline}=response deadline if any, {broker_name}=omit (signature appended).\n`
        }
      }
    } catch { /* fall back to plain guidance if template missing/unparseable */ }

    // Self-improvement loop: learned guidance synthesised from how employees edited
    // past RFQ drafts (Settings → Evals feed prompt_overrides for RFQ_INSURER).
    let overrideBlock = ''
    try {
      const oRes = await fetch(`${SB_URL}/rest/v1/prompt_overrides?email_type=eq.RFQ_INSURER&order=synthesized_at.desc&limit=1&select=override_text`, { headers: sbH(), cache: 'no-store' })
      const oTxt = oRes.ok ? (await oRes.json())[0]?.override_text : null
      if (oTxt) overrideBlock = `\nLEARNED IMPROVEMENTS (from how our brokers edited past RFQ drafts — apply these):\n${oTxt}\n`
    } catch { /* optional */ }

    const lineLabel = productLineLabel(rfq.product_line)
    const prompt = `You are a broker at Trade Risk Solutions (TRS), a corporate insurance broker in Singapore. Write a concise, professional email to ${contact.contact_name || insurerName} at ${insurerName} requesting a quotation on behalf of our client.

Line of insurance: ${lineLabel}
Client / insured: ${rfq.insured_name || 'our client'}
Request summary: ${rfq.summary || '(see details)'}
Key details provided: ${rfq.key_details || '(none captured — ask for what you need)'}

${clientContext ? `For context, the client's original message:\n"""${clientContext}"""\n` : ''}${templateBlock}${overrideBlock}
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
