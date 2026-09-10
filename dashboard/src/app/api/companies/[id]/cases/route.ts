/**
 * GET  /api/companies/[id]/cases → Nexus cases for the company (direct company_id plus any case
 *                                  reached through the company's own threads).
 * POST /api/companies/[id]/cases → { name, description?, threadIds? } creates a case for this
 *                                  company and links the given threads as party_type "client".
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { getCompany, getCompanyThreadIds, sb, sbTry } from '@/lib/crm/db'
import { listCompanyCases }          from '@/lib/crm/cases'
import { logActivity }               from '@/lib/log-activity'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const threadIds = await getCompanyThreadIds(id)
    const cases = await listCompanyCases(id, threadIds)
    return NextResponse.json({ cases })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { name, description, threadIds } = await req.json() as { name?: string; description?: string; threadIds?: string[] }
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    let created: { id: string }[]
    try {
      created = await sb<{ id: string }[]>('cases', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description?.trim() || null, status: 'open', company_id: id }) })
    } catch {
      // cases.company_id arrives with the 20260910 migration; the case is still findable through its threads.
      created = await sb<{ id: string }[]>('cases', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description?.trim() || null, status: 'open' }) })
    }
    const caseId = created[0].id

    const allowed = new Set(await getCompanyThreadIds(id))
    const links = (threadIds ?? []).filter(t => allowed.has(t)).map(thread_id => ({ case_id: caseId, thread_id, party_type: 'client', party_label: company.name }))
    if (links.length) await sbTry('case_threads?on_conflict=case_id,thread_id', null, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(links) })

    void logActivity({ action: 'case.created', resource_type: 'company', resource_id: id, new_value: { case_id: caseId, name: name.trim(), threads: links.length } })
    return NextResponse.json({ id: caseId, linked: links.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
