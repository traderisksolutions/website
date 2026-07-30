/**
 * GET  /api/debit-notes/imports/bundles?status=needs_review → review queue list, each bundle
 *      with its member files (pdf_import_items) embedded.
 * POST /api/debit-notes/imports/bundles  { files: {storage_url, original_filename}[] }
 *      Registers a set of 2-3 already-uploaded files (via the signed-URL flow) as one bundle —
 *      one renewal/new-business event. Extraction is triggered separately per bundle.
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
    const select = '*,companies:suggested_company_id(id,name:company_name),pdf_import_items(id,storage_url,original_filename,doc_type,status,error_message)'
    const res = await fetch(`${SB_URL}/rest/v1/debit_note_bundles?select=${select}&order=created_at.desc&limit=500${filter}`, { headers: sbH(), cache: 'no-store' })
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

    const { files } = await req.json() as { files?: { storage_url: string; original_filename?: string }[] }
    if (!files?.length) return NextResponse.json({ error: 'files required' }, { status: 400 })

    const bundleRes = await fetch(`${SB_URL}/rest/v1/debit_note_bundles`, {
      method: 'POST', headers: sbH(), body: JSON.stringify({ status: 'pending', source: 'manual_upload' }),
    })
    if (!bundleRes.ok) return NextResponse.json({ error: await bundleRes.text() }, { status: 502 })
    const bundle = (await bundleRes.json())[0]

    const itemsRes = await fetch(`${SB_URL}/rest/v1/pdf_import_items`, {
      method: 'POST', headers: sbH(),
      body: JSON.stringify(files.map(f => ({ bundle_id: bundle.id, storage_url: f.storage_url, original_filename: f.original_filename ?? null, status: 'pending' }))),
    })
    if (!itemsRes.ok) return NextResponse.json({ error: await itemsRes.text() }, { status: 502 })

    return NextResponse.json({ id: bundle.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
