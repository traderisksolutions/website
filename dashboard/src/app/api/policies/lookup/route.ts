/**
 * GET /api/policies/lookup?policy_number=X
 * Used by the debit note review form to auto-suggest "this is a mid-term endorsement" — if a
 * policy with this number already exists and already has a prior debit note, the caller compares
 * its stored period against the one just extracted from the new document: an unchanged period
 * means the same term is being billed again (endorsement), a different one means a new term
 * (renewal). Returns null if no policy has this number yet (new business).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const policyNumber = req.nextUrl.searchParams.get('policy_number')?.trim()
    if (!policyNumber) return NextResponse.json(null)

    const res = await fetch(`${SB_URL}/rest/v1/policies?policy_number=eq.${encodeURIComponent(policyNumber)}&select=id,start_date,end_date&limit=1`, { headers: sbH(), cache: 'no-store' })
    const policy = res.ok ? (await res.json())[0] : null
    if (!policy) return NextResponse.json(null)

    const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?policy_id=eq.${policy.id}&select=id&limit=1`, { headers: sbH(), cache: 'no-store' })
    const hasDebitNotes = dnRes.ok && (await dnRes.json()).length > 0

    return NextResponse.json({ id: policy.id, startDate: policy.start_date, endDate: policy.end_date, hasDebitNotes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
