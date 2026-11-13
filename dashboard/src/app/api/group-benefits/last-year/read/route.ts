/**
 * POST /api/group-benefits/last-year/read
 *   multipart: files[] (PDF, image, .xlsx), attachment_ids[]   uploads, and documents on emails
 *   JSON: { attachment_ids: string[] }                           documents on the client's emails
 * → { read: LastYear } — last year's policy: insurer, plans per category, premium per cover.
 *
 * One model call reads every file; code bounds the result (src/lib/gb/last-year.ts). Spreadsheets
 * are sent as text. Uploads are kept in the Shared Drive (group-benefits/last-year) and each
 * document carries where it is kept, so Compare cover links to it; a file from the emails is
 * referenced where it already is. The read itself is saved only when the broker confirms Review.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { gmailRef, messageAttachmentBytes } from '@/lib/storage/attachment-bytes'
import { storeUpload } from '@/lib/storage/drive-upload'
import { readLastYear } from '@/lib/gb/last-year'
import { LAST_YEAR_MAX_BYTES as MAX_BYTES, lastYearPart as asPart } from '@/lib/gb/last-year-files'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const files: { name: string; mime: string; bytes: Buffer }[] = []
  const keep: { name: string; type: string; raw: Buffer }[] = []
  const refOf = new Map<string, string>()
  const skipped: string[] = []
  const type = req.headers.get('content-type') ?? ''
  let ids: string[] = []
  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const list = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File)
    ids = (form?.getAll('attachment_ids') ?? []).map(String).filter(Boolean)
    if (!list.length && !ids.length) return NextResponse.json({ error: 'Attach the policy schedule, endorsements or debit note.' }, { status: 400 })
    for (const f of list) {
      if (f.size > MAX_BYTES) { skipped.push(`${f.name}: over 20 MB`); continue }
      const raw = Buffer.from(await f.arrayBuffer())
      const p = await asPart(f.name, raw).catch(() => null)
      if (p) { files.push(p); keep.push({ name: f.name, type: f.type || p.mime, raw }) } else skipped.push(`${f.name}: not a PDF, image or spreadsheet`)
    }
  } else {
    const body = await req.json().catch(() => ({})) as { attachment_ids?: string[] }
    ids = body.attachment_ids ?? []
    if (!ids.length) return NextResponse.json({ error: 'attachment_ids or files are required' }, { status: 400 })
  }
  ids = ids.slice(0, 12)
  if (ids.length) {
    const rows = await sbTry<{ id: string; filename: string; message_id: string }[]>(`email_attachments?id=in.(${ids.map(enc).join(',')})&select=id,filename,message_id`, [])
    for (const a of rows) {
      const bytes = await messageAttachmentBytes(a.message_id, a.filename).catch(() => null)
      const p = bytes ? await asPart(a.filename, bytes).catch(() => null) : null
      if (p) { files.push(p); refOf.set(a.filename.trim().toLowerCase(), gmailRef(a.id)) } else skipped.push(`${a.filename}: could not be fetched from the mailbox`)
    }
  }
  if (!files.length) return NextResponse.json({ error: skipped.join('; ') || 'No readable document.' }, { status: 422 })
  const [out, stored] = await Promise.all([
    readLastYear(files),
    Promise.all(keep.map(k => storeUpload('group-benefits/last-year', k.name, k.type, k.raw).catch(() => null))),
  ])
  if ('error' in out) return NextResponse.json({ error: out.error, skipped }, { status: 502 })
  keep.forEach((k, i) => { if (stored[i]) refOf.set(k.name.trim().toLowerCase(), stored[i]!) })
  const read = { ...out.read, documents: out.read.documents.map(d => ({ ...d, ref: refOf.get(d.file.trim().toLowerCase()) ?? null })) }
  return NextResponse.json({ read, skipped })
}
