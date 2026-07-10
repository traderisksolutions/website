/**
 * Activity feed (audit_logs) — the "who did what, when" log (#2).
 *
 *   GET  /api/activity?resource_id=<id>&resource_type=<t>&limit=<n>&since=<iso>
 *        → activity rows, newest first. Filter by a resource for a per-item
 *          timeline, or omit for the global feed.
 *   POST /api/activity  { action, resource_type?, resource_id?, metadata? }
 *        → log a client-side interaction (a button press) as the current user.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const url = new URL(req.url)
    const resourceId   = url.searchParams.get('resource_id')
    const resourceType = url.searchParams.get('resource_type')
    const since        = url.searchParams.get('since')
    const exclude      = url.searchParams.get('exclude')   // action to omit (e.g. passive views)
    const limit        = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

    let q = `${SB_URL}/rest/v1/audit_logs?select=id,created_at,user_name,user_email,action,resource_type,resource_id,new_value&order=created_at.desc&limit=${limit}`
    if (resourceId)   q += `&resource_id=eq.${encodeURIComponent(resourceId)}`
    if (resourceType) q += `&resource_type=eq.${encodeURIComponent(resourceType)}`
    if (since)        q += `&created_at=gte.${encodeURIComponent(since)}`
    if (exclude)      q += `&action=neq.${encodeURIComponent(exclude)}`

    const res  = await fetch(q, { headers: sbH(), cache: 'no-store' })
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { action, resource_type, resource_id, metadata } = await req.json() as {
      action?: string; resource_type?: string; resource_id?: string; metadata?: Record<string, unknown>
    }
    if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 })

    await logActivity({ action, resource_type, resource_id, metadata })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
