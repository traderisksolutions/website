/** GET /api/debit-notes/imports/items/[id]/pdf → redirect to one bundle member file in Drive, for the review card's per-file preview link. */
import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { NEVER_STORED, driveWebLink } from '@/lib/storage/attachment-bytes'
import { withStaff } from '@/lib/auth/guard'

export const GET = withStaff(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}&select=storage_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row?.storage_url) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const url = driveWebLink(row.storage_url)
    if (!url) return NextResponse.json({ error: NEVER_STORED }, { status: 410 })
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}, { error: 'Not authenticated' })
