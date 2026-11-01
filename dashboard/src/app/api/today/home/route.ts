/**
 * GET /api/today/home → the home map: the canvas (cards per bridge and side, most urgent first)
 * and the lists of clients and insurers with open work.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { loadHome, loadHomeCanvas } from '@/lib/today/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const [home, canvas] = await Promise.all([loadHome(), loadHomeCanvas()])
    return NextResponse.json({ ...home, canvas })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
