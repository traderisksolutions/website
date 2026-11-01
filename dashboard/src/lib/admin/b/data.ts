/**
 * What the Phase B agents read about one case, in one place: its item, threads, messages (live
 * and rebuilt), recipients, files, and the client's facts. Reads only; every write is in the agent
 * that owns it.
 *
 * Reads of columns added by the 31 Oct and 1 Nov migrations go through sbTry, so a deploy that
 * lands before the migration degrades to fewer facts instead of failing.
 */
import { sb, sbTry, enc, inChunks, bareEmail, isInternal, emailDomain } from '@/lib/crm/db'
import { latestText } from '@/lib/nexus/reader'
import type { MailLine } from './claim-read'
import type { CaseMail, ScopedContact } from './router'

type Row = Record<string, any>

export type CaseThread = { id: string; subject: string | null; side: string; joined_by: string | null; joined_evidence: string | null; message_count: number; last_message_at: string | null }
export type CaseMessage = {
  id: string; thread_id: string; from: string; to: string[]; cc: string[]; sent_at: string | null
  text: string; side: 'trs' | 'insurer' | 'client'; rebuilt: false | 'forward' | 'quoted'; files: string[]
}
export type CaseFile = { filename: string; mime_type: string | null; storage_url: string | null; received_at: string | null; message_id: string }

export type CaseData = {
  item: Row
  company: Row | null
  threads: CaseThread[]
  messages: CaseMessage[]
  files: CaseFile[]
  namedButMissing: string[]
  insurerDomains: string[]
  departed: string[]
  policies: Row[]
}

export async function insurerDomains(): Promise<string[]> {
  const rows = await sbTry<Row[]>('companies?kind=eq.insurer&select=domain,domains', [])
  return Array.from(new Set(rows.flatMap(r => [r.domain, ...(r.domains ?? [])]).filter(Boolean).map((d: string) => d.toLowerCase())))
}

export async function departedStaff(): Promise<string[]> {
  return (await sbTry<Row[]>('staff_departures?select=email', [])).map(r => String(r.email).toLowerCase())
}

export function sideOf(addr: string, insurers: Set<string>): 'trs' | 'insurer' | 'client' {
  if (isInternal(addr)) return 'trs'
  return insurers.has(emailDomain(addr)) ? 'insurer' : 'client'
}

export async function loadCaseData(workItemId: string): Promise<CaseData | null> {
  const [item] = await sbTry<Row[]>(`work_items?id=eq.${enc(workItemId)}&select=*&limit=1`, [])
  if (!item) return null
  const [company] = item.company_id ? await sbTry<Row[]>(`companies?id=eq.${enc(item.company_id)}&select=id,company_name,parent_id&limit=1`, [])
    .then(r => r.length ? r : sbTry<Row[]>(`companies?id=eq.${enc(item.company_id)}&select=id,company_name&limit=1`, [])) : [null]
  const links = await sbTry<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&select=thread_id,side,joined_by,joined_evidence`, [])
    .then(r => r.length ? r : sbTry<Row[]>(`work_item_threads?work_item_id=eq.${enc(workItemId)}&select=thread_id,side`, []))
  const ids = links.map(l => l.thread_id as string)
  const threadRows = ids.length ? await sbTry<Row[]>(`email_threads?id=in.(${ids.join(',')})&select=id,subject,display_subject,message_count,last_message_at`, []) : []
  const threads: CaseThread[] = links.map(l => {
    const t = threadRows.find(x => x.id === l.thread_id)
    return { id: l.thread_id, subject: t?.display_subject ?? t?.subject ?? null, side: l.side, joined_by: l.joined_by ?? null, joined_evidence: l.joined_evidence ?? null, message_count: t?.message_count ?? 0, last_message_at: t?.last_message_at ?? null }
  })
  const ins = await insurerDomains()
  const insSet = new Set(ins)
  const msgs = await inChunks(ids, 30, c => sbTry<Row[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,from_address,body_text,sent_at&order=sent_at.asc`, []))
  const people = await inChunks(ids, 30, c => sbTry<Row[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=message_id,email,role`, []))
  const atts = await inChunks(ids, 30, c => sbTry<Row[]>(`email_attachments?thread_id=in.(${c.join(',')})&select=message_id,filename,mime_type,storage_url,created_at`, []))
  const rebuilt = await inChunks(ids, 30, c => sbTry<Row[]>(`rebuilt_messages?thread_id=in.(${c.join(',')})&select=*&order=position.asc`, []))

  const files: CaseFile[] = atts.filter(a => a.filename).map(a => ({ filename: a.filename, mime_type: a.mime_type, storage_url: a.storage_url, received_at: msgs.find(m => m.id === a.message_id)?.sent_at ?? a.created_at ?? null, message_id: a.message_id }))
  const messages: CaseMessage[] = [
    ...msgs.map(m => {
      const who = people.filter(p => p.message_id === m.id)
      const from = bareEmail(m.from_address)
      return {
        id: m.id, thread_id: m.thread_id, from, sent_at: m.sent_at, text: String(m.body_text ?? '').slice(0, 20_000),
        to: who.filter(p => p.role === 'to').map(p => String(p.email).toLowerCase()), cc: who.filter(p => p.role === 'cc').map(p => String(p.email).toLowerCase()),
        side: sideOf(from, insSet), rebuilt: false as const, files: files.filter(f => f.message_id === m.id).map(f => f.filename),
      }
    }),
    ...rebuilt.map(r => {
      const from = bareEmail(r.from_address)
      return {
        id: r.id, thread_id: r.thread_id, from, sent_at: r.sent_at, text: String(r.body_text ?? '').slice(0, 20_000),
        to: (r.to_addresses ?? []).map((a: string) => a.toLowerCase()), cc: (r.cc_addresses ?? []).map((a: string) => a.toLowerCase()),
        side: sideOf(from, insSet), rebuilt: r.origin as 'forward' | 'quoted', files: [],
      }
    }),
  ].sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
  const held = new Set(files.map(f => f.filename.toLowerCase()))
  const namedButMissing = Array.from(new Set(rebuilt.flatMap(r => (r.attachments_named ?? []) as string[]).filter(n => !held.has(n.toLowerCase()))))
  const policies = item.company_id ? await sbTry<Row[]>(`policies?company_id=eq.${enc(item.company_id)}&select=id,policy_number,insurer,class_of_insurance,product_line,start_date,end_date,lifecycle&order=end_date.desc.nullslast&limit=50`, []) : []
  return { item, company: company ?? null, threads, messages, files, namedButMissing, insurerDomains: ins, departed: await departedStaff(), policies }
}

export function toMailLines(d: CaseData): MailLine[] {
  const ins = new Set(d.insurerDomains)
  // Each message's own words only: quoted history below a reply would re-fire old stages.
  return d.messages.map(m => ({ side: m.side, sent_at: m.sent_at, text: m.rebuilt ? m.text : latestText(m.text, 6000), rebuilt: !!m.rebuilt, toInsurer: [...m.to, ...m.cc].some(a => ins.has(emailDomain(a))) }))
}

export function toCaseMail(d: CaseData): CaseMail[] {
  return d.messages.filter(m => !m.rebuilt).map(m => ({ from: m.from, to: m.to, cc: m.cc, sent_at: m.sent_at, side: m.side }))
}

/** Contacts who act for a company, with scope when the 31 Oct migration is on, without it before. */
export async function scopedContacts(companyId: string | null | undefined): Promise<ScopedContact[]> {
  if (!companyId) return []
  let rows = await sbTry<Row[] | null>(`company_contacts?company_id=eq.${enc(companyId)}&select=scope,status,is_primary,contacts(email)`, null)
  if (!rows) rows = await sbTry<Row[]>(`company_contacts?company_id=eq.${enc(companyId)}&select=is_primary,contacts(email)`, [])
  return rows.filter(r => r.contacts?.email).map(r => ({ email: String(r.contacts.email).toLowerCase(), scope: r.scope ?? [], status: r.status ?? 'active', is_primary: r.is_primary }))
}

/** The knowledge bank for a client's group, current facts only. Empty before the migration. */
export async function groupFacts(companyId: string | null | undefined, topic?: string): Promise<Row[]> {
  if (!companyId) return []
  const [c] = await sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=parent_id&limit=1`, [])
  const group = c?.parent_id ?? companyId
  return sbTry<Row[]>(`company_facts?or=(group_id.eq.${enc(group)},company_id.eq.${enc(companyId)})&superseded_by=is.null${topic ? `&topic=eq.${enc(topic)}` : ''}&select=*&order=source_date.desc.nullslast&limit=200`, [])
}

/** The insurer's most recent claims handler: the newest sender from its domains on a thread about a claim. */
export async function insurerLastHandler(insurerName: string | null | undefined, scope: string): Promise<string | null> {
  if (!insurerName || insurerName.trim().length < 3) return null
  const [ins] = await sbTry<Row[]>(`companies?kind=eq.insurer&company_name=ilike.*${enc(insurerName.trim().split(/\s+/).slice(0, 2).join('*'))}*&select=domain,domains&limit=1`, [])
  const domains = Array.from(new Set([ins?.domain, ...(ins?.domains ?? [])].filter(Boolean) as string[]))
  const want = scope === 'claims' ? /claim/i : new RegExp(scope.replace(/[^a-z0-9]/gi, '') || 'renewal', 'i')
  for (const dom of domains.slice(0, 3)) {
    const rows = await sbTry<Row[]>(`email_messages?from_address=ilike.*${enc('@' + dom)}*&deleted_at=is.null&select=from_address,email_threads(subject)&order=sent_at.desc&limit=25`, [])
    const hit = rows.find(r => want.test(String(r.email_threads?.subject ?? '')) && !/no-?reply|notification|donotreply/i.test(String(r.from_address)))
    if (hit) return bareEmail(hit.from_address)
  }
  return null
}

export async function itemEvent(workItemId: string, kind: string, actor: string, detail: Row = {}) {
  await sb('work_item_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: workItemId, kind, actor, detail }) })
}
