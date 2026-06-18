import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

// Keys that only admins (is_admin = true in employee_profiles) may change.
const ADMIN_ONLY_KEYS = ['shared_email_senders', 'reply_from_email']

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY!
    const res = await fetch(
      `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=is_admin&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    return Array.isArray(rows) && rows[0]?.is_admin === true
  } catch { return false }
}

// GET /api/settings?key=reply_from_email  → single value
// GET /api/settings                        → all settings
export async function GET(req: NextRequest) {
  try {
    const key = new URL(req.url).searchParams.get('key')
    const url = key
      ? `${SB_URL}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&limit=1`
      : `${SB_URL}/rest/v1/app_settings?order=key.asc`
    const res  = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
    const rows = res.ok ? await res.json() : []
    if (key) {
      const row = Array.isArray(rows) ? rows[0] : null
      return NextResponse.json(row ?? { key, value: null })
    }
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/settings  → upsert { key, value }
export async function PATCH(req: NextRequest) {
  try {
    const { key, value } = await req.json() as { key: string; value: string }
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

    if (ADMIN_ONLY_KEYS.includes(key)) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user)               return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      if (!await isAdmin(user.id)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const res = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=key`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body:    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    })
    const data = res.ok ? await res.json() : null
    return NextResponse.json(Array.isArray(data) ? data[0] : data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
