/**
 * GET /api/companies/[id]/find-threads → unfiled threads that look like this company's: someone
 * on them writes from one of its domains, or the subject names it. A person's search from the
 * empty Threads tab; each result is linked by hand (POST /api/companies/triage/<thread> link).
 * Only threads the signed-in person may see (INB-002); the rest are a count.
 */
import { NextRequest, NextResponse } from 'next/server'
import { currentUserEmail }          from '@/lib/crm/auth'
import { getCompany, sbTry, enc, inChunks, PUBLIC_EMAIL_DOMAINS } from '@/lib/crm/db'
import { visibleThreadIds }          from '@/lib/mail/visibility-server'
import { splitVisible }              from '@/lib/crm/threads'
import { nameProbe }                 from '@/lib/crm/find-threads'
import { withStaffOrCron } from '@/lib/auth/guard'

type Row = { id: string; subject: string | null; last_message_at: string | null; company_id: string | null }

export const GET = withStaffOrCron(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const company = await getCompany(id)
    if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
    const domains = company.domains.filter(d => !PUBLIC_EMAIL_DOMAINS.has(d)).slice(0, 10)
    const probe = nameProbe(company.name)

    const byDomain = await Promise.all(domains.map(d =>
      sbTry<{ thread_id: string }[]>(`email_participants?email=ilike.${enc('*@' + d)}&deleted_at=is.null&select=thread_id&limit=500`, [])))
    const domainIds = Array.from(new Set(byDomain.flat().map(r => r.thread_id)))
    const [fromDomains, byName] = await Promise.all([
      domainIds.length ? inChunks(domainIds, 100, c => sbTry<Row[]>(`email_threads?id=in.(${c.join(',')})&company_id=is.null&deleted_at=is.null&select=id,subject,last_message_at,company_id`, [])) : Promise.resolve([] as Row[]),
      probe ? sbTry<Row[]>(`email_threads?company_id=is.null&deleted_at=is.null&subject=ilike.${enc('*' + probe + '*')}&select=id,subject,last_message_at,company_id&order=last_message_at.desc.nullslast&limit=100`, []) : Promise.resolve([] as Row[]),
    ])
    const seen = new Map<string, Row & { matched: 'domain' | 'name' }>()
    for (const r of fromDomains) seen.set(r.id, { ...r, matched: 'domain' })
    for (const r of byName) if (!seen.has(r.id)) seen.set(r.id, { ...r, matched: 'name' })
    const all = Array.from(seen.values()).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')).slice(0, 100)

    const visible = await visibleThreadIds(all.map(t => t.id), await currentUserEmail())
    const { shown, hidden } = splitVisible(all, visible)
    return NextResponse.json({ threads: shown.map(t => ({ id: t.id, subject: t.subject, last_message_at: t.last_message_at, matched: t.matched })), hidden, searched: { domains, name: probe } })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
})
