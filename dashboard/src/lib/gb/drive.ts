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
import { serviceAccountToken } from '@/lib/google/auth'

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

export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_TRS_DRIVE_SA_JSON && !!process.env.GOOGLE_TRS_DRIVE_FOLDER_ID
}

const token = () => serviceAccountToken('https://www.googleapis.com/auth/drive.readonly', 'trs')

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
  // Each level's folders are opened at once (21 Nov 2026: one folder after another took 9 s for 16 files).
  const insurers = (await children(rootId)).filter(x => x.mimeType === FOLDER_MIME)
  const out = (await Promise.all(insurers.map(async ins => {
    const items = await children(ins.id)
    const inYears = await Promise.all(items.filter(i => i.mimeType === FOLDER_MIME).map(async y =>
      (await children(y.id)).filter(x => x.mimeType !== FOLDER_MIME).map(f => toFile(f, ins.name, y.name))))
    return [...items.filter(i => i.mimeType !== FOLDER_MIME).map(f => toFile(f, ins.name, null)), ...inYears.flat()]
  }))).flat()
  return out.sort((a, b) => a.insurer.localeCompare(b.insurer) || (b.planYear ?? '').localeCompare(a.planYear ?? '') || a.filename.localeCompare(b.filename))
}

export async function downloadSourceFile(driveFileId: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** A Drive file's last change, one call. Null when it cannot be read. */
export async function fileModifiedTime(driveFileId: string): Promise<string | null> {
  const res = await fetch(`${DRIVE}/files/${encodeURIComponent(driveFileId)}?fields=modifiedTime&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${await token()}` }, cache: 'no-store' })
  if (!res.ok) return null
  const d = await res.json().catch(() => ({})) as { modifiedTime?: string }
  return d.modifiedTime ?? null
}
