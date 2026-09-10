/**
 * GET /api/companies/[id]/threads
 * Every email thread belonging to the company with reply state, latest summary and case links.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listCompanyThreads }        from '@/lib/crm/threads'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const threads = await listCompanyThreads(id)
    return NextResponse.json({ threads })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
