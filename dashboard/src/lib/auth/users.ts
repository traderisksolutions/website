/**
 * Staff lookup.
 *
 * The session must carry the user's original id, not Google's numeric `sub`. Chat threads,
 * drafts, board tasks and audit rows all reference the ids that came from Supabase Auth, and
 * several of those columns are typed uuid. Reusing them keeps every historical record attached
 * to the right person and is also a second allow-list: an address outside app_users cannot
 * hold a session even if it is on the TRS domain.
 */
export interface StaffUser { id: string; email: string; name: string | null }

export async function lookupStaff(email: string): Promise<StaffUser | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_KEY
  if (!base || !key) return null
  try {
    const res = await fetch(
      `${base}/rest/v1/app_users?email=eq.${encodeURIComponent(email.toLowerCase())}&active=is.true&select=id,email,name&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (!res.ok) return null
    const rows = await res.json() as StaffUser[]
    return rows[0] ?? null
  } catch { return null }
}
