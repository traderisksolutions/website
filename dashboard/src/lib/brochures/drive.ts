/**
 * The brochure library's Drive writes: the version folder and a resumable upload into it. The root
 * is the Pricing Matrix source folder (GOOGLE_TRS_DRIVE_FOLDER_ID), written with the TRS service
 * account. Employment Benefits products sit at <root>/<product>/<version>, where the Pricing Matrix
 * reads them; other lines at <root>/_Lines/<line>/<product>/<version>, which it skips.
 * Nothing here deletes a Drive file.
 */
import { findOrCreateFolder, getDriveWriteToken } from '@/lib/gdrive-write'
import { folderName, type BrochureLine } from './library'

export function brochureRoot(): string {
  const id = process.env.GOOGLE_TRS_DRIVE_FOLDER_ID
  if (!id) throw new Error('GOOGLE_TRS_DRIVE_FOLDER_ID is not set')
  return id
}

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`

/** Finds or creates the version folder. */
export async function versionFolder(line: BrochureLine, product: string, version: string, inForce: string): Promise<{ id: string; url: string }> {
  const token = await getDriveWriteToken()
  let parent = brochureRoot()
  if (line !== 'Employment Benefits') parent = await findOrCreateFolder(line, await findOrCreateFolder('_Lines', parent, token), token)
  const id = await findOrCreateFolder(folderName(version, inForce), await findOrCreateFolder(product, parent, token), token)
  return { id, url: folderUrl(id) }
}

const sanitise = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 150) || 'file'

/** A resumable upload session into folderId: the browser PUTs the file there (any size); Google answers { id }. */
export async function openUploadInto(folderId: string, opts: { filename: string; mimeType?: string; size?: number; origin: string }): Promise<string> {
  const token = await getDriveWriteToken()
  const type = opts.mimeType || 'application/octet-stream'
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type,
      ...(typeof opts.size === 'number' && opts.size > 0 ? { 'X-Upload-Content-Length': String(opts.size) } : {}), Origin: opts.origin,
    },
    body: JSON.stringify({ name: sanitise(opts.filename), parents: [folderId] }),
  })
  const url = res.headers.get('location')
  if (!res.ok || !url) throw new Error(`Drive would not open an upload: ${(await res.text()).slice(0, 200)}`)
  return url
}
