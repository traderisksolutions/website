/**
 * POST /api/debit-notes/[id]/zip-attachment  { storageUrls: string[] }
 * The "Send documents" picker's action — zips exactly the files the user explicitly checked
 * (nothing is ever pre-selected; see the debit_notes.attachment_files list, which can include
 * the commission statement, so this must never auto-include everything) and uploads the zip to
 * the `email-attachments` bucket the Engagement send route reads from, returning the
 * {filename, mime_type, storage_url} shape the compose modal expects.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH as debitSbH }   from '@/lib/debit-note-storage'
import { randomUUID }                from 'node:crypto'
import AdmZip                        from 'adm-zip'

const EMAIL_BUCKET = 'email-attachments'

function emailStH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

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

    const allowed = new Set((dn.attachment_files as { storage_url: string }[] ?? []).map(f => f.storage_url))
    const invalid = storageUrls.filter(u => !allowed.has(u))
    if (invalid.length) return NextResponse.json({ error: `Not attached to this debit note: ${invalid.join(', ')}` }, { status: 400 })

    const zip = new AdmZip()
    for (const path of storageUrls) {
      const fileRes = await fetch(`${SB_URL}/storage/v1/object/debit-notes/${path}`, { headers: debitSbH() })
      if (!fileRes.ok) return NextResponse.json({ error: `Could not read ${path}` }, { status: 502 })
      const bytes = Buffer.from(await fileRes.arrayBuffer())
      zip.addFile(path.split('/').pop() ?? path, bytes)
    }
    const zipBuffer = zip.toBuffer()

    const filename = `${dn.debit_note_no}-documents.zip`
    const uploadPath = `outgoing/${randomUUID()}/${filename}`
    const upRes = await fetch(`${SB_URL}/storage/v1/object/${EMAIL_BUCKET}/${uploadPath}`, {
      method: 'POST', headers: { ...emailStH(), 'Content-Type': 'application/zip' },
      body: zipBuffer as unknown as BodyInit,
    })
    if (!upRes.ok) return NextResponse.json({ error: await upRes.text() }, { status: 502 })

    return NextResponse.json({ filename, mime_type: 'application/zip', storage_url: uploadPath })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
