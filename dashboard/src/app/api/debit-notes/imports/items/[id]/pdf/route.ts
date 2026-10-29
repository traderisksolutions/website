/** GET /api/debit-notes/imports/items/[id]/pdf → redirect to one bundle member file in Drive, for the review card's per-file preview link. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { NEVER_STORED, driveWebLink } from '@/lib/storage/attachment-bytes'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}&select=storage_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row?.storage_url) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url = driveWebLink(row.storage_url)
    if (!url) return NextResponse.json({ error: NEVER_STORED }, { status: 410 })
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
