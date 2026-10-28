/**
 * GET /api/placements/register → { rows: RegisterRowData[], counts, unmatched }
 * The RFQ register: one row per line still in play across every client, oldest request first
 * within its stage, with how many replies are waiting to be placed by hand.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sbTry } from '@/lib/crm/db'
import { productLineLabel } from '@/lib/product-lines'
import { loadOpenBundle } from '@/lib/placement/store'
import { derivePositions } from '@/lib/placement/position'
import { registerCounts, registerRow } from '@/lib/placement/grid'
import { errorResponse, gate } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  try {
    const [{ bundle, companyNames, doneThisMonth }, unmatched] = await Promise.all([
      loadOpenBundle(),
      sbTry<{ id: string }[]>('placement_unmatched?status=eq.open&select=id&limit=500', []),
    ])
    const byId = new Map(bundle.placements.map(p => [p.id, p]))
    const rows = derivePositions(bundle).flatMap(pos => {
      const p = byId.get(pos.line.placement_id)
      if (!p || ['done', 'dropped', 'lost', 'closed'].includes(pos.line.status)) return []
      return [registerRow(pos, p, companyNames.get(p.company_id) ?? 'Unknown company', pos.line.label ?? productLineLabel(pos.line.product_line))]
    })
    return NextResponse.json({ rows, counts: { ...registerCounts(rows), unmatched: unmatched.length, done_this_month: doneThisMonth } })
  } catch (e) {
    return errorResponse(e)
  }
}
