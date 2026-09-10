/**
 * GET  /api/companies?search=term        → typeahead rows (id, name, domain) — unchanged shape,
 *                                          still used by the CompanyContactPicker and link popovers.
 * GET  /api/companies?view=summary&stage= → every client company with its roll-ups (threads,
 *                                          money, renewals, actions) for the Companies list.
 * POST /api/companies                     → { name, domain?, stage?, owner_email?, industry?, address? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { logActivity }               from '@/lib/log-activity'
import { listCompanySummaries, summariseAll } from '@/lib/crm/aggregates'
import { createClientCompany }       from '@/lib/crm/triage'
import { isStage }                   from '@/lib/crm/stage'
import { currentUserEmail }          from '@/lib/crm/auth'
import { emailDomain }               from '@/lib/crm/db'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const p = req.nextUrl.searchParams
    if (p.get('view') === 'summary') {
      const rows = await listCompanySummaries({ stage: p.get('stage'), search: p.get('search') })
      return NextResponse.json({ rows, totals: summariseAll(rows) })
    }

    const q = (p.get('search') ?? '').trim()
    const select = 'id,name:company_name,address,type,domain'
    const url = q
      ? `${SB_URL}/rest/v1/companies?select=${select}&or=(company_name.ilike.*${encodeURIComponent(q)}*)&order=company_name.asc&limit=20`
      : `${SB_URL}/rest/v1/companies?select=${select}&order=company_name.asc&limit=50`
    const res = await fetch(url, { headers: sbH(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const body = await req.json() as { name?: string; domain?: string | null; stage?: string; owner_email?: string | null; industry?: string | null; address?: string | null; type?: string | null }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const user = await currentUserEmail()

    const domainRaw = (body.domain ?? '').trim().toLowerCase()
    const domain = domainRaw ? (domainRaw.includes('@') ? emailDomain(domainRaw) : domainRaw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]) : null

    const id = await createClientCompany({
      name, domain, stage: isStage(body.stage) ? body.stage : 'prospect', source: 'manual',
      ownerEmail: body.owner_email ?? user, industry: body.industry ?? null, address: body.address ?? null,
    })
    const res = await fetch(`${SB_URL}/rest/v1/companies?id=eq.${id}&select=id,name:company_name&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    const matchedExisting = !!row?.name && row.name.toLowerCase() !== name.toLowerCase()
    void logActivity({ action: 'company.created', resource_type: 'company', resource_id: id, new_value: { name: row?.name ?? name, typed_as: name } })
    return NextResponse.json({ id, name: row?.name ?? name, matchedExisting })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
