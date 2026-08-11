/**
 * GET  /api/pricing-matrix/taxonomy/synonyms?status=pending&calculator_id=...   → the standing
 *      taxonomy manager's pending-terminology queue (or ?status=approved/rejected for history),
 *      newest first, with the category name and originating calculator's insurer name embedded
 *      for display. calculator_id scopes it to one calculator's review page ("New terminology").
 * POST /api/pricing-matrix/taxonomy/synonyms { term, source, category_id? }   → manual mapping,
 *      for the "browsable/editable anytime" standing-page use case, independent of any extraction
 *      run. Pre-approved if category_id is given (a human typed it directly), otherwise pending.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { normalizeTerm }             from '@/lib/pm-taxonomy'

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')
    const calculatorId = req.nextUrl.searchParams.get('calculator_id')
    const select = 'select=*,pm_taxonomy_categories(name),pm_calculators(insurer_name)'
    const filters = [status && `status=eq.${status}`, calculatorId && `calculator_id=eq.${calculatorId}`].filter(Boolean).join('&')
    const url = `${SB_URL}/rest/v1/pm_taxonomy_synonyms?${select}${filters ? `&${filters}` : ''}&order=created_at.desc`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
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

    const body = await req.json().catch(() => ({})) as { term?: string; source?: 'coverage' | 'benefit_term'; category_id?: string; insurer_id?: string }
    if (!body.term?.trim() || !body.source) return NextResponse.json({ error: 'term and source required' }, { status: 400 })

    const insert = {
      term: body.term.trim(),
      source: body.source,
      insurer_id: body.insurer_id ?? null,
      category_id: body.category_id ?? null,
      status: body.category_id ? 'approved' : 'pending',
      confidence: 'human',
      created_by: user.id,
      approved_by: body.category_id ? user.id : null,
      approved_at: body.category_id ? new Date().toISOString() : null,
    }
    const res = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_synonyms?on_conflict=insurer_id,source,term_norm`, {
      method: 'POST', headers: sbH('return=representation,resolution=merge-duplicates'), body: JSON.stringify(insert),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const row = (await res.json())[0]

    if (body.category_id) {
      const { applySynonymRetroactively } = await import('@/lib/pm-taxonomy')
      const catRes = await fetch(`${SB_URL}/rest/v1/pm_taxonomy_categories?id=eq.${body.category_id}&select=name&limit=1`, { headers: sbH(), cache: 'no-store' })
      const cat = catRes.ok ? (await catRes.json())[0] : null
      if (cat) await applySynonymRetroactively({ ...row, term_norm: normalizeTerm(row.term) }, cat.name)
    }

    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
