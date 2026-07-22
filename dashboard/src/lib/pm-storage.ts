/**
 * Pricing Matrix — shared Supabase helpers (storage + REST) for the calculator routes.
 * Reuses the proven private `group-benefits` bucket so uploaded files persist exactly like the
 * existing rate-table PDFs do.
 */
export const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
export const BUCKET = 'group-benefits'

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

/** Sign a short-lived read URL for a stored object; returns the full fetchable URL. */
export async function signRead(path: string, expiresIn = 300): Promise<string> {
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST', headers: sbH(), body: JSON.stringify({ expiresIn }),
  })
  if (!res.ok) throw new Error(`sign failed: ${(await res.text()).slice(0, 200)}`)
  const signed = (await res.json() as { signedURL?: string }).signedURL
  return `${SB_URL}/storage/v1${signed}`
}

export const bareObjectPath = (path: string) => `${SB_URL}/storage/v1/object/${BUCKET}/${path}`
