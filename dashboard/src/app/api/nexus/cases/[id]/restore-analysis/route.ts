/**
 * POST /api/nexus/cases/[id]/restore-analysis   Body: { snapshot }
 *
 * Undo for a surgical edit_analysis: writes a previously-captured structured_analysis
 * snapshot back onto the latest analysis row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { logActivity }               from '@/lib/log-activity'
import { SB_URL } from '@/lib/sb'
import { withStaff } from '@/lib/auth/guard'

type Params = { params: Promise<{ id: string }> }

function sbH(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export const POST = withStaff(async (req: NextRequest, props: Params) => {
  const params = await props.params;
  try {
    const { snapshot } = await req.json() as { snapshot?: unknown }
    if (!snapshot || typeof snapshot !== 'object') return NextResponse.json({ error: 'snapshot required' }, { status: 400 })

    const aRes = await fetch(`${SB_URL}/rest/v1/case_analyses?case_id=eq.${params.id}&order=created_at.desc&limit=1&select=id`, { headers: sbH(), cache: 'no-store' })
    const row  = aRes.ok ? (await aRes.json())[0] : null
    if (!row) return NextResponse.json({ error: 'No analysis to restore' }, { status: 400 })

    const uRes = await fetch(`${SB_URL}/rest/v1/case_analyses?id=eq.${row.id}`, {
      method: 'PATCH', headers: sbH('return=minimal'),
      body: JSON.stringify({ structured_analysis: snapshot }),
    })
    if (!uRes.ok) return NextResponse.json({ error: await uRes.text() }, { status: 500 })

    void logActivity({ action: 'nexus.analysis_edit_undone', resource_type: 'case_analysis', resource_id: row.id, new_value: { case_id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}, { error: 'Not authenticated' })
