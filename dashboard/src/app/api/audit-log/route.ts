import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

// POST /api/audit-log
// Body: { action, resource_type?, resource_id?, lead_email?, old_value?, new_value?, metadata? }
// User identity is always read from the server session — callers cannot spoof identity.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    action?:        string
    resource_type?: string
    resource_id?:   string
    lead_email?:    string
    old_value?:     Record<string, unknown>
    new_value?:     Record<string, unknown>
    metadata?:      Record<string, unknown>
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!body.action) return NextResponse.json({ error: 'action required' }, { status: 400 })

  const userName: string | null =
    (user.user_metadata?.['full_name'] as string | undefined) ??
    (user.user_metadata?.['name']      as string | undefined) ??
    user.email.split('@')[0]

  const res = await fetch(`${SB_URL}/rest/v1/audit_logs`, {
    method:  'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id:       user.id,
      user_email:    user.email,
      user_name:     userName,
      action:        body.action,
      resource_type: body.resource_type ?? null,
      resource_id:   body.resource_id   ?? null,
      lead_email:    body.lead_email     ?? null,
      old_value:     body.old_value      ?? null,
      new_value:     body.new_value      ?? null,
      metadata:      body.metadata       ?? null,
    }),
  })

  if (!res.ok) {
    console.error('[audit-log] insert failed:', await res.text())
    return NextResponse.json({ ok: false })
  }
  return NextResponse.json({ ok: true })
}

// GET /api/audit-log?limit=500&user=X&action=X&days=30
// days=30 is the default (last 30 days). Pass days=0 for all-time.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params       = new URL(req.url).searchParams
  const limit        = Math.min(parseInt(params.get('limit') ?? '500'), 1000)
  const filterUser   = params.get('user')
  const filterAction = params.get('action')
  const daysParam    = params.get('days')
  const days         = daysParam !== null ? parseInt(daysParam) : 30

  let url = `${SB_URL}/rest/v1/audit_logs?order=created_at.desc&limit=${limit}`
  if (filterUser)   url += `&user_email=eq.${encodeURIComponent(filterUser)}`
  if (filterAction) url += `&action=eq.${encodeURIComponent(filterAction)}`
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    url += `&created_at=gte.${encodeURIComponent(since)}`
  }

  const res  = await fetch(url, { headers: sbHeaders(), cache: 'no-store' })
  const rows = res.ok ? await res.json() : []
  return NextResponse.json(Array.isArray(rows) ? rows : [])
}
