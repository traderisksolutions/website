import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rpConfigured, rpGet } from '@/lib/roadplus-db'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/roadplus/payments → the roadplus payments reconciliation ledger.
export async function GET(req: NextRequest) {
  if (!(await requireUser()))
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!rpConfigured())
    return NextResponse.json({ configured: false, rows: [] })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 500)

  const cols =
    'id,partner,gateway,payment_method,proposal_no,policy_id,policy_no,transaction_id,' +
    'payment_ref_no,amount,currency,payment_status,error_code,paid_date,source,received_at'
  let path = `payments?select=${cols}&order=received_at.desc&limit=${limit}`
  if (q) {
    const like = `*${q}*`
    path += `&or=(policy_no.ilike.${like},policy_id.ilike.${like},proposal_no.ilike.${like},transaction_id.ilike.${like})`
  }

  try {
    const rows = await rpGet(path)
    return NextResponse.json({ configured: true, rows })
  } catch (e) {
    return NextResponse.json({ configured: true, rows: [], error: String(e) }, { status: 502 })
  }
}
