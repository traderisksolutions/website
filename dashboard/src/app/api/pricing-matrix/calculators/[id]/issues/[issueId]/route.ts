/**
 * PATCH /api/pricing-matrix/calculators/[id]/issues/[issueId]   { resolution?, dismiss? }
 * Records a human decision on a reconciliation issue (Opus-vs-Gemini disagreement) — who resolved
 * it, when, and what value was chosen. The caller (the review page) still applies the resolution to
 * the live rate table/terms itself via the normal Save; this only persists the decision's audit
 * trail so it isn't lost/overwritten the way it was when conflicts lived inline in a JSON blob.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  const { issueId } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { resolution, dismiss } = await req.json().catch(() => ({})) as { resolution?: unknown; dismiss?: boolean }
    const body = {
      status: dismiss ? 'dismissed' : 'resolved',
      resolution: dismiss ? null : resolution ?? null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    }
    const res = await fetch(`${SB_URL}/rest/v1/pm_reconciliation_issues?id=eq.${issueId}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(body) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
