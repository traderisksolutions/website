/**
 * The team roster, from the one place every account lives: Supabase Auth, joined with
 * employee_profiles for the administrator flag and connected Gmail.
 *
 *   GET   → everyone on the TRS domains: name, email, role, status, joined, last sign-in
 *   POST  → invite by email (administrators only); Supabase sends the invitation
 *   PATCH → change a role or suspend / reactivate (administrators only, never yourself)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { logActivity } from '@/lib/log-activity'

type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; invited_at: string | null; confirmed_at: string | null; banned_until: string | null; user_metadata: Record<string, unknown> | null }
type ProfileRow = { user_id: string; is_admin: boolean | null; gmail_email: string | null }

export type TeamUser = {
  id: string; email: string; name: string; role: 'administrator' | 'staff'; status: 'active' | 'invited' | 'suspended'
  joinedAt: string; lastSignInAt: string | null; gmail: string | null; isSelf: boolean
}

const TRS_DOMAINS = ['trade-risksol.com', 'traderisksolutions.com.sg', 'kyn.com.sg']

async function listAuthUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = []
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: sbHeaders(), cache: 'no-store' })
    if (!r.ok) break
    const d = await r.json() as { users?: AuthUser[] }
    const users = d.users ?? []
    out.push(...users)
    if (users.length < 200) break
  }
  return out
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const r = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=is_admin&limit=1`, { headers: sbHeaders(), cache: 'no-store' })
  const rows = r.ok ? await r.json() as ProfileRow[] : []
  return { id: user.id, email: user.email ?? '', isAdmin: !!rows[0]?.is_admin }
}

export async function GET(req: NextRequest) {
  // Reading the roster: a signed-in staff session, or the cron bearer (read-only, no self, no admin).
  let self = await me()
  if (!self) { const unauthorized = await requireStaffOrCron(req); if (unauthorized) return unauthorized; self = { id: '', email: '', isAdmin: false } }
  try {
    const [users, profilesRes] = await Promise.all([listAuthUsers(), fetch(`${SB_URL}/rest/v1/employee_profiles?select=user_id,is_admin,gmail_email`, { headers: sbHeaders(), cache: 'no-store' })])
    const profiles = profilesRes.ok ? await profilesRes.json() as ProfileRow[] : []
    const byId = new Map(profiles.map(p => [p.user_id, p]))
    const team: TeamUser[] = users
      .filter(u => u.email && TRS_DOMAINS.some(d => u.email!.toLowerCase().endsWith(`@${d}`)))
      .map((u): TeamUser => {
        const p = byId.get(u.id)
        const meta = u.user_metadata ?? {}
        const name = String(meta.full_name ?? meta.name ?? '').trim() || u.email!.split('@')[0]
        const banned = !!u.banned_until && new Date(u.banned_until) > new Date()
        return {
          id: u.id, email: u.email!, name, role: p?.is_admin ? 'administrator' : 'staff',
          status: banned ? 'suspended' : (!u.confirmed_at && u.invited_at) ? 'invited' : 'active',
          joinedAt: u.created_at, lastSignInAt: u.last_sign_in_at, gmail: p?.gmail_email ?? null, isSelf: u.id === self.id,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ users: team, me: { id: self.id, isAdmin: self.isAdmin } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const self = await me()
  if (!self) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!self.isAdmin) return NextResponse.json({ error: 'Only an administrator can invite people.' }, { status: 403 })
  try {
    const { email, name } = await req.json() as { email?: string; name?: string }
    const addr = (email ?? '').trim().toLowerCase()
    if (!addr || !TRS_DOMAINS.some(d => addr.endsWith(`@${d}`))) return NextResponse.json({ error: 'Use a Trade Risk Solutions address.' }, { status: 400 })
    const r = await fetch(`${SB_URL}/auth/v1/invite`, { method: 'POST', headers: { ...sbHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ email: addr, data: name ? { full_name: name.trim() } : {} }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return NextResponse.json({ error: d.msg ?? d.error_description ?? d.message ?? 'Invitation failed' }, { status: r.status })
    void logActivity({ action: 'user.invited', resource_type: 'user', resource_id: d.id ?? addr, new_value: { email: addr } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const self = await me()
  if (!self) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!self.isAdmin) return NextResponse.json({ error: 'Only an administrator can change roles.' }, { status: 403 })
  try {
    const { userId, role, suspended } = await req.json() as { userId?: string; role?: 'administrator' | 'staff'; suspended?: boolean }
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (userId === self.id) return NextResponse.json({ error: 'You cannot change your own access. Ask another administrator.' }, { status: 400 })
    if (role) {
      const r = await fetch(`${SB_URL}/rest/v1/employee_profiles?on_conflict=user_id`, { method: 'POST', headers: { ...sbHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, is_admin: role === 'administrator' }) })
      if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: 500 })
      void logActivity({ action: 'user.role', resource_type: 'user', resource_id: userId, new_value: { role } })
    }
    if (suspended !== undefined) {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { method: 'PUT', headers: { ...sbHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ban_duration: suspended ? '876000h' : 'none' }) })
      if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: 500 })
      void logActivity({ action: suspended ? 'user.suspended' : 'user.reactivated', resource_type: 'user', resource_id: userId })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
