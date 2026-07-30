/**
 * Google Drive write access — folder creation + file upload, for archiving debit-note
 * documents. Reuses the same service-account credentials (GOOGLE_SERVICE_ACCOUNT_JSON) as the
 * existing read-only helpers (src/lib/gdrive.ts, gdrive-knowledge.ts), just with the `drive`
 * (write) scope instead of `drive.readonly` — the JWT-signing technique itself mirrors
 * gdrive-knowledge.ts's getServiceAccountToken().
 *
 * Setup required (one-time, not code): create a root "Debit Notes" folder in Google Drive,
 * share it with this service account's client_email as Editor, and set
 * GDRIVE_DEBIT_NOTES_ROOT_FOLDER_ID to that folder's id.
 */
import { createSign } from 'node:crypto'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function b64url(input: string | Buffer): string {
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function getDriveWriteToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(raw) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(creds.private_key))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Drive auth failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

export function rootFolderId(): string {
  const id = process.env.GDRIVE_DEBIT_NOTES_ROOT_FOLDER_ID
  if (!id) throw new Error('GDRIVE_DEBIT_NOTES_ROOT_FOLDER_ID not set')
  return id
}

/** Finds a folder by exact name under parentId, or creates it. Returns the folder id. */
export async function findOrCreateFolder(name: string, parentId: string, token: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'")
  const q = encodeURIComponent(`name='${escaped}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`)
  const listRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const listData = await listRes.json()
  const existing = listData.files?.[0]?.id as string | undefined
  if (existing) return existing

  const createRes = await fetch(`${DRIVE_API}/files?fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${await createRes.text()}`)
  const created = await createRes.json()
  return created.id as string
}

export async function getFolderWebLink(folderId: string, token: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${folderId}?fields=webViewLink`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  return data.webViewLink as string
}

/** Uploads a file into parentId (multipart: metadata + content). Returns the file id. */
export async function uploadFileToDrive(name: string, mimeType: string, bytes: Buffer, parentId: string, token: string): Promise<string> {
  const boundary = `trs_drive_${Date.now()}`
  const meta = JSON.stringify({ name, parents: [parentId] })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

/** Convenience: ensure companyName/policyLabel folders exist under the configured root, upload
 *  every given file into the policy folder, and return the policy folder's web link. */
export async function archiveDebitNoteToDrive(
  companyName: string, policyLabel: string,
  files: { name: string; mimeType: string; bytes: Buffer }[],
): Promise<string> {
  const token = await getDriveWriteToken()
  const companyFolderId = await findOrCreateFolder(companyName, rootFolderId(), token)
  const policyFolderId = await findOrCreateFolder(policyLabel, companyFolderId, token)
  for (const f of files) {
    await uploadFileToDrive(f.name, f.mimeType, f.bytes, policyFolderId, token)
  }
  return getFolderWebLink(policyFolderId, token)
}
