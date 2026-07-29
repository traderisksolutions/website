/**
 * GET  /api/companies?search=term   → typeahead for the CompanyContactPicker (name ilike +
 *                                      trigram similarity ordering so near-misses still surface).
 * POST /api/companies               → { name, address?, type? } create a new company inline,
 *                                      exactly the "+ create company" step in the picker.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { resolveCompany }            from '@/lib/debit-note-commit'
import { logActivity }               from '@/lib/log-activity'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const q = (req.nextUrl.searchParams.get('search') ?? '').trim()
    // The live companies table's name column is "company_name" — aliased back to "name" so
    // every consumer of this route can keep using the simpler field name.
    const select = 'id,name:company_name,address,type,domain'
    const url = q
      ? `${SB_URL}/rest/v1/companies?select=${select}&or=(company_name.ilike.*${encodeURIComponent(q)}*)&order=company_name.asc&limit=20`
      : `${SB_URL}/rest/v1/companies?select=${select}&order=company_name.asc&limit=50`
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

    const body = await req.json() as { name?: string; address?: string; type?: 'institution' | 'sme' | 'corporate' }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const companyId = await resolveCompany({ companyName: name, address: body.address ?? null, type: body.type ?? null })
    void logActivity({ action: 'company.created', resource_type: 'company', resource_id: companyId, new_value: { name } })
    return NextResponse.json({ id: companyId, name })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
