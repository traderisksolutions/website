/**
 * Files a data-room document in Drive, in the one tree for every line (src/lib/filing/tree.ts):
 *
 *   <root>/<Group>/<Line>/<2026–27 · Great Eastern>/<Census|Policy|Billing|Quotes|Claims|Other>/<file>
 *   <root>/<Group>/To sort/<file>                         (no policy yet)
 *
 * <Group> is the top of the client's group (companies.parent_id), so every entity of a group
 * shares one folder; a standalone client is its own group.
 *
 * <root> is the folder debit notes already archive into, so a company keeps one folder. The bytes
 * come from Gmail (the old attachment store is gone since the database moved to Cloud SQL) or
 * from the upload itself.
 */
import { getDriveWriteToken, findOrCreateFolder, getFolderWebLink, rootFolderId, uploadFileToDrive, folderIdFromUrl } from '@/lib/gdrive-write'
import { getGmailToken } from '@/lib/gmail-send'
import { documentFileName } from './taxonomy'
import { filingPath } from '@/lib/filing/tree'
import { sbTry, enc } from '@/lib/crm/db'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: Part[] }

function findPart(p: Part | undefined, filename: string): Part | null {
  if (!p) return null
  if (p.filename && p.filename === filename && p.body?.attachmentId) return p
  for (const c of p.parts ?? []) { const hit = findPart(c, filename); if (hit) return hit }
  return null
}

/** The data-room folder name for a company: the name of the top of its group. */
export async function groupFolderName(companyId: string, fallback: string): Promise<string> {
  let id = companyId, name = fallback
  for (let i = 0; i < 5; i++) {
    const [c] = await sbTry<{ company_name: string | null; parent_id: string | null }[]>(`companies?id=eq.${enc(id)}&select=company_name,parent_id&limit=1`, [])
    if (!c) break
    if (c.company_name) name = c.company_name
    if (!c.parent_id || c.parent_id === id) break
    id = c.parent_id
  }
  return name.replace(/[\/\\]/g, '-').trim() || fallback
}

/** The attachment's bytes, fetched again from Gmail by message id and filename. */
export async function attachmentBytes(gmailMessageId: string, filename: string): Promise<Buffer> {
  const token = await getGmailToken()
  const msg = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(gmailMessageId)}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
  if (!msg.ok) throw new Error(`Gmail message ${msg.status}: ${(await msg.text()).slice(0, 200)}`)
  const part = findPart((await msg.json() as { payload?: Part }).payload, filename)
  if (!part?.body?.attachmentId) throw new Error(`"${filename}" is no longer on the Gmail message`)
  const att = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(gmailMessageId)}/attachments/${part.body.attachmentId}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!att.ok) throw new Error(`Gmail attachment ${att.status}`)
  const data = (await att.json() as { data?: string }).data
  if (!data) throw new Error('Gmail returned an empty attachment')
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export type FileTarget = {
  companyName: string
  policy: { id: string; label: string | null; class_of_insurance: string | null; insurer: string | null; policy_number: string | null; start_date: string | null; drive_folder_url: string | null; line_code?: string | null; is_eb?: boolean | null; product_line?: string | null } | null
  doc: { doc_type: string; filename: string; received_at: string | null; insurer_name: string | null; mime_type: string | null }
}

/** Creates (or finds) every folder of the document's path; returns the last one and the policy's plan-year folder. */
async function ensurePath(t: FileTarget, token: string): Promise<{ parent: string; policyFolderUrl: string | null }> {
  const segments = filingPath({ group: t.companyName, policy: t.policy, docType: t.doc.doc_type })
  let parent = rootFolderId()
  let policyFolderUrl: string | null = null
  for (const [i, name] of segments.entries()) {
    parent = await findOrCreateFolder(name, parent, token)
    // <Group>/<Line>/<Plan year · Insurer>: the policy's folder, linked from the policy.
    if (t.policy && i === 2 && folderIdFromUrl(t.policy.drive_folder_url) !== parent) policyFolderUrl = await getFolderWebLink(parent, token)
  }
  return { parent, policyFolderUrl }
}

/** Uploads the bytes; returns the file, its link, and the policy folder's link when it changed. */
export async function fileToDrive(t: FileTarget, bytes: Buffer): Promise<{ fileId: string; url: string; policyFolderUrl: string | null }> {
  const token = await getDriveWriteToken()
  const { parent, policyFolderUrl } = await ensurePath(t, token)
  const fileId = await uploadFileToDrive(documentFileName(t.doc), t.doc.mime_type || 'application/octet-stream', bytes, parent, token)
  return { fileId, url: `https://drive.google.com/file/d/${fileId}/view`, policyFolderUrl }
}

/** Moves a filed document to the folder its company, policy and type now name. Same file id, same link. */
export async function moveDriveFile(fileId: string, t: FileTarget): Promise<{ policyFolderUrl: string | null; moved: boolean; from: string[]; to: string }> {
  const token = await getDriveWriteToken()
  const { parent, policyFolderUrl } = await ensurePath(t, token)
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents,name&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (!meta.ok) throw new Error(`Drive file ${meta.status}: ${(await meta.text()).slice(0, 200)}`)
  const m = (await meta.json()) as { parents?: string[]; name?: string }
  const oldParents = (m.parents ?? []).filter(p => p !== parent)
  const name = documentFileName(t.doc)
  if (!oldParents.length && m.name === name) return { policyFolderUrl, moved: false, from: [], to: parent }
  const move = oldParents.length ? `&addParents=${parent}&removeParents=${oldParents.join(',')}` : ''
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true${move}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Drive move failed: ${(await res.text()).slice(0, 200)}`)
  return { policyFolderUrl, moved: true, from: oldParents, to: parent }
}
