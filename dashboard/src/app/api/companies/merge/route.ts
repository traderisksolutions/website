/**
 * GET  /api/companies/merge  → pairs of companies that look like the same organisation twice.
 * POST /api/companies/merge  → { loserId, winnerId } folds one into the other and deletes it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { findDuplicates, mergeCompanies } from '@/lib/crm/domains'
import { currentUserEmail }          from '@/lib/crm/auth'
import { logActivity }               from '@/lib/log-activity'

export const maxDuration = 120

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const pairs = await findDuplicates()
    return NextResponse.json({
      pairs: pairs.map(p => ({
        score: p.score, matchedOn: p.matchedOn,
        a: { id: p.a.id, name: p.a.name, kind: p.a.kind, domains: p.a.domains, created_at: p.a.created_at },
        b: { id: p.b.id, name: p.b.name, kind: p.b.kind, domains: p.b.domains, created_at: p.b.created_at },
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const { loserId, winnerId } = await req.json() as { loserId?: string; winnerId?: string }
    if (!loserId || !winnerId) return NextResponse.json({ error: 'loserId and winnerId required' }, { status: 400 })
    const user = await currentUserEmail()
    const r = await mergeCompanies(loserId, winnerId, user)
    void logActivity({ action: 'company.merged', resource_type: 'company', resource_id: winnerId, old_value: { merged_from: loserId }, new_value: r.moved })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
