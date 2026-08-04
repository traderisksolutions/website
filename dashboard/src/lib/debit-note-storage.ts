/**
 * Debit Note — shared Supabase helpers (storage + REST). Mirrors src/lib/pm-storage.ts's
 * shape for a dedicated private bucket that holds both generated (Generate Debit Note) and
 * uploaded (bulk PDF import) debit-note PDFs.
 */
export const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
export const BUCKET  = 'debit-notes'

/** debit_note_no is "DN 260805" (space, for display/PDF/email) — a raw space in a storage
 *  object key isn't URL-encoded by the plain template-string fetch() calls this file uses, and
 *  can break the upload the same way bracket-filled insurer filenames did. Strip whitespace
 *  only when building the actual storage key; keep the spaced string everywhere it's shown to
 *  a person (PDF, filename metadata, email subject). */
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

/** Storage headers (service key, no content-type). */
export function stH(): Record<string, string> {
  const k = serviceKey()
  return { apikey: k, Authorization: `Bearer ${k}` }
}

/** Ensure the (private) bucket exists — idempotent, ignores "already exists". */
export async function ensureBucket(): Promise<void> {
  await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { ...stH(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).catch(() => {})
}

/** Upload a generated/re-uploaded PDF buffer server-side; returns the bare storage path. */
export async function uploadPdf(path: string, bytes: Buffer): Promise<void> {
  await ensureBucket()
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...stH(), 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes as unknown as BodyInit,
  })
  if (!res.ok) throw new Error(`PDF upload failed: ${(await res.text()).slice(0, 300)}`)
}

/** Sign a short-lived read URL for a stored object; returns the full fetchable URL. */
export async function signRead(path: string, expiresIn = 3600): Promise<string> {
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: sbH(), body: JSON.stringify({ expiresIn }),
  })
  if (!res.ok) throw new Error(`sign failed: ${(await res.text()).slice(0, 200)}`)
  const signed = (await res.json() as { signedURL?: string }).signedURL
  return `${SB_URL}/storage/v1${signed}`
}

export const bareObjectPath = (path: string) => `${SB_URL}/storage/v1/object/${BUCKET}/${path}`

/** Downloads a stored object's raw bytes (service key — private bucket). */
export async function downloadObject(path: string): Promise<Buffer> {
  const res = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: stH() })
  if (!res.ok) throw new Error(`Download failed: ${(await res.text()).slice(0, 300)}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Best-effort cleanup of a temp object (e.g. an uploaded zip once it's been unpacked). Never throws. */
export async function deleteObject(path: string): Promise<void> {
  await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: sbH(), body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => {})
}
