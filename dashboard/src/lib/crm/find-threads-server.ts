/**
 * A company's unfiled mail that may be its own: threads from its domains and threads whose subject
 * names it. Read for the thread list's Find threads; cut to what the viewer may see.
 */
import { getCompany, sbTry, enc, inChunks, PUBLIC_EMAIL_DOMAINS, sbAll } from '@/lib/crm/db'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { splitVisible } from '@/lib/crm/threads'
import { nameProbe } from '@/lib/crm/find-threads'

type Row = { id: string; subject: string | null; last_message_at: string | null; company_id: string | null }

export async function findUnfiledThreads(id: string, viewer: string) {
  const company = await getCompany(id)
  if (!company) throw new Error('Company not found.')
  const domains = company.domains.filter(d => !PUBLIC_EMAIL_DOMAINS.has(d)).slice(0, 10)
  const probe = nameProbe(company.name)

  const byDomain = await Promise.all(domains.map(d =>
    sbTry<{ thread_id: string }[]>(`email_participants?email=ilike.${enc('*@' + d)}&deleted_at=is.null&select=thread_id&limit=500`, [])))
  const domainIds = Array.from(new Set(byDomain.flat().map(r => r.thread_id)))
  const [fromDomains, byName] = await Promise.all([
    domainIds.length ? inChunks(domainIds, 100, c => sbAll<Row>(`email_threads?id=in.(${c.join(',')})&company_id=is.null&deleted_at=is.null&select=id,subject,last_message_at,company_id`)) : Promise.resolve([] as Row[]),
    probe ? sbTry<Row[]>(`email_threads?company_id=is.null&deleted_at=is.null&subject=ilike.${enc('*' + probe + '*')}&select=id,subject,last_message_at,company_id&order=last_message_at.desc.nullslast&limit=100`, []) : Promise.resolve([] as Row[]),
  ])
  const seen = new Map<string, Row & { matched: 'domain' | 'name' }>()
  for (const r of fromDomains) seen.set(r.id, { ...r, matched: 'domain' })
  for (const r of byName) if (!seen.has(r.id)) seen.set(r.id, { ...r, matched: 'name' })
  const all = Array.from(seen.values()).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')).slice(0, 100)

  const visible = await visibleThreadIds(all.map(t => t.id), viewer)
  const { shown, hidden } = splitVisible(all, visible)
  return { threads: shown.map(t => ({ id: t.id, subject: t.subject, last_message_at: t.last_message_at, matched: t.matched })), hidden, searched: { domains, name: probe } }
}
