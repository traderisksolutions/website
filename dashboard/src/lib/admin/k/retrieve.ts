/**
 * Knowledge retriever: one job — answer "what do we know about this company". Reads the group's
 * ledger (dated events with links), its current facts, its policies and its filed documents.
 * Read-only; any agent or page can call it.
 */
import { sbTry, enc } from '@/lib/crm/db'
import type { LedgerEntry, LedgerKind } from '@/lib/admin/ledger'
import { directory } from './deposit'

type Row = Record<string, any>

export type CompanyKnowledge = {
  company: { id: string; name: string | null; kind: string | null; group_id: string; group_name: string | null }
  entries: LedgerEntry[]
  facts: Row[]
  policies: Row[]
  documents: Row[]
}

/** Characters PostgREST's or=/ilike filters cannot take safely. */
export const searchTerm = (q: string) => q.replace(/[(),*%\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

export async function getCompanyKnowledge(companyId: string, opts: { query?: string; since?: string; before?: string; kinds?: LedgerKind[]; limit?: number; scope?: 'group' | 'company' } = {}): Promise<CompanyKnowledge | null> {
  const dir = await directory()
  const c = dir.byId.get(companyId)
  if (!c) return null
  const groupId = dir.group(companyId)
  const [names] = await Promise.all([sbTry<Row[]>(`companies?id=in.(${Array.from(new Set([companyId, groupId])).join(',')})&select=id,company_name`, [])])
  const nameOf = (id: string) => names.find(n => n.id === id)?.company_name ?? null
  const scope = opts.scope === 'company' ? `company_id=eq.${enc(companyId)}` : `group_id=eq.${enc(groupId)}`
  const f = [scope,
    opts.kinds?.length ? `kind=in.(${opts.kinds.join(',')})` : '',
    opts.since ? `occurred_at=gte.${enc(opts.since)}` : '',
    opts.before ? `occurred_at=lt.${enc(opts.before)}` : '',
    opts.query && searchTerm(opts.query) ? `or=(title.ilike.*${enc(searchTerm(opts.query))}*,summary.ilike.*${enc(searchTerm(opts.query))}*)` : '',
  ].filter(Boolean).join('&')
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100))
  // Every company in the group, so policies and documents of member entities come back too.
  const members = Array.from(dir.byId.keys()).filter(id => dir.group(id) === groupId)
  const inMembers = `in.(${members.join(',')})`
  const [entries, facts, policies, documents] = await Promise.all([
    sbTry<LedgerEntry[]>(`company_ledger?${f}&order=occurred_at.desc&limit=${limit}`, []),
    sbTry<Row[]>(`company_facts?group_id=eq.${enc(groupId)}&superseded_by=is.null&select=id,company_id,policy_id,topic,key,value,quote,source_kind,source_id,source_date,confidence&order=source_date.desc.nullslast&limit=500`, []),
    sbTry<Row[]>(`policies?company_id=${inMembers}&select=id,company_id,policy_number,insurer,class_of_insurance,product_line,label,start_date,end_date,lifecycle,drive_folder_url&order=end_date.desc.nullslast&limit=300`, []),
    sbTry<Row[]>(`policy_documents?company_id=${inMembers}&status=neq.ignored&drive_url=not.is.null&select=id,company_id,policy_id,doc_type,filename,received_at,drive_url,insurer_name,policy_number&order=received_at.desc.nullslast&limit=200`, []),
  ])
  return { company: { id: companyId, name: nameOf(companyId), kind: c.kind ?? null, group_id: groupId, group_name: nameOf(groupId) }, entries, facts, policies, documents }
}

/** Text search over a group's ledger, newest first. */
export async function searchKnowledge(companyId: string, q: string, limit = 50): Promise<LedgerEntry[]> {
  const k = await getCompanyKnowledge(companyId, { query: q, limit })
  return k?.entries ?? []
}
