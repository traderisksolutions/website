/**
 * POST /api/companies/[id]/brief   { deep?: boolean }
 * Generates (and saves) the company brief. Gemini Flash by default; Opus when deep is true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany }                from '@/lib/crm/db'
import { generateBrief }             from '@/lib/crm/brief'

export const maxDuration = 150

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { deep } = await req.json().catch(() => ({})) as { deep?: boolean }
    const result = await generateBrief(company, { deep: !!deep })
    if (!result.brief) return NextResponse.json({ error: result.error ?? 'No brief produced.' }, { status: 502 })
    return NextResponse.json({ brief: result.brief })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
