import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// POST /api/audit-log
// Body: { action, resource_type?, resource_id?, metadata? }
// Reads the authenticated user from the session — no user spoofing possible.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; resource_type?: string; resource_id?: string; metadata?: Record<string, unknown> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const res = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
    method:  'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_email:    user.email,
      action:        body.action,
      resource_type: body.resource_type ?? null,
      resource_id:   body.resource_id   ?? null,
      metadata:      body.metadata       ?? null,
    }),
  })

  if (!res.ok) {
    console.error('[audit-log] insert failed:', await res.text())
    return NextResponse.json({ ok: false })
  }
  return NextResponse.json({ ok: true })
}

// GET /api/audit-log?limit=100&user=X&action=X
// Returns audit log entries for the activity viewer.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params     = new URL(req.url).searchParams
  const limit      = Math.min(parseInt(params.get('limit') ?? '200'), 500)
  const filterUser = params.get('user')
  const filterAction = params.get('action')

  let url = `${SB_URL}/rest/v1/audit_logs?order=created_at.desc&limit=${limit}`
  if (filterUser)   url += `&user_email=eq.${encodeURIComponent(filterUser)}`
  if (filterAction) url += `&action=like.${encodeURIComponent(filterAction + '*')}`

  const res  = await fetch(url, { headers: sbHeaders() })
  const rows = res.ok ? await res.json() : []
  return NextResponse.json(Array.isArray(rows) ? rows : [])
}
