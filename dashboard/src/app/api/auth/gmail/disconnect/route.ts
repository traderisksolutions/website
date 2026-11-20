import { NextResponse }  from 'next/server'
import { SB_URL } from '@/lib/sb'
import { withStaff } from '@/lib/auth/guard'


// DELETE /api/auth/gmail/disconnect
// Removes the employee's connected Gmail credentials from employee_profiles.
export const DELETE = withStaff(async (_req, _ctx, { user }) => {
  const k = process.env.SUPABASE_SERVICE_KEY!
  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}`, {
    method:  'DELETE',
    headers: { apikey: k, Authorization: `Bearer ${k}`, Prefer: 'return=minimal' },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}, { error: 'Not authenticated' })
