/**
 * Uploads into the Shared Drive, by folder. Replaces the Supabase buckets: every upload lands in
 * <folder>/<YYYY-MM>/ under the configured root and is referenced as `drivefile:<id>`.
 *
 * openDriveUpload: a resumable session the browser PUTs the file to (any size, past Vercel's
 *   ~4.5 MB request limit). storeUpload: a server-side write of bytes already in hand.
 */
import { randomUUID } from 'node:crypto'
import { getDriveWriteToken, findOrCreateFolder, rootFolderId, uploadFileToDrive } from '@/lib/gdrive-write'
import { driveRef } from '@/lib/storage/attachment-bytes'

/** The folders a browser may upload into. Anything else is refused. */
export const UPLOAD_FOLDERS = [
  'email-uploads', 'debit-note-uploads', 'group-benefits/rate-tables', 'group-benefits/calculators',
] as const
export type UploadFolder = typeof UPLOAD_FOLDERS[number]
export const isUploadFolder = (s: unknown): s is UploadFolder => typeof s === 'string' && (UPLOAD_FOLDERS as readonly string[]).includes(s)

const sanitise = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 150)
const uniqueName = (filename: string) => `${randomUUID().slice(0, 8)} ${sanitise(filename || 'file')}`

/** The month folder for an upload: <root>/<folder segments>/<YYYY-MM>. */
async function monthFolder(folder: string, token: string): Promise<string> {
  let parent = rootFolderId()
  for (const seg of folder.split('/').filter(Boolean)) parent = await findOrCreateFolder(seg, parent, token)
  return findOrCreateFolder(new Date().toISOString().slice(0, 7), parent, token)
}

/** Opens a resumable upload session. Returns the URL the browser PUTs the file to; Google answers
 *  that PUT with { id }. */
export async function openDriveUpload(opts: { folder: string; filename: string; mimeType?: string; size?: number; origin: string }): Promise<string> {
  const token = await getDriveWriteToken()
  const parent = await monthFolder(opts.folder, token)
  const type = opts.mimeType || 'application/octet-stream'
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type,
      ...(typeof opts.size === 'number' && opts.size > 0 ? { 'X-Upload-Content-Length': String(opts.size) } : {}), Origin: opts.origin,
    },
    body: JSON.stringify({ name: uniqueName(opts.filename), parents: [parent] }),
  })
  const uploadUrl = res.headers.get('location')
  if (!res.ok || !uploadUrl) throw new Error(`Drive would not open an upload: ${(await res.text()).slice(0, 200)}`)
  return uploadUrl
}

/** Writes bytes into <folder>/<YYYY-MM>/ and returns `drivefile:<id>`. Throws if Drive refuses. */
export async function storeUpload(folder: string, filename: string, mimeType: string, bytes: Buffer): Promise<string> {
  if (!bytes.length) throw new Error(`${filename} is empty`)
  const token = await getDriveWriteToken()
  const parent = await monthFolder(folder, token)
  const id = await uploadFileToDrive(uniqueName(filename), mimeType || 'application/octet-stream', bytes, parent, token)
  if (!id) throw new Error(`Drive returned no file id for ${filename}`)
  return driveRef(id)
}
