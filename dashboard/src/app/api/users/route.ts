/**
 * The staff roster: who can sign in, who is an administrator, and who has been switched off.
 *
 * Rewritten on 2 Oct 2026. Every call here used to go to Supabase Auth — listAuthUsers(),
 * /auth/v1/invite, /auth/v1/admin/users for suspension. Supabase was retired in September and
 * SB_URL now points at PostgREST, which answers /auth/v1/... with the plain string "trs api".
 * So this endpoint had been failing on a JSON parse for anyone who opened it.
 *
 * What replaces it is the data the session system actually reads:
 *
 *   app_users           — the roster. lookupStaff() queries it with active=is.true, so setting
 *                         active to false genuinely stops somebody signing in; it is not a flag
 *                         that only changes what a page draws.
 *   employee_profiles   — is_admin, keyed by the same id. No row means staff.
 *
 * There is no invitation step any more and there should not be one. Sign-in is Google on the
 * trade-risksol.com domain; adding a row here is what makes that person known, and removing
 * their access is turning the row off.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/log-activity'
import { ALLOWED_DOMAIN } from '@/lib/auth/session'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

interface AppUser { id: string; email: string; name: string | null; active: boolean | null; created_at: string | null }
interface Profile { user_id: string; is_admin: boolean | null }

export interface TeamUser {
  id: string
  email: string
  name: string
  role: 'administrator' | 'staff'
  active: boolean
  joinedAt: string | null
  isSelf: boolean
}

/** The signed-in person, and whether they administer. */
async function me(): Promise<{ id: string; email: string; isAdmin: boolean } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email || !user.id) return null
  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=is_admin&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' })
  const rows = res.ok ? await res.json() as Profile[] : []
  return { id: user.id, email: user.email, isAdmin: !!rows[0]?.is_admin }
}

async function roster(selfId: string): Promise<TeamUser[]> {
  const [uRes, pRes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/app_users?select=id,email,name,active,created_at&order=email`, { headers: sbHeaders(), cache: 'no-store' }),
    fetch(`${SB_URL}/rest/v1/employee_profiles?select=user_id,is_admin`, { headers: sbHeaders(), cache: 'no-store' }),
  ])
  const users = uRes.ok ? await uRes.json() as AppUser[] : []
  const profiles = pRes.ok ? await pRes.json() as Profile[] : []
  const admin = new Set(profiles.filter(p => p.is_admin).map(p => p.user_id))

  return users.map(u => ({
    id: u.id,
    email: u.email,
    name: (u.name ?? '').trim() || u.email.split('@')[0],
    role: admin.has(u.id) ? 'administrator' as const : 'staff' as const,
    active: u.active !== false,
    joinedAt: u.created_at,
    isSelf: u.id === selfId,
  }))
}

export async function GET(req: NextRequest) {
  let self = await me()
  if (!self) {
    const unauthorized = await requireStaffOrCron(req)
    if (unauthorized) return unauthorized
    self = { id: '', email: '', isAdmin: false }
  }
  try {
    return NextResponse.json({ users: await roster(self.id), me: { id: self.id, isAdmin: self.isAdmin } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

/** Add somebody to the roster so Google sign-in recognises them. */
export async function POST(req: NextRequest) {
  const self = await me()
  if (!self) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!self.isAdmin) return NextResponse.json({ error: 'Only an administrator can add people.' }, { status: 403 })

  try {
    const { email, name } = await req.json() as { email?: string; name?: string }
    const addr = (email ?? '').trim().toLowerCase()
    if (!addr.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json({ error: `Use a @${ALLOWED_DOMAIN} address — sign-in is restricted to that domain.` }, { status: 400 })
    }
    const existing = await fetch(`${SB_URL}/rest/v1/app_users?email=eq.${encodeURIComponent(addr)}&select=id&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' })
    if (existing.ok && (await existing.json() as AppUser[]).length > 0) {
      return NextResponse.json({ error: 'That person is already on the roster.' }, { status: 409 })
    }
    const res = await fetch(`${SB_URL}/rest/v1/app_users`, {
      method: 'POST', headers: sbHeaders(),
      body: JSON.stringify({ email: addr, name: (name ?? '').trim() || null, active: true }),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
    const rows = await res.json() as AppUser[]
    void logActivity({ action: 'user.added', resource_type: 'user', resource_id: rows[0]?.id, new_value: { email: addr } })
    return NextResponse.json({ ok: true, user: rows[0] ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

/** Change somebody's role, or switch their access off. */
export async function PATCH(req: NextRequest) {
  const self = await me()
  if (!self) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!self.isAdmin) return NextResponse.json({ error: 'Only an administrator can change access.' }, { status: 403 })

  try {
    const { userId, role, active } = await req.json() as
      { userId?: string; role?: 'administrator' | 'staff'; active?: boolean }
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    // Nobody removes their own administrator rights or locks themselves out: that is the one
    // mistake with no way back through the interface.
    if (userId === self.id) {
      return NextResponse.json({ error: 'You cannot change your own access. Ask another administrator.' }, { status: 400 })
    }

    if (role) {
      const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?on_conflict=user_id`, {
        method: 'POST', headers: sbHeaders('resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify({ user_id: userId, is_admin: role === 'administrator' }),
      })
      if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
      void logActivity({ action: 'user.role', resource_type: 'user', resource_id: userId, new_value: { role } })
    }

    if (active !== undefined) {
      // This is the real switch: lookupStaff() filters on active, so a false here ends their
      // next sign-in rather than only greying a row.
      const res = await fetch(`${SB_URL}/rest/v1/app_users?id=eq.${userId}`, {
        method: 'PATCH', headers: sbHeaders('return=minimal'),
        body: JSON.stringify({ active }),
      })
      if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
      void logActivity({ action: active ? 'user.reactivated' : 'user.suspended', resource_type: 'user', resource_id: userId })
    }

    return NextResponse.json({ ok: true, users: await roster(self.id) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
