/**
 * Debit Note — shared REST helpers and file storage. Files live in Drive: generated PDFs under
 * debit-notes/<companyId>/, imported files under debit-note-uploads/<YYYY-MM>/. The stored
 * reference is `drivefile:<id>`. Rows from before 29 Oct 2026 carry bare bucket paths whose bytes
 * were never stored (the TRS API answers every old storage path with 200 "trs api"); reads of those throw
 * NEVER_STORED.
 */
import { putObject } from '@/lib/storage/drive-store'
import { storeUpload } from '@/lib/storage/drive-upload'
import { getDriveWriteToken } from '@/lib/gdrive-write'
import { NEVER_STORED, driveIdOf, driveRef, driveWebLink, isDriveRef, requireRefBytes } from '@/lib/storage/attachment-bytes'

export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'

/** debit_note_no is "DN260805" — no space, since 30 Sep 2026. Kept as a guard anyway so
 *  file names stay free of spaces. Historical rows and hand-typed overrides can still carry one. */
export const storageKeySegment = (s: string) => s.replace(/\s+/g, '')

export function serviceKey(): string {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return k
}

/** PostgREST headers (service key). */
export function sbH(prefer = 'return=representation'): Record<string, string> {
  const k = serviceKey()
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

/** Writes a generated or re-uploaded debit-note PDF to Drive at debit-notes/<path>, replacing
 *  the file already at that path. Returns the reference to store: `drivefile:<id>`. */
export async function uploadPdf(path: string, bytes: Buffer): Promise<string> {
  if (!bytes.length) throw new Error('PDF upload failed: no bytes')
  return driveRef(await putObject(`debit-notes/${path}`, bytes, 'application/pdf'))
}

/** An imported file (bulk PDF import, OneDrive, zip member) into debit-note-uploads/<YYYY-MM>/. */
export const storeImportFile = (filename: string, bytes: Buffer, mimeType = 'application/pdf') =>
  storeUpload('debit-note-uploads', filename, mimeType, bytes)

/** The link a browser opens for a stored file: its Drive page. Throws NEVER_STORED for a legacy
 *  bucket path, whose bytes were never stored. */
export async function signRead(ref: string): Promise<string> {
  const link = driveWebLink(ref)
  if (!link) throw new Error(NEVER_STORED)
  return link
}

/** A stored file's bytes. Throws NEVER_STORED when they cannot be had. */
export const downloadObject = (ref: string): Promise<Buffer> => requireRefBytes(ref)

/** Best-effort removal of a stored file (moved to Drive trash). Legacy paths have nothing to
 *  remove. Never throws. */
export async function deleteObject(ref: string | null | undefined): Promise<void> {
  if (!isDriveRef(ref)) return
  try {
    const token = await getDriveWriteToken()
    // Content Manager can trash but not permanently delete on a Shared Drive.
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveIdOf(ref))}?supportsAllDrives=true`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  } catch { /* best effort */ }
}
