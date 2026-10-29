/**
 * The bytes behind a stored-file reference. Supabase Storage went away with the move to Cloud
 * SQL (the TRS API answers every /storage/v1 path with HTTP 200 "trs api"), so a reference is
 * now one of:
 *
 *   drivefile:<id>       a file in the Shared Drive (uploads, generated PDFs, outgoing zips)
 *   gmail:<attachment>   an email_attachments row: fetched again from its Gmail message
 *   https://…            a public URL (never a dead /storage/v1 URL)
 *   <bare path>          a legacy bucket path: resolved through its email_attachments row
 *
 * Null means the bytes cannot be had. For a legacy bucket path that is final: the file was never
 * stored, and NEVER_STORED is the message to show.
 */
import { getDriveWriteToken } from '@/lib/gdrive-write'
import { attachmentBytes } from '@/lib/documents/drive'
import { enc, sbTry } from '@/lib/crm/db'

export const NEVER_STORED = 'This file was never stored; upload it again'

export const isDriveRef = (ref: string | null | undefined): ref is `drivefile:${string}` => !!ref && ref.startsWith('drivefile:')
export const driveRef = (id: string) => `drivefile:${id}`
export const driveIdOf = (ref: string) => ref.slice('drivefile:'.length)
export const gmailRef = (attachmentId: string) => `gmail:${attachmentId}`

/** A URL on the retired Supabase Storage API. It answers 200 with "trs api" for every path. */
export const isDeadStorageUrl = (ref: string) => /^https?:\/\/[^/]+\/storage\/v1\//.test(ref)

/** The catch-all body of the dead storage API, which arrives with HTTP 200. */
export const isCatchAllBody = (buf: Buffer) => buf.length < 64 && buf.toString('utf8').trim() === 'trs api'

/** The Drive page for a drivefile reference, for a browser to open. Null for anything else. */
export function driveWebLink(ref: string | null | undefined): string | null {
  return isDriveRef(ref) ? `https://drive.google.com/file/d/${encodeURIComponent(driveIdOf(ref))}/view` : null
}

async function viaAttachmentRow(filter: string): Promise<Buffer | null> {
  const [att] = await sbTry<{ filename: string; message_id: string }[]>(`email_attachments?${filter}&select=filename,message_id&limit=1`, [])
  if (!att) return null
  const [msg] = await sbTry<{ gmail_message_id: string | null }[]>(`email_messages?id=eq.${enc(att.message_id)}&select=gmail_message_id&limit=1`, [])
  if (!msg?.gmail_message_id) return null
  return attachmentBytes(msg.gmail_message_id, att.filename)
}

export async function attachmentRefBytes(ref: string): Promise<Buffer | null> {
  if (!ref) return null
  if (isDriveRef(ref)) {
    const token = await getDriveWriteToken()
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveIdOf(ref))}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  }
  if (ref.startsWith('gmail:')) return viaAttachmentRow(`id=eq.${enc(ref.slice(6))}`)
  if (/^https?:\/\//.test(ref)) {
    if (isDeadStorageUrl(ref)) return null
    const r = await fetch(ref)
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return isCatchAllBody(buf) ? null : buf
  }
  return viaAttachmentRow(`storage_url=eq.${enc(ref)}`)
}

/** attachmentRefBytes, or an Error carrying NEVER_STORED. */
export async function requireRefBytes(ref: string | null | undefined): Promise<Buffer> {
  const buf = ref ? await attachmentRefBytes(ref) : null
  if (!buf || buf.length === 0) throw new Error(NEVER_STORED)
  return buf
}
