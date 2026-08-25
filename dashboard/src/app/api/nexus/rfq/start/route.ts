/**
 * POST /api/nexus/rfq/start   (manual trigger — employee-invoked)
 *
 * The escape hatch for when auto-detection misses an RFQ. The employee has
 * already decided this thread IS a quotation request, so there is NO confidence
 * gate. Two modes:
 *   • { thread_id, message_id?, suggest: true }        → Gemini extracts candidate
 *       product lines + insured name. NO writes. Powers the modal's pre-select.
 *   • { thread_id, message_id?, product_lines[], insured_name? } → opens ONE case,
 *       links the client thread, stores one rfq_requests row per chosen line.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logGeminiUsage }            from '@/lib/gemini-usage'
import { logRfqEvent }               from '@/lib/rfq-log'
import { logError }                  from '@/lib/error-log'
import { PRODUCT_LINES, isValidProductLine, productLineLabel } from '@/lib/product-lines'

const SB_URL     = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// Resolve the client message + insured name for a thread.
async function loadContext(thread_id: string, message_id?: string) {
  // Message: the given one, else the latest inbound on the thread.
  const msgUrl = message_id
    ? `${SB_URL}/rest/v1/email_messages?id=eq.${message_id}&select=id,subject,body_text&limit=1`
    : `${SB_URL}/rest/v1/email_messages?thread_id=eq.${thread_id}&direction=eq.inbound&order=sent_at.desc&select=id,subject,body_text&limit=1`
  const mRes = await fetch(msgUrl, { headers: sbH(), cache: 'no-store' })
  const msg  = mRes.ok ? (await mRes.json())[0] : null

  let insured: string | null = null
  const tRes = await fetch(
    `${SB_URL}/rest/v1/email_threads?id=eq.${thread_id}&select=contact_id&limit=1`,
    { headers: sbH(), cache: 'no-store' }
  )
  const contactId = tRes.ok ? (await tRes.json())[0]?.contact_id : null
  if (contactId) {
    const cRes = await fetch(
      `${SB_URL}/rest/v1/contacts?id=eq.${contactId}&select=first_name,last_name,company&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const c = cRes.ok ? (await cRes.json())[0] : null
    if (c) insured = c.company || [c.first_name, c.last_name].filter(Boolean).join(' ') || null
  }
  return { msg, insured }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as {
      thread_id?: string; message_id?: string; suggest?: boolean
      product_lines?: string[]; insured_name?: string
    }
    if (!body.thread_id) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })

    const { msg, insured } = await loadContext(body.thread_id, body.message_id)

    // ── Suggest mode: extract candidate lines, write nothing ──────────────────
    if (body.suggest) {
      const apiKey = process.env.GEMINI_API_KEY_EMAIL_ANALYSIS
      let suggested: { product_line: string; summary: string }[] = []
      if (apiKey && msg?.body_text) {
        const lines = PRODUCT_LINES.map(p => `- ${p.slug}: ${p.label}`).join('\n')
        const prompt = `A broker at Trade Risk Solutions has flagged this email as a quotation request. Extract each distinct line of insurance being requested and map each to one of these product-line slugs (closest fit):
${lines}

Return ONLY JSON: { "requests": [ { "product_line": "<slug>", "summary": "<short description>" } ] }

Subject: ${msg.subject || '(none)'}

Body:
${String(msg.body_text).slice(0, 12000)}`
        const gRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
        })
        if (gRes.ok) {
          const data = await gRes.json()
          if (data?.usageMetadata) logGeminiUsage('email_analysis', data.usageMetadata, body.thread_id).catch(() => {})
          const raw = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
          try {
            const parsed = JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) as { requests?: { product_line: string; summary: string }[] }
            suggested = (parsed.requests ?? []).filter(r => r.product_line && isValidProductLine(r.product_line))
          } catch { /* best-effort */ }
        } else {
          void logError({ source: 'gemini', feature: 'rfq_start_suggest', statusCode: gRes.status, message: await gRes.text(), threadId: body.thread_id })
        }
      }
      return NextResponse.json({ suggested_lines: suggested, insured_name: insured })
    }

    // ── Create mode: build the case + request lines from the chosen lines ─────
    const chosen = (body.product_lines ?? []).filter(isValidProductLine)
    if (chosen.length === 0) return NextResponse.json({ error: 'Pick at least one product line' }, { status: 400 })

    const insuredName = (body.insured_name?.trim() || insured || 'New client').slice(0, 120)

    // ONE case per line of insurance (Jane's Cyber and D&O are separate cases).
    const caseIds: string[] = []
    for (const product_line of chosen) {
      const lineLabel = productLineLabel(product_line)

      // Idempotency per (message × line): reuse the existing per-line case.
      if (msg?.id) {
        const dupRes = await fetch(
          `${SB_URL}/rest/v1/rfq_requests?client_message_id=eq.${msg.id}&product_line=eq.${encodeURIComponent(product_line)}&select=case_id&limit=1`,
          { headers: sbH(), cache: 'no-store' }
        )
        const dup = dupRes.ok ? (await dupRes.json())[0] : null
        if (dup?.case_id) { caseIds.push(dup.case_id); continue }
      }

      const caseRes = await fetch(`${SB_URL}/rest/v1/cases`, {
        method:  'POST',
        headers: sbH('return=representation'),
        body: JSON.stringify({
          name:        `[RFQ] ${insuredName} — ${lineLabel}`,
          description: 'Quotation request.',
          status:      'open',
        }),
      })
      if (!caseRes.ok) return NextResponse.json({ error: `case create failed: ${await caseRes.text()}` }, { status: 500 })
      const caseId = (await caseRes.json())[0].id as string
      caseIds.push(caseId)

      await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
        method:  'POST',
        headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ case_id: caseId, thread_id: body.thread_id, party_type: 'client', party_label: insuredName }),
      })

      const reqRes = await fetch(`${SB_URL}/rest/v1/rfq_requests`, {
        method:  'POST',
        headers: sbH('return=representation'),
        body: JSON.stringify({
          case_id:           caseId,
          client_thread_id:  body.thread_id,
          client_message_id: msg?.id ?? null,
          product_line,
          insured_name:      insuredName,
        }),
      })
      const created = reqRes.ok ? (await reqRes.json())[0] : null
      if (created?.id) void logRfqEvent({ event_type: 'requested', case_id: caseId, rfq_request_id: created.id, actor: user.email ?? null, summary: `Quotation requested — ${lineLabel}`, detail: { insured: insuredName } })
    }

    // Route the modal to the first case; caller can see the rest in Nexus.
    return NextResponse.json({ case_id: caseIds[0] ?? null, case_ids: caseIds, requests: chosen.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
