/**
 * GET /api/nexus/rfq/for-thread?thread_id=X
 *
 * Returns the RFQ case (if any) started from this client thread, so the inline
 * RFQ workflow in the engagement dock can show the existing case or offer to
 * start one. { case_id: string | null }.
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
    if (!threadId) return NextResponse.json({ case_id: null })

    // A thread can now have one RFQ case per line — return them all (newest first)
    // plus the latest as case_id for the single "view in Nexus" link.
    const res = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?client_thread_id=eq.${threadId}&select=case_id&order=created_at.desc`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rows: { case_id: string | null }[] = res.ok ? await res.json() : []
    const caseIds = Array.from(new Set(rows.map(r => r.case_id).filter((c): c is string => !!c)))
    return NextResponse.json({ case_id: caseIds[0] ?? null, case_ids: caseIds })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
