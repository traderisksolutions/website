import { SB_URL } from '@/lib/sb'

// Generic reader for the app_settings key/value table (see e.g. `reply_from_email`,
// used by outbound campaign launch). Failures fall back rather than throw — a missing
// or unreadable setting should never break the caller.
export async function getAppSetting(key: string, fallback: string): Promise<string> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return fallback
    const res = await fetch(
      `${SB_URL}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    const val  = Array.isArray(rows) ? rows[0]?.value : null
    return (typeof val === 'string' && val.length > 0) ? val : fallback
  } catch {
    return fallback
  }
}
