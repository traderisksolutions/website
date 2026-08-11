/**
 * PATCH  /api/pricing-matrix/classification-tiers/[id] { name?, sort_order? }  → rename/reorder
 * DELETE /api/pricing-matrix/classification-tiers/[id]                         → remove a tier
 *
 * Renaming is a display-string change only here — the caller (CensusEditor's tier manager) is
 * responsible for cascading the rename to any in-flight census rows/category_overrides still
 * referencing the OLD name before saving, since those are plain string keys with no FK back to
 * this table.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as { name?: string; sort_order?: number }
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name.trim()
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'No changes' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(patch) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers?id=eq.${id}`, { method: 'DELETE', headers: sbH('return=minimal') })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
