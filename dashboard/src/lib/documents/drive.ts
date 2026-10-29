/**
 * Files a data-room document in Drive:
 *
 *   <root>/<Company>/Policies/<2026–27 Goods in Transit · Great Eastern>/<Cover>/<file>
 *   <root>/<Company>/To sort/<file>                       (no policy yet)
 *
 * <root> is the folder debit notes already archive into, so a company keeps one folder. The bytes
 * come from Gmail (the old attachment store is gone since the database moved to Cloud SQL) or
 * from the upload itself.
 */
import { getDriveWriteToken, findOrCreateFolder, getFolderWebLink, rootFolderId, uploadFileToDrive, folderIdFromUrl } from '@/lib/gdrive-write'
import { getGmailToken } from '@/lib/gmail-send'
import { docGroup, documentFileName, policyFolderName } from './taxonomy'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number }; parts?: Part[] }

function findPart(p: Part | undefined, filename: string): Part | null {
  if (!p) return null
  if (p.filename && p.filename === filename && p.body?.attachmentId) return p
  for (const c of p.parts ?? []) { const hit = findPart(c, filename); if (hit) return hit }
  return null
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
  policy: { id: string; label: string | null; class_of_insurance: string | null; insurer: string | null; policy_number: string | null; start_date: string | null; drive_folder_url: string | null } | null
  doc: { doc_type: string; filename: string; received_at: string | null; insurer_name: string | null; mime_type: string | null }
}

/** Uploads the bytes; returns the file, its link, and the policy folder's link when one was made. */
export async function fileToDrive(t: FileTarget, bytes: Buffer): Promise<{ fileId: string; url: string; policyFolderUrl: string | null }> {
  const token = await getDriveWriteToken()
  const companyId = await findOrCreateFolder(t.companyName.trim(), rootFolderId(), token)
  let parent: string
  let policyFolderUrl: string | null = null
  if (t.policy) {
    let policyFolder = folderIdFromUrl(t.policy.drive_folder_url)
    if (!policyFolder) {
      const policies = await findOrCreateFolder('Policies', companyId, token)
      policyFolder = await findOrCreateFolder(policyFolderName(t.policy), policies, token)
      policyFolderUrl = await getFolderWebLink(policyFolder, token)
    }
    parent = await findOrCreateFolder(docGroup(t.doc.doc_type), policyFolder, token)
  } else {
    parent = await findOrCreateFolder('To sort', companyId, token)
  }
  const fileId = await uploadFileToDrive(documentFileName(t.doc), t.doc.mime_type || 'application/octet-stream', bytes, parent, token)
  return { fileId, url: `https://drive.google.com/file/d/${fileId}/view`, policyFolderUrl }
}

/** Moves a filed document to another folder (a broker re-sorted it). */
export async function moveDriveFile(fileId: string, t: Omit<FileTarget, 'doc'> & { doc: FileTarget['doc'] }): Promise<{ policyFolderUrl: string | null }> {
  const token = await getDriveWriteToken()
  const companyId = await findOrCreateFolder(t.companyName.trim(), rootFolderId(), token)
  let parent: string
  let policyFolderUrl: string | null = null
  if (t.policy) {
    let policyFolder = folderIdFromUrl(t.policy.drive_folder_url)
    if (!policyFolder) {
      const policies = await findOrCreateFolder('Policies', companyId, token)
      policyFolder = await findOrCreateFolder(policyFolderName(t.policy), policies, token)
      policyFolderUrl = await getFolderWebLink(policyFolder, token)
    }
    parent = await findOrCreateFolder(docGroup(t.doc.doc_type), policyFolder, token)
  } else {
    parent = await findOrCreateFolder('To sort', companyId, token)
  }
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  const oldParents = meta.ok ? ((await meta.json()) as { parents?: string[] }).parents ?? [] : []
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${parent}&removeParents=${oldParents.join(',')}&supportsAllDrives=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: documentFileName(t.doc) }),
  })
  if (!res.ok) throw new Error(`Drive move failed: ${(await res.text()).slice(0, 200)}`)
  return { policyFolderUrl }
}
