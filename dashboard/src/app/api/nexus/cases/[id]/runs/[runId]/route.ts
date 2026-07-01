/**
 * GET /api/nexus/cases/[id]/runs/[runId]
 *
 * Returns the full structured_analysis for a single analysis run.
 * Used by the operator raw-section viewer in the History tab.
 * Only returns structured_analysis — not the legacy JSONB columns.
 */

import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

type Params = { params: { id: string; runId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/case_analyses` +
      `?id=eq.${params.runId}` +
      `&case_id=eq.${params.id}` +
      `&select=id,created_at,schema_version,structured_analysis` +
      `&limit=1`,
      { headers: sbHeaders(), cache: 'no-store' },
    )

    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })

    const rows = await res.json()
    const row  = Array.isArray(rows) ? rows[0] : null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(row.structured_analysis ?? null)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
