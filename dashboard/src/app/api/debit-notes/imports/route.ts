/**
 * GET  /api/debit-notes/imports?status=needs_review   → review queue list.
 * POST /api/debit-notes/imports  { storage_url, original_filename } → registers an uploaded
 *      PDF as a pending staging row (client calls this right after the signed-URL upload
 *      completes; extraction is triggered separately so the upload loop can move on to the
 *      next file without waiting on Gemini).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const status = req.nextUrl.searchParams.get('status')
    const filter = status ? `&status=eq.${status}` : ''
    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items?select=*,companies:suggested_company_id(id,name:company_name)&order=created_at.desc&limit=500${filter}`, { headers: sbH(), cache: 'no-store' })
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

    const { storage_url, original_filename } = await req.json() as { storage_url?: string; original_filename?: string }
    if (!storage_url) return NextResponse.json({ error: 'storage_url required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify({ storage_url, original_filename: original_filename ?? null, status: 'pending' }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    return NextResponse.json((await res.json())[0])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
