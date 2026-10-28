/**
 * GET  /api/insurers → every insurer, from Companies → Insurers. The one list pickers read.
 * POST /api/insurers { name, domain? } → { id, name } — a new insurer company (or the existing
 *      one with that name), so the Insurers page can add one without leaving the page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { listInsurerCompanies } from '@/lib/insurers'
import { createInsurer } from '@/lib/insurer-products'
import { readBody, fail, isText } from '@/lib/placement/api'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json(await listInsurerCompanies())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const b = await readBody<{ name?: unknown; domain?: unknown }>(req)
  if (!b || !isText(b.name)) return fail('name is required')
  if (b.domain != null && typeof b.domain !== 'string') return fail('domain must be text')
  try {
    return NextResponse.json(await createInsurer(b.name, typeof b.domain === 'string' ? b.domain : null))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
