/**
 * GET    /api/pricing-matrix/calculators/[id]   → full calculator (incl. profile + dump + verification)
 * PATCH  /api/pricing-matrix/calculators/[id]   → save edits { profile?, label?, insurer_name?,
 *                                                  effective_date?, status? }
 * DELETE /api/pricing-matrix/calculators/[id]   → remove the calculator row (files left in storage)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL, sbH }               from '@/lib/pm-storage'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const b = await req.json() as Record<string, unknown>
    const body: Record<string, unknown> = {}
    for (const k of ['profile', 'label', 'insurer_name', 'effective_date', 'notes'] as const) {
      if (k in b) body[k] = b[k]
    }
    // Editing the profile after review keeps the calculator in review (must re-verify to approve).
    if ('profile' in b && !('status' in b)) body.status = 'in_review'
    if ('status' in b && typeof b.status === 'string') body.status = b.status
    if (Object.keys(body).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(body) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'pm.calculator_saved', resource_type: 'pm_calculator', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/pm_calculators?id=eq.${id}`, { method: 'DELETE', headers: sbH('return=minimal') })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    void logActivity({ action: 'pm.calculator_deleted', resource_type: 'pm_calculator', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
