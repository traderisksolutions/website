import { NextRequest, NextResponse } from 'next/server'
import { runNexusAnalysis } from '@/lib/run-nexus-analysis'
import { logActivity }      from '@/lib/log-activity'
import { requireStaffOrCron } from '@/lib/api-auth'

export const maxDuration = 300

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/analyze — run grand analysis for a case
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    let triggeredBy: string | null = null
    let instructions: string | null = null
    let threadIds: string[] | undefined
    try {
      const body = await req.json().catch(() => ({}))
      if (body?.triggered_by) triggeredBy = String(body.triggered_by)
      if (body?.instructions) { instructions = String(body.instructions); triggeredBy = triggeredBy ?? 'chat' }
      if (Array.isArray(body?.thread_ids) && body.thread_ids.length > 0) threadIds = body.thread_ids.map(String)
    } catch { /* no body is fine */ }

    const origin = new URL(req.url).origin
    void logActivity({ action: 'nexus.analysis_run', resource_type: 'case', resource_id: params.id, metadata: { via: triggeredBy ?? 'button', threads: threadIds?.length ?? 'all' } })
    const analysis = await runNexusAnalysis(params.id, triggeredBy, instructions, { origin, threadIds })
    return NextResponse.json({ ok: true, analysis })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nexus/analyze] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/nexus/cases/[id]/analyze — fetch the latest stored analysis
export async function GET(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  const h = { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/case_analyses?case_id=eq.${params.id}&order=created_at.desc&limit=1&select=*`,
      { headers: h }
    )
    const rows = res.ok ? await res.json() : []
    return NextResponse.json(Array.isArray(rows) && rows.length > 0 ? rows[0] : null)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
