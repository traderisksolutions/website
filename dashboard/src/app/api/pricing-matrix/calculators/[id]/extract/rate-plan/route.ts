/**
 * POST /api/pricing-matrix/calculators/[id]/extract/rate-plan — STAGE 2a of 6.
 *
 * Pure planning, no AI call — reads back the dump the previous stage persisted and groups its
 * sheets into small batches (see pm-extract-shared.ts's planSheetBatches). The client then calls
 * extract/rate once per batch instead of once for the whole workbook, so no single AI call ever
 * has to embed the full dump as inline JSON text — see extract/rate/route.ts for why that mattered.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { loadCalc, planSheetBatches, patchCalc } from '@/lib/pm-extract-shared'

export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await loadCalc(id)
    if (!calc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const batches = planSheetBatches(calc.workbook_summary)
    // Reset the scratch column fresh for this run — extract/rate appends one entry per batch.
    await patchCalc(id, { pricing: null })
    // No sheets with data (e.g. brochure-only calculator, no xlsx) — one "batch" of no sheets still
    // lets extract/rate run once against the brochure alone.
    return NextResponse.json({ ok: true, batches: batches.length ? batches : [[]] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
