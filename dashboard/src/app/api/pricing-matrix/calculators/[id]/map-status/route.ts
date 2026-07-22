/**
 * GET /api/pricing-matrix/calculators/[id]/map-status
 * Lightweight poll target for the review page's progress bar while Auto-map runs (dump → cell-map →
 * Opus+Gemini rate extraction → reconcile → judge). Returns just status + map_progress.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const row = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=status,map_progress&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    return NextResponse.json(row ?? {})
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
