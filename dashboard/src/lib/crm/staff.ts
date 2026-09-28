/**
 * Who works here. There is no staff table — employee_profiles holds tokens, not names — so the
 * directory is everyone who has signed in and done something, read from the audit log. That
 * is exactly the set of people a task can be handed to.
 */
import { sbTry, TRS_DOMAINS, emailDomain } from './db'

export interface StaffMember {
  email: string
  name: string
  /** Actions in the audit log — a rough "how active" for ordering the picker. */
  actions: number
}

type Row = { user_email: string | null; user_name: string | null }

let cache: { at: number; staff: StaffMember[] } | null = null

export async function listStaff(): Promise<StaffMember[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.staff
  const rows = await sbTry<Row[]>(`audit_logs?select=user_email,user_name&order=created_at.desc&limit=3000`, [])
  const by = new Map<string, StaffMember>()
  for (const r of rows) {
    const email = (r.user_email ?? '').toLowerCase().trim()
    if (!email || !TRS_DOMAINS.has(emailDomain(email))) continue
    const cur = by.get(email) ?? { email, name: r.user_name?.trim() || email.split('@')[0], actions: 0 }
    cur.actions += 1
    if (!cur.name && r.user_name) cur.name = r.user_name
    by.set(email, cur)
  }
  const staff = Array.from(by.values()).sort((a, b) => a.name.localeCompare(b.name))
  cache = { at: Date.now(), staff }
  return staff
}

export function staffName(email: string | null | undefined, staff: StaffMember[]): string | null {
  if (!email) return null
  return staff.find(s => s.email === email.toLowerCase())?.name ?? email.split('@')[0]
}
