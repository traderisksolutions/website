/**
 * POST /api/pricing-matrix/calculators/[id]/extract-pricing
 * Re-extracts just the transparent rate tables (Opus + Gemini + reconciling judge) from the
 * workbook and stores them — WITHOUT touching the cell-map profile. Drives map_progress so the
 * review page's progress bar works. Used by "Refresh rate tables".
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH, signRead }     from '@/lib/pm-storage'
import { extractPricing }            from '@/lib/pm-pricing'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patch = (body: Record<string, unknown>) => fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(body) })
  const progress = async (label: string, step: number, total: number) => { await patch({ map_progress: { label, step, total, at: new Date().toISOString() } }) }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const calc = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&select=xlsx_path&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null)
    if (!calc?.xlsx_path) return NextResponse.json({ error: 'Calculator has no uploaded .xlsx' }, { status: 400 })

    await progress('Reading the workbook', 1, 3)
    const xlsx_url = await signRead(calc.xlsx_path)
    const origin = new URL(req.url).origin
    const dumpRes = await fetch(`${origin}/api/pm_dump`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xlsx_url }) })
    const dump = await dumpRes.json().catch(() => ({ error: 'pm_dump non-JSON' }))
    if (!dumpRes.ok || dump.error) return NextResponse.json({ error: `Dump failed: ${dump.error ?? dumpRes.status}` }, { status: 502 })

    const { pricing, error } = await extractPricing(dump, (label, s) => progress(label, Math.max(1, Math.min(2, s - 2)), 3))
    if (!pricing) return NextResponse.json({ error: error ?? 'no pricing extracted' }, { status: 502 })

    await patch({ pricing })
    await progress('Done', 3, 3)
    void logActivity({ action: 'pm.pricing_refreshed', resource_type: 'pm_calculator', resource_id: id, new_value: { coverages: pricing.coverages?.length ?? 0, accuracy: pricing.accuracy } })
    return NextResponse.json({ ok: true, pricing })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
