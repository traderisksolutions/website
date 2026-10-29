/**
 * POST /api/nexus/follow-ups/chases  { ids: uuid[] (1–50) } | { all: true, mine?: boolean }
 *   → { drafted: number, results: [{ id, draft_id? , skipped? }] }
 * Drafts a chase email for each overdue row owed by an insurer or a client into Drafts to approve.
 * all: true takes every such row (the signed-in broker's only, with mine), up to 50.
 * Nothing is sent.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate, isUuid, readBody } from '@/lib/placement/api'
import { draftChases } from '@/lib/nexus/chases'
import { loadLedger } from '@/lib/nexus/ledger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  const body = await readBody<{ ids?: unknown; all?: unknown; mine?: unknown }>(req)
  if (!body) return fail('Body must be a JSON object')
  try {
    let ids: string[]
    if (body.all === true) {
      const ledger = await loadLedger({ view: 'overdue', mine: body.mine === true, actor })
      ids = ledger.rows.filter(r => r.chaseable).map(r => r.id).slice(0, 50)
      if (ids.length === 0) return NextResponse.json({ drafted: 0, results: [] })
    } else {
      const raw = Array.isArray(body.ids) ? [...new Set(body.ids as unknown[])] : null
      if (!raw || raw.length === 0 || raw.length > 50 || !raw.every(isUuid)) return fail('ids must be 1 to 50 follow-up ids')
      ids = raw as string[]
    }
    const results = await draftChases(ids)
    return NextResponse.json({ drafted: results.filter(r => r.draft_id).length, results })
  } catch (e) {
    return errorResponse(e)
  }
}
