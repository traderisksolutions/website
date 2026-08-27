/**
 * POST /api/nexus/rfq/materialize
 * Body: { thread_id, insured_name, product_line, contact_id, ai_draft_id?, gmail_thread_id? }
 *
 * The "Nexus file is born on the first send" heart. Called right after an insurer
 * email is sent from Engagement. Lazily, idempotently:
 *   1. get-or-create the Nexus case for this client thread
 *   2. get-or-create the request line (case × product_line)
 *   3. record the dispatch (who we sent to)
 * Returns { case_id, request_id, dispatch }. Later sends attach to the same file.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logActivity }               from '@/lib/log-activity'
import { logRfqEvent }               from '@/lib/rfq-log'
import { productLineLabel }          from '@/lib/product-lines'
import { requireStaffOrCron }        from '@/lib/api-auth'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { thread_id, insured_name, product_line, contact_id, ai_draft_id, gmail_thread_id } =
      await req.json() as {
        thread_id?: string; insured_name?: string; product_line?: string
        contact_id?: string; ai_draft_id?: string; gmail_thread_id?: string
      }
    if (!thread_id || !product_line || !contact_id) {
      return NextResponse.json({ error: 'thread_id, product_line and contact_id required' }, { status: 400 })
    }
    const insured   = (insured_name?.trim() || 'New client').slice(0, 120)
    const lineLabel = productLineLabel(product_line)

    // ONE Nexus case per (client thread × line of insurance). Jane's Cyber and D&O
    // become two separate cases/rows, each its own quote comparison.
    let caseId: string | null = null
    let requestId: string | null = null
    const reqExist = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?client_thread_id=eq.${thread_id}&product_line=eq.${encodeURIComponent(product_line)}&select=id,case_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const existing = reqExist.ok ? (await reqExist.json())[0] : null
    if (existing) { caseId = existing.case_id; requestId = existing.id }

    if (!caseId) {
      const caseRes = await fetch(`${SB_URL}/rest/v1/cases`, {
        method:  'POST',
        headers: sbH('return=representation'),
        body: JSON.stringify({ name: `[RFQ] ${insured} — ${lineLabel}`, description: 'Quotation request (opened on first send).', status: 'open' }),
      })
      if (!caseRes.ok) return NextResponse.json({ error: `case create failed: ${await caseRes.text()}` }, { status: 500 })
      caseId = (await caseRes.json())[0].id as string

      // Link the client thread to the new file.
      await fetch(`${SB_URL}/rest/v1/case_threads?on_conflict=case_id,thread_id`, {
        method:  'POST',
        headers: sbH('return=minimal,resolution=merge-duplicates'),
        body: JSON.stringify({ case_id: caseId, thread_id, party_type: 'client', party_label: insured }),
      })
      void logActivity({ action: 'rfq.file_opened', resource_type: 'case', resource_id: caseId, new_value: { insured, thread_id, product_line } })
    }

    if (!requestId) {
      const reqRes = await fetch(`${SB_URL}/rest/v1/rfq_requests`, {
        method:  'POST',
        headers: sbH('return=representation'),
        body: JSON.stringify({ case_id: caseId, client_thread_id: thread_id, product_line, insured_name: insured, status: 'dispatched' }),
      })
      if (!reqRes.ok) return NextResponse.json({ error: `request create failed: ${await reqRes.text()}` }, { status: 500 })
      requestId = (await reqRes.json())[0].id as string
      void logRfqEvent({ event_type: 'requested', case_id: caseId, rfq_request_id: requestId, summary: `Quotation requested — ${lineLabel}`, detail: { insured } })
    }

    // 3. record the dispatch (snapshot insurer identity).
    const cRes = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?id=eq.${contact_id}&select=product_line,contacts(email),insurers(name)&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const contactRow = cRes.ok ? (await cRes.json())[0] : null
    const contact = contactRow ? { insurers: contactRow.insurers, contact_email: contactRow.contacts?.email ?? null } : null

    const dRes = await fetch(`${SB_URL}/rest/v1/rfq_dispatches`, {
      method:  'POST',
      headers: sbH('return=representation'),
      body: JSON.stringify({
        rfq_request_id:     requestId,
        insurer_contact_id: contact_id,
        insurer_name:       contact?.insurers?.name ?? null,
        product_line,
        to_email:           contact?.contact_email ?? null,
        ai_draft_id:        ai_draft_id ?? null,
        gmail_thread_id:    gmail_thread_id ?? null,
        status:             'sent',
      }),
    })
    const dispatch = dRes.ok ? (await dRes.json())[0] : null

    void logActivity({
      action:        'rfq.dispatched',
      resource_type: 'rfq_dispatch',
      resource_id:   dispatch?.id,
      lead_email:    contact?.contact_email ?? undefined,
      new_value:     { insurer: contact?.insurers?.name ?? null, product_line, case_id: caseId },
    })
    void logRfqEvent({
      event_type: 'dispatched', case_id: caseId, rfq_request_id: requestId, dispatch_id: dispatch?.id,
      insurer_name: contact?.insurers?.name ?? null, summary: `RFQ dispatched to ${contact?.insurers?.name ?? contact?.contact_email ?? 'insurer'} — ${productLineLabel(product_line)}`,
    })

    return NextResponse.json({ case_id: caseId, request_id: requestId, dispatch })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
