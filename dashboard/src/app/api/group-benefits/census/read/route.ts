/**
 * POST /api/group-benefits/census/read
 *   multipart: file, password?            a file the broker uploads
 *   JSON: { attachment_id, password? }    a file on an email, fetched again from Gmail in full
 *
 * Every sheet read on its own (who, how many, which plan columns); the broker picks the sheets.
 * Never the stored text of an attachment, which was capped. A protected workbook answers
 * needsPassword (with the password the email states, when it states one) until it opens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enc, sbTry } from '@/lib/crm/db'
import { messageAttachmentBytes } from '@/lib/storage/attachment-bytes'
import { passwordInText, workbookSheets, WorkbookPasswordError } from '@/lib/xlsx-text'
import { workbookCensus, parseDelimited, censusFromRows } from '@/lib/gb/census-parse'

export const maxDuration = 60
const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let buf: Buffer | null = null, filename = '', password: string | null = null, hint: string | null = null
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a .xlsx, .xls or .csv file' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is over 15 MB' }, { status: 400 })
    buf = Buffer.from(await file.arrayBuffer()); filename = file.name
    password = String(form?.get('password') ?? '') || null
  } else {
    const body = await req.json().catch(() => ({})) as { attachment_id?: string; password?: string }
    if (!body.attachment_id) return NextResponse.json({ error: 'attachment_id or a file is required' }, { status: 400 })
    const [a] = await sbTry<{ filename: string; message_id: string; size_bytes: number | null }[]>(`email_attachments?id=eq.${enc(body.attachment_id)}&select=filename,message_id,size_bytes&limit=1`, [])
    if (!a) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    filename = a.filename
    buf = await messageAttachmentBytes(a.message_id, a.filename)
    // The same file often sits on several emails (a forward, a reply, a second mailbox); one copy
    // may not be fetchable from its mailbox. Try the others.
    if (!buf) {
      const copies = await sbTry<{ message_id: string; filename: string }[]>(`email_attachments?filename=eq.${enc(a.filename)}${a.size_bytes ? `&size_bytes=eq.${a.size_bytes}` : ''}&message_id=neq.${enc(a.message_id)}&select=message_id,filename&order=created_at.asc&limit=10`, [])
      for (const c of copies) { buf = await messageAttachmentBytes(c.message_id, c.filename).catch(() => null); if (buf) break }
    }
    if (!buf) return NextResponse.json({ error: 'The file could not be fetched from the mailbox. Download it from the email and upload it here.' }, { status: 502 })
    const [m] = await sbTry<{ body_text: string | null }[]>(`email_messages?id=eq.${enc(a.message_id)}&select=body_text&limit=1`, [])
    hint = passwordInText(m?.body_text)
    password = body.password || null
  }

  try {
    const isCsv = /\.(csv|txt)$/i.test(filename)
    const sheets = isCsv
      ? (() => { const r = censusFromRows(parseDelimited(buf!.toString('utf8').replace(/^﻿/, ''))); const employees = r.members.filter(m => m.relationship === 'self').length; return [{ sheet: filename, members: r.members.map(m => ({ ...m, entity: null })), employees, dependants: r.members.length - employees, unread: r.unread, found: r.found, error: r.error, planCovers: [] as string[] }] })()
      : workbookCensus(await workbookSheets(buf!, password))
    return NextResponse.json({ filename, sheets })
  } catch (e) {
    if (e instanceof WorkbookPasswordError) return NextResponse.json({ filename, needsPassword: true, wrongPassword: e.reason === 'wrong', passwordHint: hint }, { status: 200 })
    return NextResponse.json({ error: `The file could not be read: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 })
  }
}
