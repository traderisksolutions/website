/**
 * POST /api/nexus/rfq/detect   (internal hook — called by /api/email/ingest)
 * Body: { thread_id, message_id }
 *
 * Classifies an inbound email as a Request for Quotation and, on a hit, extracts
 * each requested line of insurance. Opens ONE Nexus case for the client, links the
 * client thread, and stores one rfq_requests row per line. Idempotent per message.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logGeminiUsage }            from '@/lib/gemini-usage'
import { PRODUCT_LINES, isValidProductLine } from '@/lib/product-lines'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const MIN_CONFIDENCE = 0.6

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type ExtractedRequest = { product_line: string; summary: string; key_details: string }
type Classification   = { is_rfq: boolean; confidence: number; insured_name: string; requests: ExtractedRequest[] }

async function classify(subject: string, body: string, apiKey: string, threadId: string): Promise<Classification | null> {
  const lines = PRODUCT_LINES.map(p => `- ${p.slug}: ${p.label}`).join('\n')
  const prompt = `You are the intake classifier for Trade Risk Solutions, a corporate insurance broker in Singapore.

Decide whether the inbound email below is a Request for Quotation (RFQ) — a prospective or existing client asking us to obtain insurance quotes or arrange cover. Marketing, newsletters, internal chatter, claims updates, and generic questions are NOT RFQs.

If it IS an RFQ, extract each DISTINCT line of insurance requested. Map every line to exactly one of these product-line slugs (use the closest fit):
${lines}

Return ONLY JSON of this shape:
{
  "is_rfq": boolean,
  "confidence": number,              // 0-1, your confidence it is an RFQ
  "insured_name": string,            // the company or person seeking cover ("" if unknown)
  "requests": [                      // one entry per distinct line; [] if not an RFQ
    { "product_line": "<slug>", "summary": "<short line description>", "key_details": "<sums insured, headcount, addresses, or other specifics mentioned>" }
  ]
}

Subject: ${subject || '(none)'}

Body:
${body.slice(0, 12000)}`

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) { console.error('[rfq:detect] gemini error', await res.text()); return null }
  const data = await res.json()

  if (data?.usageMetadata) logGeminiUsage('email_analysis', data.usageMetadata, threadId).catch(() => {})

  const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  if (!raw) return null
  try {
    // responseMimeType keeps it clean, but strip fences defensively.
    const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    return JSON.parse(json) as Classification
  } catch (e) {
    console.error('[rfq:detect] JSON parse failed:', e, raw.slice(0, 300))
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get('x-internal-secret') !== (process.env.CRON_SECRET ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { thread_id, message_id } = await req.json() as { thread_id?: string; message_id?: string }
    if (!thread_id || !message_id) return NextResponse.json({ error: 'thread_id and message_id required' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY_EMAIL_ANALYSIS not set' }, { status: 500 })

    // Idempotency: skip if this message already produced requests.
    const dupRes = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?client_message_id=eq.${message_id}&select=id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const dups = dupRes.ok ? await dupRes.json() : []
    if (Array.isArray(dups) && dups.length > 0) return NextResponse.json({ skipped: 'already processed' })

    // Load the message.
    const msgRes = await fetch(
      `${SB_URL}/rest/v1/email_messages?id=eq.${message_id}&select=subject,body_text,direction&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const msgs = msgRes.ok ? await msgRes.json() : []
    const msg  = Array.isArray(msgs) ? msgs[0] : null
    if (!msg)                        return NextResponse.json({ error: 'message not found' }, { status: 404 })
    if (msg.direction !== 'inbound') return NextResponse.json({ skipped: 'not inbound' })

    // Resolve the insured (client) name via the thread's contact.
    let contactName: string | null = null
    const thrRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}&select=subject,contact_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const thr = thrRes.ok ? (await thrRes.json())[0] : null
    if (thr?.contact_id) {
      const cRes = await fetch(
        `${SB_URL}/rest/v1/contacts?id=eq.${thr.contact_id}&select=first_name,last_name,company&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const c = cRes.ok ? (await cRes.json())[0] : null
      if (c) contactName = c.company || [c.first_name, c.last_name].filter(Boolean).join(' ') || null
    }

    const result = await classify(msg.subject ?? '', msg.body_text ?? '', apiKey, thread_id)
    if (!result) return NextResponse.json({ error: 'classification failed' }, { status: 502 })

    const valid = (result.requests ?? []).filter(r => r.product_line && isValidProductLine(r.product_line))
    if (!result.is_rfq || result.confidence < MIN_CONFIDENCE || valid.length === 0) {
      return NextResponse.json({ is_rfq: false, confidence: result.confidence })
    }

    const insured = (result.insured_name?.trim() || contactName || 'New client').slice(0, 120)

    // 1. Open one case for this RFQ.
    const caseRes = await fetch(`${SB_URL}/rest/v1/cases`, {
      method:  'POST',
      headers: sbH('return=representation'),
      body: JSON.stringify({
        name:        `RFQ — ${insured}`,
        description: `Auto-detected quotation request (${valid.length} line${valid.length === 1 ? '' : 's'}).`,
        status:      'open',
      }),
    })
    if (!caseRes.ok) return NextResponse.json({ error: `case create failed: ${await caseRes.text()}` }, { status: 500 })
    const caseRow = (await caseRes.json())[0]
    const caseId  = caseRow.id as string

    // 2. Link the client thread to the case.
    await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
      method:  'POST',
      headers: sbH('return=minimal,resolution=merge-duplicates'),
      body: JSON.stringify({ case_id: caseId, thread_id, party_type: 'client', party_label: insured }),
    })

    // 3. Store one request row per extracted line.
    const rows = valid.map(r => ({
      case_id:           caseId,
      client_thread_id:  thread_id,
      client_message_id: message_id,
      product_line:      r.product_line,
      insured_name:      insured,
      summary:           r.summary?.slice(0, 500) ?? null,
      key_details:       r.key_details?.slice(0, 2000) ?? null,
    }))
    await fetch(`${SB_URL}/rest/v1/rfq_requests`, {
      method:  'POST',
      headers: sbH('return=minimal'),
      body:    JSON.stringify(rows),
    })

    return NextResponse.json({ is_rfq: true, case_id: caseId, requests: valid.length })
  } catch (e) {
    console.error('[rfq:detect] fatal', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
