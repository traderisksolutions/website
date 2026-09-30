/**
 * File store backed by Google Drive rather than Supabase Storage.
 *
 * Debit note paperwork already lived in Drive; this makes Drive the only home for it, which is
 * what was asked. A "path" like `debit-notes/<companyId>/DN260401.pdf` becomes nested folders
 * under the configured root, so the archive stays browsable by a person.
 */
import { getDriveWriteToken, findOrCreateFolder, uploadFileToDrive, rootFolderId } from '@/lib/gdrive-write'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

/** Walks/creates the folder chain for everything but the last path segment. */
async function folderFor(path: string, token: string): Promise<{ parent: string; name: string }> {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop() ?? 'file'
  let parent = rootFolderId()
  for (const seg of parts) parent = await findOrCreateFolder(seg, parent, token)
  return { parent, name }
}

async function findFile(name: string, parent: string, token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`)
  const r = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const j = await r.json() as { files?: { id: string }[] }
  return j.files?.[0]?.id ?? null
}

export async function putObject(path: string, bytes: Buffer, mimeType = 'application/pdf'): Promise<string> {
  const token = await getDriveWriteToken()
  const { parent, name } = await folderFor(path, token)
  const existing = await findFile(name, parent, token)
  if (existing) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media&supportsAllDrives=true`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType }, body: bytes as unknown as BodyInit })
    if (!r.ok) throw new Error(`Drive update failed: ${(await r.text()).slice(0, 200)}`)
    return existing
  }
  return uploadFileToDrive(name, mimeType, bytes, parent, token)
}

export async function getObject(path: string): Promise<Buffer> {
  const token = await getDriveWriteToken()
  const { parent, name } = await folderFor(path, token)
  const id = await findFile(name, parent, token)
  if (!id) throw new Error(`not found in Drive: ${path}`)
  const r = await fetch(`${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`Drive download failed: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

export async function deleteObject(path: string): Promise<void> {
  try {
    const token = await getDriveWriteToken()
    const { parent, name } = await folderFor(path, token)
    const id = await findFile(name, parent, token)
    if (!id) return
    // Content Manager can trash but not permanently delete on a Shared Drive.
    await fetch(`${DRIVE_API}/files/${id}?supportsAllDrives=true`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  } catch { /* best effort */ }
}
