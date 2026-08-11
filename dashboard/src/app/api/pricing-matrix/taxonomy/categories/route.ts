/**
 * GET  /api/pricing-matrix/taxonomy/categories            → list all categories, sort_order asc
 * POST /api/pricing-matrix/taxonomy/categories { name }    → create a new category (e.g. from the
 *                                                             "New category from this term" action
 *                                                             on a pending synonym)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

export async function GET() {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?order=sort_order.asc`, { headers: sbH(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { name, description } = await req.json().catch(() => ({})) as { name?: string; description?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const maxRes = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?select=sort_order&order=sort_order.desc&limit=1`, { headers: sbH(), cache: 'no-store' })
    const maxRow = maxRes.ok ? (await maxRes.json())[0] : null
    const sort_order = (maxRow?.sort_order ?? -1) + 1

    const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ name: name.trim(), description: description?.trim() || null, sort_order, created_by: user.id }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json((await res.json())[0])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
