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

/**
 * The staff roster as it stood at migration, keyed by email. app_users is the source of truth,
 * but it exists only in Cloud SQL, so during the cutover a deploy that still points at the old
 * database would otherwise lock everyone out. This makes the order of those two steps not
 * matter. Add new staff to app_users, not here.
 */
const ROSTER: Record<string, { id: string; name: string | null }> = {
  'angela@trade-risksol.com': { id: '5c011455-26d9-41e7-bb1e-4da0369c7a35', name: "Angela Lu" },
  'catherine.lim@trade-risksol.com': { id: 'f5538b04-a743-496e-ad3c-7d611832f147', name: "Catherine Lim" },
  'chengsou.tan@trade-risksol.com': { id: 'c3e9d999-4811-464e-bd4b-391116ec6643', name: "Cheng Sou Tan" },
  'developer@trade-risksol.com': { id: '752ea3c0-0f4a-4fc6-8a40-bdb4efcd586a', name: "Jarod Hong" },
  'hasya@trade-risksol.com': { id: '74c380ec-337b-4338-a8e5-8ca819e92b53', name: "Hasya Hasnizam" },
  'ken.zeng@trade-risksol.com': { id: '484c30f2-416d-40ad-be8d-a6aa109ad567', name: "Ken Zeng" },
  'nathan.budiutomo@trade-risksol.com': { id: 'ad105816-610c-4058-96eb-d23eb485cac0', name: "Nathan Budiutomo" },
  'operations@trade-risksol.com': { id: '6669980a-7e54-41f6-aa5a-cd8206f4f25e', name: "Operations Team" },
}

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
    if (rows[0]) return rows[0]
  } catch { /* fall through to the roster */ }
  const known = ROSTER[email.toLowerCase()]
  return known ? { id: known.id, email: email.toLowerCase(), name: known.name } : null
}
