/**
 * One file sent to an /eb reader: an upload (multipart `file`) or a file on the company's emails
 * (`attachment_id`), fetched again from the mailbox in full; when one copy cannot be fetched, the
 * same file on another email is tried. Server only. No model.
 */
import { enc, sbTry } from '@/lib/crm/db'
import { messageAttachmentBytes } from '@/lib/storage/attachment-bytes'

export type EbFile = { buf: Buffer; filename: string; messageId: string | null; fields: Record<string, string> }

export async function ebFileFrom(req: Request, maxBytes = 15 * 1024 * 1024): Promise<EbFile | { error: string; status: number }> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return { error: 'Attach a file.', status: 400 }
    if (file.size > maxBytes) return { error: `The file is over ${Math.round(maxBytes / 1024 / 1024)} MB.`, status: 400 }
    const fields: Record<string, string> = {}
    form!.forEach((v, k) => { if (typeof v === 'string') fields[k] = v.slice(0, 200) })
    return { buf: Buffer.from(await file.arrayBuffer()), filename: file.name, messageId: null, fields }
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.attachment_id === 'string' ? body.attachment_id : ''
  if (!id) return { error: 'attachment_id or a file is required', status: 400 }
  const [a] = await sbTry<{ filename: string; message_id: string; size_bytes: number | null }[]>(`email_attachments?id=eq.${enc(id)}&select=filename,message_id,size_bytes&limit=1`, [])
  if (!a) return { error: 'Attachment not found', status: 404 }
  let buf = await messageAttachmentBytes(a.message_id, a.filename).catch(() => null)
  if (!buf) {
    const copies = await sbTry<{ message_id: string; filename: string }[]>(`email_attachments?filename=eq.${enc(a.filename)}${a.size_bytes ? `&size_bytes=eq.${a.size_bytes}` : ''}&message_id=neq.${enc(a.message_id)}&select=message_id,filename&order=created_at.asc&limit=10`, [])
    for (const c of copies) { buf = await messageAttachmentBytes(c.message_id, c.filename).catch(() => null); if (buf) break }
  }
  if (!buf) return { error: 'The file could not be fetched from the mailbox. Download it from the email and add it here.', status: 502 }
  if (buf.length > maxBytes) return { error: `The file is over ${Math.round(maxBytes / 1024 / 1024)} MB.`, status: 400 }
  const fields = Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 200)]))
  return { buf, filename: a.filename, messageId: a.message_id, fields }
}
