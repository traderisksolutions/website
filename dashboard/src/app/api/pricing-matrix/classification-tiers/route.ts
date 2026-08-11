/**
 * GET  /api/pricing-matrix/classification-tiers?company_id=...   → this company's tier list
 *      (Director/Manager/Employee, etc.), sort_order asc. A company with no rows yet is seeded
 *      from app_settings['pm_classification_tiers_default'] (falling back to a hardcoded default)
 *      on first read, so every company starts from a sensible list without a migration/backfill.
 * POST /api/pricing-matrix/classification-tiers { company_id, name }   → append a new tier.
 *
 * Replaces the old global app_settings['pm_employee_categories'] free-text list — tiers now
 * persist per CLIENT COMPANY (pm_classification_tiers.company_id references companies(id)) so a
 * renewal quote for the same company reuses last year's custom tiers automatically.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'

const HARDCODED_DEFAULT = ['Director', 'Manager', 'Employee']

async function defaultTierNames(): Promise<string[]> {
  const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.pm_classification_tiers_default&limit=1`, { headers: sbH(), cache: 'no-store' })
  const row = res.ok ? (await res.json())[0] : null
  try {
    const v = row?.value ? JSON.parse(row.value) : null
    return Array.isArray(v) && v.length ? v : HARDCODED_DEFAULT
  } catch { return HARDCODED_DEFAULT }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const companyId = req.nextUrl.searchParams.get('company_id')
    if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

    const existing = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers?company_id=eq.${companyId}&order=sort_order.asc`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])) as { id: string; name: string; sort_order: number }[]
    if (existing.length) return NextResponse.json(existing)

    // First time this company is quoted — seed from the shared default list.
    const names = await defaultTierNames()
    const seeded = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers`, {
      method: 'POST', headers: sbH('return=representation'),
      body: JSON.stringify(names.map((name, i) => ({ company_id: companyId, name, sort_order: i }))),
    })
    return NextResponse.json(seeded.ok ? await seeded.json() : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { company_id, name } = await req.json().catch(() => ({})) as { company_id?: string; name?: string }
    if (!company_id || !name?.trim()) return NextResponse.json({ error: 'company_id and name required' }, { status: 400 })

    const maxRes = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers?company_id=eq.${company_id}&select=sort_order&order=sort_order.desc&limit=1`, { headers: sbH(), cache: 'no-store' })
    const maxRow = maxRes.ok ? (await maxRes.json())[0] : null
    const sort_order = (maxRow?.sort_order ?? -1) + 1

    const res = await fetch(`${SB_URL}/rest/v1/pm_classification_tiers?on_conflict=company_id,name`, {
      method: 'POST', headers: sbH('return=representation,resolution=ignore-duplicates'),
      body: JSON.stringify({ company_id, name: name.trim(), sort_order }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    const rows = await res.json()
    return NextResponse.json(rows[0] ?? { company_id, name: name.trim(), sort_order })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
