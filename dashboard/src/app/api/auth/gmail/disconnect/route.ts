import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// DELETE /api/auth/gmail/disconnect
// Removes the employee's connected Gmail credentials from employee_profiles.
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const k = process.env.SUPABASE_SERVICE_KEY!
  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}`, {
    method:  'DELETE',
    headers: { apikey: k, Authorization: `Bearer ${k}`, Prefer: 'return=minimal' },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
