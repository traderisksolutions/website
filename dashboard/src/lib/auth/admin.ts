/**
 * Administrator, the one role TRS has (21 Nov 2026). It was checked in five Settings routes, each
 * with its own copy of this query; the Settings actions and can() read it here.
 */
import { db, one } from '@/lib/db/client'

export async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const row = await one<{ is_admin: boolean | null }>('Administrator check',
    db().from('employee_profiles').select('is_admin').eq('user_id', userId).limit(1).maybeSingle())
  return row?.is_admin === true
}
