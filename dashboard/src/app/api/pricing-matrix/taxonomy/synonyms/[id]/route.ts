/**
 * PATCH /api/pricing-matrix/taxonomy/synonyms/[id] { category_id } | { reject: true }
 * Approve (assign a category) or reject a pending terminology synonym. Approval is retroactive —
 * see applySynonymRetroactively — every existing coverage/term with matching wording, across every
 * calculator, gets canonical_category_id/canonical_category patched in the same call, not just the
 * calculator that first surfaced this term.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { applySynonymRetroactively, type TaxonomySynonym } from '@/lib/pm-taxonomy'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { category_id, reject } = await req.json().catch(() => ({})) as { category_id?: string; reject?: boolean }

    const curRes = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_synonyms?id=eq.${id}&limit=1`, { headers: sbH(), cache: 'no-store' })
    const synonym: TaxonomySynonym | undefined = curRes.ok ? (await curRes.json())[0] : undefined
    if (!synonym) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (reject) {
      const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_synonyms?id=eq.${id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ status: 'rejected', approved_by: user.id, approved_at: new Date().toISOString() }),
      })
      if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (!category_id) return NextResponse.json({ error: 'category_id required to approve' }, { status: 400 })
    const catRes = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?id=eq.${category_id}&select=name&limit=1`, { headers: sbH(), cache: 'no-store' })
    const cat = catRes.ok ? (await catRes.json())[0] : null
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const upd = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_synonyms?id=eq.${id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ category_id, status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() }),
    })
    if (!upd.ok) return NextResponse.json({ error: await upd.text() }, { status: 500 })

    const applied = await applySynonymRetroactively({ ...synonym, category_id }, cat.name)
    return NextResponse.json({ ok: true, applied })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
