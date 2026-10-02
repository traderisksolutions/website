/**
 * GET /api/insurers → every insurer, from Companies → Insurers.
 *
 * The one list pickers read. Adding or renaming an insurer happens on its company record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { listInsurerCompanies } from '@/lib/insurers'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json(await listInsurerCompanies())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
