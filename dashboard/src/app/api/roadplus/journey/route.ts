import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rpConfigured, rpGet } from '@/lib/roadplus-db'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/roadplus/journey?ref=RP-XXXX | ?policy_id=P000...  → the step-by-step
// trace for one customer journey (or the most recent failures when no query).
export async function GET(req: NextRequest) {
  if (!(await requireUser()))
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!rpConfigured())
    return NextResponse.json({ configured: false, rows: [] })

  const ref = req.nextUrl.searchParams.get('ref')?.trim()
  const policyId = req.nextUrl.searchParams.get('policy_id')?.trim()
  const cols = 'id,journey_id,step,status,error,policy_id,quote_id,source,meta,created_at'

  let path: string
  if (ref) {
    path = `journey_events?select=${cols}&journey_id=eq.${encodeURIComponent(ref)}&order=created_at.asc`
  } else if (policyId) {
    path = `journey_events?select=${cols}&policy_id=eq.${encodeURIComponent(policyId)}&order=created_at.asc`
  } else {
    // No query → surface the most recent failures for triage.
    path = `journey_events?select=${cols}&status=eq.fail&order=created_at.desc&limit=50`
  }

  try {
    const rows = await rpGet(path)
    return NextResponse.json({ configured: true, rows })
  } catch (e) {
    return NextResponse.json({ configured: true, rows: [], error: String(e) }, { status: 502 })
  }
}
