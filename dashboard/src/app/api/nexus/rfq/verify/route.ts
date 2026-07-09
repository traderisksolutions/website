/**
 * POST /api/nexus/rfq/verify — pre-send failsafe on captured quote figures (#1).
 * Body: { case_id }
 * Returns per-insurer, per-figure verification: source match + excerpt match +
 * second-model consensus. Surfaced in a modal before recommending to the client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { verifyQuotes }              from '@/lib/rfq-quote-verify'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { case_id } = await req.json() as { case_id?: string }
    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 })

    const results = await verifyQuotes(case_id)
    const flagged = results.reduce((n, r) => n + r.fields.filter(f => f.status === 'review').length, 0)
    return NextResponse.json({ results, all_ok: flagged === 0, flagged_count: flagged })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
