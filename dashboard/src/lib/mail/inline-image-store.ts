/**
 * Stores inline email images in Drive (email-images/stored/<YYYY-MM>/<hash>.<ext>) and returns the
 * signed link to /api/public/email-image. Server only. Used by mail ingest and by
 * scripts/move-inline-images.ts. The same image (a signature logo) within one month folder is
 * stored once: the file is named by its hash and looked up before an upload.
 */
import { getDriveWriteToken, findOrCreateFolder, rootFolderId, uploadFileToDrive } from '@/lib/gdrive-write'
import { emailImageUrl, planInline, replaceDataUris, imageHash, sniffImage, INLINE_MAX_BYTES } from '@/lib/mail/inline-images'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const STORED_FOLDER = 'stored'

let token: { value: string; until: number } | null = null
async function driveToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value
  token = { value: await getDriveWriteToken(), until: Date.now() + 45 * 60_000 }
  return token.value
}

const folders = new Map<string, string>()
/** email-images/stored/<YYYY-MM>, created on first use. */
async function monthFolder(t: string, month = new Date().toISOString().slice(0, 7)): Promise<string> {
  const hit = folders.get(month)
  if (hit) return hit
  const images = await findOrCreateFolder('email-images', rootFolderId(), t)
  const stored = await findOrCreateFolder(STORED_FOLDER, images, t)
  const id = await findOrCreateFolder(month, stored, t)
  folders.set(month, id)
  return id
}

const known = new Map<string, string>()   // hash → Drive id, for this process
async function existing(name: string, parent: string, t: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and '${parent}' in parents and trashed=false`)
  const r = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) return null
  const j = await r.json() as { files?: { id: string }[] }
  return j.files?.[0]?.id ?? null
}

/** Puts the image in Drive (or finds it there) and returns its Drive id. Throws when Drive refuses. */
export async function storeInlineImage(bytes: Buffer, ext: string, mime: string, hash = imageHash(bytes)): Promise<string> {
  const hit = known.get(hash)
  if (hit) return hit
  const t = await driveToken()
  const parent = await monthFolder(t)
  const name = `${hash}.${ext}`
  const id = await existing(name, parent, t) ?? await uploadFileToDrive(name, mime, bytes, parent, t)
  if (!id) throw new Error('Drive returned no file id')
  known.set(hash, id)
  return id
}

/** Stores raw image bytes (a cid: part) and returns the signed link, or null when the bytes are not
 *  a raster image, are too large, or Drive refuses. */
export async function linkForImageBytes(bytes: Buffer): Promise<string | null> {
  const kind = sniffImage(bytes)
  if (!kind || bytes.length > INLINE_MAX_BYTES) return null
  try { return emailImageUrl(await storeInlineImage(bytes, kind.ext, kind.mime)) } catch { return null }
}

/** body_html with every movable data: URI replaced by a signed link. A URI Drive refuses stays as
 *  it is (nothing is lost; the one-time job can move it later). */
export async function moveDataUris(html: string): Promise<string> {
  if (!html || !/data:image/i.test(html)) return html
  const links = new Map<string, string>()
  for (const img of planInline(html).move) {
    try { links.set(img.raw, emailImageUrl(await storeInlineImage(img.bytes, img.ext, img.mime, img.hash))) } catch { /* left inline */ }
  }
  return links.size ? replaceDataUris(html, links) : html
}
