/**
 * The bytes behind an attachment reference. The email-attachments storage bucket went away with
 * the move from Supabase to Cloud SQL (the TRS API answers every /storage/v1 path with "trs api"),
 * so a reference is now one of:
 *
 *   drivefile:<id>       a file the broker uploaded, stored in Drive under email-uploads/
 *   gmail:<attachment>   an email_attachments row: fetched again from its Gmail message
 *   https://…            a public URL
 *   <bare path>          a legacy bucket path: resolved through its email_attachments row
 */
import { getDriveWriteToken } from '@/lib/gdrive-write'
import { attachmentBytes } from '@/lib/documents/drive'
import { enc, sbTry } from '@/lib/crm/db'

export const isDriveRef = (ref: string) => ref.startsWith('drivefile:')
export const gmailRef = (attachmentId: string) => `gmail:${attachmentId}`

async function viaAttachmentRow(filter: string): Promise<Buffer | null> {
  const [att] = await sbTry<{ filename: string; message_id: string }[]>(`email_attachments?${filter}&select=filename,message_id&limit=1`, [])
  if (!att) return null
  const [msg] = await sbTry<{ gmail_message_id: string | null }[]>(`email_messages?id=eq.${enc(att.message_id)}&select=gmail_message_id&limit=1`, [])
  if (!msg?.gmail_message_id) return null
  return attachmentBytes(msg.gmail_message_id, att.filename)
}

export async function attachmentRefBytes(ref: string): Promise<Buffer | null> {
  if (!ref) return null
  if (ref.startsWith('drivefile:')) {
    const token = await getDriveWriteToken()
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref.slice(10))}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
  if (ref.startsWith('gmail:')) return viaAttachmentRow(`id=eq.${enc(ref.slice(6))}`)
  if (/^https?:\/\//.test(ref)) {
    const r = await fetch(ref)
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
  return viaAttachmentRow(`storage_url=eq.${enc(ref)}`)
}
