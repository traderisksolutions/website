/**
 * GET /api/placements/routes?product_lines=a,b[&tier=c] → { routes: InsurerRoute[] }
 * The insurer contacts on file for the product lines, one row per insurer and person, sorted by
 * insurer then name. tier=c keeps only the insurers with no rate table here (employment benefits).
 * The broker picks from this list before any request is drafted.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidProductLine } from '@/lib/product-lines'
import * as store from '@/lib/placement/store'
import { approvedInsurerNames, tierOf } from '@/lib/placement/eb'
import { errorResponse, fail, gate } from '@/lib/placement/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  const sp = req.nextUrl.searchParams
  const lines = [...new Set((sp.get('product_lines') ?? '').split(',').map(s => s.trim()).filter(Boolean))]
  if (lines.length === 0) return fail('product_lines is required')
  const unknown = lines.find(l => !isValidProductLine(l))
  if (unknown) return fail(`Unknown product line: ${unknown}`)
  const tier = sp.get('tier')
  if (tier != null && tier !== 'c') return fail('tier must be c')

  try {
    let routes = await store.insurerRoutes(lines)
    if (tier === 'c') {
      const approved = await approvedInsurerNames()
      routes = routes.filter(r => tierOf(r.insurer_name, approved) === 'C')
    }
    routes.sort((a, b) => a.insurer_name.localeCompare(b.insurer_name) || (a.name ?? a.email).localeCompare(b.name ?? b.email) || a.email.localeCompare(b.email))
    return NextResponse.json({ routes })
  } catch (e) {
    return errorResponse(e)
  }
}
