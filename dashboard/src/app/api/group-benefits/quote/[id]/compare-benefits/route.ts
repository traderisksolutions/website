/**
 * POST /api/group-benefits/quote/[id]/compare-benefits
 *
 * Lines the quoted plans up on the canonical schedule; the work is in
 * src/lib/gb/compare-quotation.ts, shared with the group benefits agent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { compareQuotation, CompareError } from '@/lib/gb/compare-quotation'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { hideIdentical, hideEmpty } = await req.json().catch(() => ({})) as
      { hideIdentical?: boolean; hideEmpty?: boolean }
    const { comparison, options } = await compareQuotation(id, { hideIdentical, hideEmpty })

    void logActivity({ action: 'gb.benefits_compared', resource_type: 'gb_quotation', resource_id: id,
                       new_value: { options: options.length, lines: comparison.coverage.linesCompared } })
    return NextResponse.json({ comparison })
  } catch (e) {
    if (e instanceof CompareError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
