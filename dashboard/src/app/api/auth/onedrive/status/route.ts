import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SB_URL, sbH }  from '@/lib/debit-note-storage'

// GET /api/auth/onedrive/status → { connected: boolean, email: string | null }
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=onedrive_refresh_token,onedrive_account_email&limit=1`, { headers: sbH(), cache: 'no-store' })
  const profile = res.ok ? (await res.json())[0] ?? null : null
  return NextResponse.json({ connected: !!profile?.onedrive_refresh_token, email: profile?.onedrive_account_email ?? null })
}
