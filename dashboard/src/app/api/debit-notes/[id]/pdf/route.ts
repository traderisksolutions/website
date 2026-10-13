/**
 * GET /api/debit-notes/[id]/pdf → redirects to the debit note's PDF in Google Drive (the
 * company folder on debit_notes.drive_folder_url), or to that folder when the PDF cannot be
 * told apart from the other files in it. Used as a link from the Debit Note list, detail
 * drawer and Calendar.
 *
 * Until 13 Oct 2026 this signed a Supabase storage URL. That storage went away with the move
 * to GCP (trs-api answers "trs api" for /storage/*), so every click failed with
 * `"trs api" is not valid JSON`. Drive has been the record since the 2 Oct import.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { debitNoteDriveLink }        from '@/lib/gdrive-write'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=debit_note_no,drive_folder_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? ((await res.json()) as { debit_note_no: string; drive_folder_url: string | null }[])[0] : null
    if (!row) return NextResponse.json({ error: 'Debit note not found' }, { status: 404 })
    if (!row.drive_folder_url) return NextResponse.json({ error: `No Google Drive folder is recorded for ${row.debit_note_no}` }, { status: 404 })

    let target: { url: string; kind: 'file' | 'folder' } = { url: row.drive_folder_url, kind: 'folder' }
    try { target = await debitNoteDriveLink(row.drive_folder_url, row.debit_note_no) }
    catch (e) { console.error('[debit-notes/pdf] Drive lookup failed, opening the folder:', e instanceof Error ? e.message : e) }
    return NextResponse.redirect(target.url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
