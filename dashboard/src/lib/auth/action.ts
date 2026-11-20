/**
 * Server actions' own check (21 Nov 2026). The API gate in src/middleware.ts covers /api only, so
 * an action is not behind it: each one checks the session here, as withStaff does for a route.
 *
 *   export async function companyPolicies(id: string) {
 *     return staffAction('company policies', async () => listCompanyPolicies(id))
 *   }
 *
 * The page calls the action and reads `ok`: data on success, the error line otherwise, the same
 * text the route's 500 carried. Nothing is thrown across the boundary.
 */
import { staffUser, type StaffUser } from './guard'
import type { ActionResult } from '@/lib/action-result'

export async function staffAction<T>(label: string, fn: (user: StaffUser & { email: string }) => Promise<T>): Promise<ActionResult<T>> {
  const user = await staffUser()
  if (!user?.email) return { ok: false, error: 'Please sign in again.' }
  try {
    return { ok: true, data: await fn({ ...user, email: user.email.toLowerCase() }) }
  } catch (e) {
    console.error(`[action] ${label} failed`, e)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
