/**
 * GET /api/companies/[id]/threads
 * Every email thread belonging to the company with reply state, latest summary and case links.
 */
import { NextRequest, NextResponse } from 'next/server'
import { listCompanyThreads }        from '@/lib/crm/threads'
import { withStaffOrCron } from '@/lib/auth/guard'

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const threads = await listCompanyThreads(id)
    return NextResponse.json({ threads })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
