// Read-only access to the SEPARATE roadplus Supabase project (ap-northeast-1),
// so the dashboard can show RoadPlus+ payment reconciliation + journey traces
// without moving data. The roadplus app owns/writes that DB; we only read it.
//
// Configure on the dashboard's Vercel project:
//   ROADPLUS_SUPABASE_URL          = https://<roadplus-ref>.supabase.co
//   ROADPLUS_SUPABASE_SERVICE_KEY  = <roadplus project service_role key>

export const RP_SB_URL = process.env.ROADPLUS_SUPABASE_URL || ''

export function rpConfigured(): boolean {
  return !!(process.env.ROADPLUS_SUPABASE_URL && process.env.ROADPLUS_SUPABASE_SERVICE_KEY)
}

function rpHeaders(): Record<string, string> {
  const k = process.env.ROADPLUS_SUPABASE_SERVICE_KEY
  if (!k) throw new Error('ROADPLUS_SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

/** GET against the roadplus PostgREST endpoint. `path` is everything after /rest/v1/. */
export async function rpGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${RP_SB_URL}/rest/v1/${path}`, {
    headers: rpHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`roadplus db ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}
