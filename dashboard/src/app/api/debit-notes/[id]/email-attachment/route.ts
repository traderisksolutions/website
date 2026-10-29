/**
 * POST /api/debit-notes/[id]/email-attachment
 * The debit note's PDF as an attachment reference the send route (`/api/email/send`) reads:
 * { filename, mime_type, storage_url: 'drivefile:<id>' }. The PDF is read from the note's Drive
 * folder, which is the record since the storage bucket went with the move to GCP.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { SB_URL, sbH as debitSbH } from '@/lib/debit-note-storage'
import { folderIdFromUrl, getDriveWriteToken, listFolderFiles, pickDebitNotePdf } from '@/lib/gdrive-write'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${encodeURIComponent(id)}&select=debit_note_no,drive_folder_url&limit=1`, { headers: debitSbH(), cache: 'no-store' })
    const dn = dnRes.ok ? (await dnRes.json())[0] as { debit_note_no: string; drive_folder_url: string | null } | undefined : undefined
    if (!dn) return NextResponse.json({ error: 'Debit note not found' }, { status: 404 })
    const folder = folderIdFromUrl(dn.drive_folder_url)
    if (!folder) return NextResponse.json({ error: 'This debit note has no Drive folder, so its PDF cannot be attached' }, { status: 404 })
    const file = pickDebitNotePdf(await listFolderFiles(folder, await getDriveWriteToken()), dn.debit_note_no)
    if (!file) return NextResponse.json({ error: `No PDF for ${dn.debit_note_no} in its Drive folder` }, { status: 404 })
    return NextResponse.json({ filename: `${dn.debit_note_no}.pdf`, mime_type: 'application/pdf', storage_url: `drivefile:${file.id}` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
