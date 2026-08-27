/**
 * GET /api/nexus/rfq/thread-context?thread_id=X
 *
 * If this engagement thread is an insurer's RFQ conversation, returns the context
 * so the thread can show a banner ("Insurer quote · QBE · Red Beacon RFQ → file").
 * { is_insurer_rfq, case_id?, insurer_name?, insured?, product_line? }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ is_insurer_rfq: false })

    const dRes = await fetch(
      `${SB_URL}/rest/v1/rfq_dispatches?thread_id=eq.${threadId}&select=insurer_name,product_line,rfq_request_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const d = dRes.ok ? (await dRes.json())[0] : null
    if (!d) return NextResponse.json({ is_insurer_rfq: false })

    let caseId: string | null = null
    let insured: string | null = null
    if (d.rfq_request_id) {
      const rRes = await fetch(
        `${SB_URL}/rest/v1/rfq_requests?id=eq.${d.rfq_request_id}&select=case_id,insured_name&limit=1`,
        { headers: sbH(), cache: 'no-store' }
      )
      const r = rRes.ok ? (await rRes.json())[0] : null
      caseId  = r?.case_id ?? null
      insured = r?.insured_name ?? null
    }

    return NextResponse.json({
      is_insurer_rfq: true,
      case_id:        caseId,
      insurer_name:   d.insurer_name ?? null,
      insured,
      product_line:   d.product_line ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
