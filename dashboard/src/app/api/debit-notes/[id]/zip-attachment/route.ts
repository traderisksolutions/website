/**
 * POST /api/debit-notes/[id]/zip-attachment  { storageUrls: string[] }
 * The "Send documents" picker's action — zips exactly the files the user explicitly checked
 * (nothing is ever pre-selected; see the debit_notes.attachment_files list, which can include
 * the commission statement, so this must never auto-include everything), stores the zip in Drive
 * (email-outgoing/<YYYY-MM>/) and returns the {filename, mime_type, storage_url: 'drivefile:<id>'}
 * shape the compose modal and the send route read. Refuses if any checked file cannot be read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH as debitSbH, downloadObject, storageKeySegment } from '@/lib/debit-note-storage'
import { storeUpload }               from '@/lib/storage/drive-upload'
import AdmZip                        from 'adm-zip'

type AttachmentFile = { filename?: string | null; storage_url: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { storageUrls } = await req.json() as { storageUrls?: string[] }
    if (!storageUrls?.length) return NextResponse.json({ error: 'storageUrls required' }, { status: 400 })

    const dnRes = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=debit_note_no,attachment_files&limit=1`, { headers: debitSbH(), cache: 'no-store' })
    const dn = dnRes.ok ? (await dnRes.json())[0] : null
    if (!dn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const files = new Map((dn.attachment_files as AttachmentFile[] ?? []).map(f => [f.storage_url, f]))
    const invalid = storageUrls.filter(u => !files.has(u))
    if (invalid.length) return NextResponse.json({ error: `Not attached to this debit note: ${invalid.join(', ')}` }, { status: 400 })

    const zip = new AdmZip()
    const used = new Set<string>()
    for (const ref of storageUrls) {
      const name = files.get(ref)!.filename || (ref.startsWith('drivefile:') ? 'document' : ref.split('/').pop()) || 'document'
      let bytes: Buffer
      try { bytes = await downloadObject(ref) }
      catch (e) { return NextResponse.json({ error: `${name}: ${e instanceof Error ? e.message : 'could not be read'}` }, { status: 410 }) }
      zip.addFile(uniqueIn(used, name), bytes)
    }

    const filename = `${dn.debit_note_no}-documents.zip`
    const storageUrl = await storeUpload('email-outgoing', storageKeySegment(filename), 'application/zip', zip.toBuffer())
    return NextResponse.json({ filename, mime_type: 'application/zip', storage_url: storageUrl })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** Two checked files with one name would overwrite each other in the zip. */
function uniqueIn(used: Set<string>, name: string): string {
  let out = name
  for (let n = 2; used.has(out); n++) out = name.replace(/(\.[^.]*)?$/, m => ` (${n})${m}`)
  used.add(out)
  return out
}
