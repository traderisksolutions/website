/**
 * One Drive folder per client group — the same folder debit notes already archive into
 * (GDRIVE_DEBIT_NOTES_ROOT_FOLDER_ID / <group name>). Employment benefits paperwork goes in an
 * "Employment Benefits" folder inside it: the Employment Benefits line of the one filing tree
 * (src/lib/filing/tree.ts), so a group's documents sit under one folder.
 *
 * Keyed on the company name, matched case-insensitively by findOrCreateFolder, exactly as the
 * debit-note archive does, so both land in the same folder.
 */
import { waitUntil } from '@vercel/functions'
import { getDriveWriteToken, findOrCreateFolder, getFolderWebLink, rootFolderId } from '@/lib/gdrive-write'
import { logError } from '@/lib/error-log'
import { groupFolderName } from '@/lib/documents/drive'

export const EB_SUBFOLDER = 'Employment Benefits'

/** Finds or creates the company folder (and the subfolder, when given); returns its web link. */
export async function ensureCompanyFolder(companyName: string, subfolder?: string): Promise<string> {
  const name = companyName.trim()
  if (!name) throw new Error('Company name is required')
  const token = await getDriveWriteToken()
  let folderId = await findOrCreateFolder(name, rootFolderId(), token)
  if (subfolder) folderId = await findOrCreateFolder(subfolder, folderId, token)
  return getFolderWebLink(folderId, token)
}

/** The EB source folder (insurer brochures, calculators, TRS workbooks), or null when not set. */
export function ebSourceFolderUrl(): string | null {
  const id = process.env.GOOGLE_TRS_DRIVE_FOLDER_ID
  return id ? `https://drive.google.com/drive/folders/${id}` : null
}

/**
 * Every new employment benefits company gets its folder: called when a quote or an HR link is
 * created. Runs after the response (waitUntil) and never fails the request; a Drive error is logged.
 */
export function fileEbCompanyFolder(companyName: string | null | undefined, companyId?: string | null): void {
  const name = (companyName ?? '').trim()
  if (!name || name === 'Untitled quote') return
  // A group's entities share the group's folder (documents/drive.ts groupFolderName).
  const folder = companyId ? groupFolderName(companyId, name) : Promise.resolve(name)
  waitUntil(folder.then(f => ensureCompanyFolder(f, EB_SUBFOLDER)).then(() => undefined).catch(e =>
    logError({ source: 'gdrive', feature: 'eb_company_folder', message: e instanceof Error ? e.message : String(e), metadata: { company: name } })))
}
