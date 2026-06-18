import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// GET /api/auth/profile
// Returns the current user's profile including admin status.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const k = process.env.SUPABASE_SERVICE_KEY!
  const profileRes = await fetch(
    `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=is_admin,gmail_email&limit=1`,
    { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
  )
  const profiles = profileRes.ok ? await profileRes.json() : []
  const profile  = Array.isArray(profiles) ? profiles[0] : null

  return NextResponse.json({
    id:         user.id,
    email:      user.email ?? null,
    is_admin:   profile?.is_admin  ?? false,
    gmail_email: profile?.gmail_email ?? null,
  })
}
