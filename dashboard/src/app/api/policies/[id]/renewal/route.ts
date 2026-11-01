/**
 * GET  /api/policies/[id]/renewal?as_of=YYYY-MM-DD → the renewal pack
 * POST /api/policies/[id]/renewal { action: 'draft' } → { work_item_id, draft_id, to }: the pack as a draft on Today
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { actorEmail } from '@/lib/placement/api'
import { getRenewalPack } from '@/lib/policies/ledger'
import { draftRenewalAdvice } from '@/lib/policies/ledger/advice'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Policy id is not valid' }, { status: 400 })
  const asOf = req.nextUrl.searchParams.get('as_of')
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return NextResponse.json({ error: 'as_of must be YYYY-MM-DD' }, { status: 400 })
  try {
    const pack = await getRenewalPack(id, asOf ?? undefined)
    if (!pack) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
    return NextResponse.json(pack)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Policy id is not valid' }, { status: 400 })
  const body = await req.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== 'draft') return NextResponse.json({ error: 'action must be draft' }, { status: 400 })
  try {
    const r = await draftRenewalAdvice(id, await actorEmail())
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
