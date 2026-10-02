/**
 * The Pricing Matrix source folder on Google Drive.
 *
 * Every insurer calculator and brochure the rates are read from lives in one shared folder, laid out
 * as  <insurer>/<plan year>/<files>  — "QBE Steadfast MCare+/2026/Steadfast Calculator v20052026.xlsx".
 * Insurers reissue once a plan year; a broker drops the new file in a new year folder, and the
 * Pricing Matrix shows it as not yet read.
 *
 * Read with the ai-engagement@trs-ai-project service account, from GOOGLE_TRS_DRIVE_SA_JSON and
 * nothing else. The app's older GOOGLE_SERVICE_ACCOUNT_JSON belongs to a different organisation's
 * project, and client documents are not read through it.
 */
import { createSign } from 'node:crypto'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export type SourceKind = 'calculator' | 'brochure' | 'workbook' | 'other'

export type SourceFile = {
  driveFileId: string
  insurer: string            // the insurer folder's name
  planYear: string | null    // the year folder's name, when it is one
  filename: string
  mimeType: string
  kind: SourceKind
  bytes: number | null
  /** Drive's own checksum of the content, which is how a changed file is recognised. */
  md5: string | null
  modifiedAt: string | null
  webViewLink: string | null
}

const b64url = (b: Buffer | string) =>
  (Buffer.isBuffer(b) ? b : Buffer.from(b)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

let cached: { token: string; exp: number } | null = null

export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_TRS_DRIVE_SA_JSON && !!process.env.GOOGLE_TRS_DRIVE_FOLDER_ID
}

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const raw = process.env.GOOGLE_TRS_DRIVE_SA_JSON
  if (!raw) throw new Error('GOOGLE_TRS_DRIVE_SA_JSON is not set')
  const creds = JSON.parse(raw) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: creds.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  })
  const d = await res.json() as { access_token?: string; expires_in?: number; error_description?: string }
  if (!d.access_token) throw new Error(`Drive sign-in failed: ${d.error_description ?? res.status}`)
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 }
  return d.access_token
}

type DriveItem = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime?: string; webViewLink?: string }

async function children(folderId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime,webViewLink)',
      pageSize: '200', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await fetch(`${DRIVE}/files?${params}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
    const d = await res.json() as { files?: DriveItem[]; nextPageToken?: string }
    out.push(...(d.files ?? []))
    pageToken = d.nextPageToken
  } while (pageToken)
  return out
}

/** What a file is, from its name and type. A calculator is a spreadsheet; TRS's own comparison
 *  workbooks sit in folders starting "_" and are read as workbooks, not as an insurer's calculator. */
export function kindOf(filename: string, mimeType: string, insurerFolder: string): SourceKind {
  const sheet = /\.(xlsx|xlsm|xls)$/i.test(filename) || mimeType.includes('spreadsheet')
  if (insurerFolder.startsWith('_') && sheet) return 'workbook'
  if (sheet) return 'calculator'
  if (/\.pdf$/i.test(filename) || mimeType === 'application/pdf') return 'brochure'
  return 'other'
}

/** Every file under the root, as insurer / plan year / file. Files placed directly in an insurer
 *  folder (no year folder) are kept, with planYear null, so nothing in the folder goes unseen. */
export async function listSourceFiles(rootId = process.env.GOOGLE_TRS_DRIVE_FOLDER_ID ?? ''): Promise<SourceFile[]> {
  if (!rootId) throw new Error('GOOGLE_TRS_DRIVE_FOLDER_ID is not set')
  const toFile = (f: DriveItem, insurer: string, planYear: string | null): SourceFile => ({
    driveFileId: f.id, insurer, planYear, filename: f.name, mimeType: f.mimeType,
    kind: kindOf(f.name, f.mimeType, insurer), bytes: f.size ? Number(f.size) : null,
    md5: f.md5Checksum ?? null, modifiedAt: f.modifiedTime ?? null, webViewLink: f.webViewLink ?? null,
  })
  const out: SourceFile[] = []
  for (const ins of (await children(rootId)).filter(x => x.mimeType === FOLDER_MIME)) {
    for (const item of await children(ins.id)) {
      if (item.mimeType === FOLDER_MIME) {
        for (const f of (await children(item.id)).filter(x => x.mimeType !== FOLDER_MIME)) out.push(toFile(f, ins.name, item.name))
      } else {
        out.push(toFile(item, ins.name, null))
      }
    }
  }
  return out.sort((a, b) => a.insurer.localeCompare(b.insurer) || (b.planYear ?? '').localeCompare(a.planYear ?? '') || a.filename.localeCompare(b.filename))
}

export async function downloadSourceFile(driveFileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
