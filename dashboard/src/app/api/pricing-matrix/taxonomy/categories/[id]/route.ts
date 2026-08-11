/**
 * PATCH /api/pricing-matrix/taxonomy/categories/[id] { name?, description?, sort_order?, status? }
 * Rename/reorder/archive a category. is_protected categories (only 'Other') reject name/status
 * changes — they're the fixed escape hatch every unclassified term falls back to, and must always
 * exist under that exact name.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { name?: string; description?: string; sort_order?: number; status?: 'active' | 'archived' }

    const curRes = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?id=eq.${id}&select=is_protected&limit=1`, { headers: sbH(), cache: 'no-store' })
    const cur = curRes.ok ? (await curRes.json())[0] : null
    if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (cur.is_protected && (body.name !== undefined || body.status !== undefined)) {
      return NextResponse.json({ error: 'This category is protected and cannot be renamed or archived' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = body.name.trim()
    if (body.description !== undefined) patch.description = body.description?.trim() || null
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (body.status !== undefined) patch.status = body.status
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'No changes' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?id=eq.${id}`, { method: 'PATCH', headers: sbH('return=minimal'), body: JSON.stringify(patch) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
