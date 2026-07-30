/** GET /api/debit-notes/imports/items/[id]/pdf → signed read URL for one bundle member file, for the review card's per-file preview link. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, signRead }     from '@/lib/debit-note-storage'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}&select=storage_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row?.storage_url) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url = await signRead(row.storage_url)
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
