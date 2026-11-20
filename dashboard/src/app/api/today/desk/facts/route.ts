/**
 * GET /api/today/desk/facts?ids=<company id>,<company id>…  → { facts: { [companyId]: RowFacts } }
 * Renewal and days, current insurer and premium, stage, for the clients on Today. Read after the
 * rows are on the page, so Today never waits for it (substance-server.ts rowFacts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { rowFacts } from '@/lib/today/substance-server'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(s => UUID.test(s)).slice(0, 200)
  try { return NextResponse.json({ facts: await rowFacts(ids) }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }) }
}
