/**
 * GET /api/nexus/rfq/for-thread?thread_id=X
 *
 * Returns the RFQ case (if any) started from this client thread, so the inline
 * RFQ workflow in the engagement dock can show the existing case or offer to
 * start one. { case_id: string | null }.
 */
import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest) {
  try {
    const threadId = new URL(req.url).searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ case_id: null })

    const res = await fetch(
      `${SB_URL}/rest/v1/rfq_requests?client_thread_id=eq.${threadId}&select=case_id&limit=1`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json({ case_id: Array.isArray(rows) && rows[0] ? rows[0].case_id : null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
