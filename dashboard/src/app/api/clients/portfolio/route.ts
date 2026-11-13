/**
 * GET /api/clients/portfolio?window=12m|all[&business=<company id>] → the client portfolio
 * (src/lib/clients/portfolio.ts): every business ranked by commission with its admin beside it.
 * With business, that business's row and the summary only (the company page's numbers).
 * Computed from records on each call and kept 10 minutes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadPortfolio } from '@/lib/clients/portfolio-load'
import type { Portfolio } from '@/lib/clients/portfolio'

export const maxDuration = 60
const cache = new Map<string, { at: number; p: Portfolio }>()

export async function GET(req: NextRequest) {
  const deny = await requireStaffOrCron(req)
  if (deny) return deny
  const sp = new URL(req.url).searchParams
  const window = sp.get('window') === 'all' ? 'all' : '12m'
  let hit = cache.get(window)
  if (!hit || Date.now() - hit.at > 10 * 60_000) { hit = { at: Date.now(), p: await loadPortfolio(window) }; cache.set(window, hit) }
  const business = sp.get('business')
  if (business) {
    const { directory } = await import('@/lib/admin/k/deposit')
    const g = (await directory()).group(business)
    return NextResponse.json({ ...hit.p, rows: hit.p.rows.filter(r => r.id === g) })
  }
  return NextResponse.json(hit.p)
}
