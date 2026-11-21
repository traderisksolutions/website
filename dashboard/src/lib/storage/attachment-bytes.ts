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
import { gmailTokenForMessage } from '@/lib/gmail/mailboxes'
import { enc, sbTry } from '@/lib/crm/db'
import { db, one } from '@/lib/db/client'

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

type Part = { filename?: string; body?: { attachmentId?: string; data?: string }; parts?: Part[] }
function findPart(p: Part | undefined, filename: string): Part | null {
  if (!p) return null
  if (p.filename === filename && (p.body?.attachmentId || p.body?.data)) return p
  for (const c of p.parts ?? []) { const hit = findPart(c, filename); if (hit) return hit }
  return null
}

async function driveBytes(id: string): Promise<Buffer | null> {
  const token = await getDriveWriteToken()
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null
}

/** Files above this are fetched from Gmail each time rather than copied. */
const COPY_LIMIT = 25 * 1024 * 1024

/**
 * The bytes of one file on a stored message. The first time, fetched from Gmail with the token of
 * the mailbox the message was read from (a Gmail id is only valid in its own mailbox) and copied to
 * the Shared Drive (email_attachments.drive_file_id); after that, read from the copy, and Gmail is
 * not asked again (Jarod, 21 Nov 2026). Before the column exists, every read goes to Gmail as before.
 */
export async function messageAttachmentBytes(messageDbId: string, filename: string): Promise<Buffer | null> {
  type Row = { id: string; drive_file_id: string | null; mime_type: string | null }
  const row: Row | null = await one<Row>('Attachment', db().from('email_attachments').select('id,drive_file_id,mime_type').eq('message_id', messageDbId).eq('filename', filename).maybeSingle()).catch(() => null)
  if (row?.drive_file_id) {
    const copy = await driveBytes(row.drive_file_id).catch(() => null)
    if (copy?.length) return copy
  }
  const bytes = await gmailAttachmentBytes(messageDbId, filename)
  if (bytes?.length && row && !row.drive_file_id && bytes.length <= COPY_LIMIT) {
    // Best effort: a failed copy leaves the next read on Gmail, as before.
    try {
      const { storeUpload } = await import('./drive-upload')   // drive-upload imports this file
      const ref = await storeUpload('email-attachments', filename, row.mime_type || 'application/octet-stream', bytes)
      await db().from('email_attachments').update({ drive_file_id: driveIdOf(ref) }).eq('id', row.id).is('drive_file_id', null)
    } catch (e) { console.warn('[attachments] Drive copy failed', e instanceof Error ? e.message : e) }
  }
  return bytes
}

async function gmailAttachmentBytes(messageDbId: string, filename: string): Promise<Buffer | null> {
  const t = await gmailTokenForMessage(messageDbId)
  if (!t) return null
  const h = { Authorization: `Bearer ${t.token}` }
  const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(t.gmailMessageId)}?format=full`, { headers: h })
  if (!msg.ok) return null
  const part = findPart((await msg.json() as { payload?: Part }).payload, filename)
  if (!part) return null
  let data = part.body?.data ?? null
  if (!data && part.body?.attachmentId) {
    const att = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(t.gmailMessageId)}/attachments/${part.body.attachmentId}`, { headers: h })
    if (!att.ok) return null
    data = (await att.json() as { data?: string }).data ?? null
  }
  return data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64') : null
}

async function viaAttachmentRow(filter: string): Promise<Buffer | null> {
  const [att] = await sbTry<{ filename: string; message_id: string }[]>(`email_attachments?${filter}&select=filename,message_id&limit=1`, [])
  if (!att) return null
  return messageAttachmentBytes(att.message_id, att.filename)
}

export async function attachmentRefBytes(ref: string): Promise<Buffer | null> {
  if (!ref) return null
  if (isDriveRef(ref)) return driveBytes(driveIdOf(ref))
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
