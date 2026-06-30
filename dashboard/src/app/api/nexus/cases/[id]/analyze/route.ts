import { NextRequest, NextResponse } from 'next/server'
import { runNexusAnalysis } from '@/lib/run-nexus-analysis'

export const maxDuration = 300

type Params = { params: { id: string } }

// POST /api/nexus/cases/[id]/analyze — run grand analysis for a case
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const analysis = await runNexusAnalysis(params.id)
    return NextResponse.json({ ok: true, analysis })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[nexus/analyze] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/nexus/cases/[id]/analyze — fetch the latest stored analysis
export async function GET(_req: NextRequest, { params }: Params) {
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
