/**
 * GET /api/nexus/cases/[id]/company → which client this case belongs to.
 *
 * Ask Opus is scoped to the client, so opening a case file needs to resolve the company behind
 * it. Falls back to the companies reached through the case's linked threads, because RFQ cases
 * are created without a company_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { sbTry, enc }                from '@/lib/crm/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const rows = await sbTry<{ company_id: string | null; companies: { company_name: string | null } | null }[]>(
      `cases?id=eq.${enc(id)}&select=company_id,companies(company_name)`, [])
    const direct = rows[0]
    if (direct?.company_id) {
      return NextResponse.json({ companyId: direct.company_id, companyName: direct.companies?.company_name ?? null })
    }

    // No company on the case: take the one its threads are filed under.
    const links = await sbTry<{ thread_id: string }[]>(`case_threads?case_id=eq.${enc(id)}&select=thread_id`, [])
    if (links.length === 0) return NextResponse.json({ companyId: null, companyName: null })

    const threads = await sbTry<{ company_id: string | null; companies: { company_name: string | null; kind: string | null } | null }[]>(
      `email_threads?id=in.(${links.map(l => enc(l.thread_id)).join(',')})&company_id=not.is.null&select=company_id,companies(company_name,kind)`, [])
    // Prefer an actual client over an insurer or partner on the same case.
    const client = threads.find(t => t.companies?.kind === 'client') ?? threads[0]
    return NextResponse.json({
      companyId: client?.company_id ?? null,
      companyName: client?.companies?.company_name ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
