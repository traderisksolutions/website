/**
 * POST /api/nexus/rfq/dispatch
 * Body: { rfq_request_id, contact_id, ai_draft_id? }
 *
 * Records that a request line's RFQ was sent to an insurer contact. Snapshots the
 * insurer identity (survives directory edits) and flips the request to 'dispatched'.
 * Called by the Nexus panel right after a successful send. thread_id is backfilled
 * in Phase C for reply-matching.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(req: NextRequest) {
  try {
    const { rfq_request_id, contact_id, ai_draft_id, gmail_thread_id } = await req.json() as {
      rfq_request_id?: string; contact_id?: string; ai_draft_id?: string; gmail_thread_id?: string
    }
    if (!rfq_request_id || !contact_id) return NextResponse.json({ error: 'rfq_request_id and contact_id required' }, { status: 400 })

    // Snapshot insurer identity from the contact.
    const cRes = await fetch(
      `${SB_URL}/rest/v1/insurer_contacts?id=eq.${contact_id}&select=product_line,contact_email,insurers(name)&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const contact = cRes.ok ? (await cRes.json())[0] : null
    if (!contact) return NextResponse.json({ error: 'contact not found' }, { status: 404 })

    const insRes = await fetch(`${SB_URL}/rest/v1/rfq_dispatches`, {
      method:  'POST',
      headers: sbH('return=representation'),
      body: JSON.stringify({
        rfq_request_id,
        insurer_contact_id: contact_id,
        insurer_name:       contact.insurers?.name ?? null,
        product_line:       contact.product_line,
        to_email:           contact.contact_email,
        ai_draft_id:        ai_draft_id ?? null,
        gmail_thread_id:    gmail_thread_id ?? null,
        status:             'sent',
      }),
    })
    if (!insRes.ok) return NextResponse.json({ error: await insRes.text() }, { status: 500 })
    const dispatch = (await insRes.json())[0]

    // Flip the request line to 'dispatched'.
    await fetch(`${SB_URL}/rest/v1/rfq_requests?id=eq.${rfq_request_id}`, {
      method:  'PATCH',
      headers: sbH('return=minimal'),
      body:    JSON.stringify({ status: 'dispatched' }),
    })

    void logActivity({
      action:        'rfq.dispatched',
      resource_type: 'rfq_dispatch',
      resource_id:   dispatch?.id,
      lead_email:    contact.contact_email,
      new_value:     { insurer: contact.insurers?.name ?? null, product_line: contact.product_line, rfq_request_id },
    })
    return NextResponse.json({ ok: true, dispatch })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
