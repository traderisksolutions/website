/**
 * POST /api/group-benefits/last-year/read
 *   multipart: files[] (PDF, image, .xlsx), attachment_ids[]   uploads, and documents on emails
 *   JSON: { attachment_ids: string[] }                           documents on the client's emails
 * → { read: LastYear } — last year's policy: insurer, plans per category, premium per cover.
 *
 * One model call reads every file; code bounds the result (src/lib/gb/last-year.ts). Spreadsheets
 * are sent as text. Nothing is saved here: the broker confirms the read on Review first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { messageAttachmentBytes } from '@/lib/storage/attachment-bytes'
import { readLastYear } from '@/lib/gb/last-year'
import { workbookSheets } from '@/lib/xlsx-text'

export const maxDuration = 120
const MAX_BYTES = 20 * 1024 * 1024
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic' }

async function asPart(name: string, bytes: Buffer): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (MIME[ext]) return { name, mime: MIME[ext], bytes }
  if (/^xls[xm]?$|^csv$/.test(ext)) {
    const text = ext === 'csv' ? bytes.toString('utf8') : (await workbookSheets(bytes)).map(s => `## ${s.name}\n${s.text}`).join('\n\n')
    return { name, mime: 'text/plain', bytes: Buffer.from(text.slice(0, 400_000), 'utf8') }
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const files: { name: string; mime: string; bytes: Buffer }[] = []
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
      const p = await asPart(f.name, Buffer.from(await f.arrayBuffer())).catch(() => null)
      if (p) files.push(p); else skipped.push(`${f.name}: not a PDF, image or spreadsheet`)
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
      if (p) files.push(p); else skipped.push(`${a.filename}: could not be fetched from the mailbox`)
    }
  }
  if (!files.length) return NextResponse.json({ error: skipped.join('; ') || 'No readable document.' }, { status: 422 })
  const out = await readLastYear(files)
  if ('error' in out) return NextResponse.json({ error: out.error, skipped }, { status: 502 })
  return NextResponse.json({ read: out.read, skipped })
}
