/**
 * Roll-ups for every client company in one pass — the list page, the pipeline board and the
 * Home dashboard all read this. A handful of batched queries, joined in memory, rather than a
 * query per company; at today's size (hundreds of threads, thousands of messages) it returns
 * in well under a second and it scales linearly.
 */
import { sbTry, inChunks, listClientCompanies, isInternal, isAutomated } from './db'
import { derivePayment, summarizePayments } from './payments'
import { suggestStage } from './stage'
import { countOpenRfqByCase } from './quotes'
import type { Company, CompanySummaryRow, DebitNoteRow } from './types'

type ThreadRow = { id: string; company_id: string | null; contact_id: string | null; last_message_at: string | null; status: string }
type MsgRow = { thread_id: string; direction: 'inbound' | 'outbound'; sent_at: string; from_address: string | null }
type ContactRow = { id: string; company_id: string | null }
type JunctionRow = { company_id: string; contact_id: string }
type CustomerRow = { company_id: string; policies: { end_date: string | null; status: string | null }[] | null }
type CaseRow = { id: string; company_id: string | null }
type PmRow = { company_id: string | null; created_at: string }

const QUOTE_FRESH_DAYS = 60

export interface ListOptions { stage?: string | null; search?: string | null }

export async function listCompanySummaries(opts: ListOptions = {}): Promise<CompanySummaryRow[]> {
  let companies = await listClientCompanies()
  if (opts.stage) companies = companies.filter(c => c.stage === opts.stage)
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase()
    companies = companies.filter(c => c.name.toLowerCase().includes(q) || c.domains.some(d => d.includes(q)))
  }
  if (companies.length === 0) return []
  const ids = companies.map(c => c.id)

  const [contacts, junction, threadsDirect, debitNotes, customers, cases, pmQuotes] = await Promise.all([
    inChunks(ids, 100, c => sbTry<ContactRow[]>(`contacts?company_id=in.(${c.join(',')})&select=id,company_id`, [])),
    inChunks(ids, 100, c => sbTry<JunctionRow[]>(`company_contacts?company_id=in.(${c.join(',')})&select=company_id,contact_id`, [])),
    inChunks(ids, 100, c => sbTry<ThreadRow[]>(`email_threads?company_id=in.(${c.join(',')})&deleted_at=is.null&select=id,company_id,contact_id,last_message_at,status&limit=2000`, [])),
    inChunks(ids, 100, c => sbTry<DebitNoteRow[]>(`debit_notes?company_id=in.(${c.join(',')})&select=id,company_id,contact_id,policy_id,debit_note_no,issue_date,payment_due_date,currency,gross_amount,net_amount,paid_amount,paid_direct_amount,status,paid_direct_status,pay_direct_to_insurer,insurer,event_type,drive_folder_url,updated_at`, [])),
    inChunks(ids, 100, c => sbTry<CustomerRow[]>(`customers?company_id=in.(${c.join(',')})&select=company_id,policies(end_date,status)`, [])),
    inChunks(ids, 100, c => sbTry<CaseRow[]>(`cases?company_id=in.(${c.join(',')})&select=id,company_id`, [])),
    inChunks(ids, 100, c => sbTry<PmRow[]>(`pm_quotations?company_id=in.(${c.join(',')})&select=company_id,created_at`, [])),
  ])

  // Contact → company map (direct FK first, junction as fallback) so threads that only carry a
  // contact_id still roll up to the right company.
  const companyByContact = new Map<string, string>()
  for (const j of junction) companyByContact.set(j.contact_id, j.company_id)
  for (const c of contacts) if (c.company_id) companyByContact.set(c.id, c.company_id)
  const contactIds = Array.from(companyByContact.keys())

  const threadsViaContact = contactIds.length
    ? await inChunks(contactIds, 100, c => sbTry<ThreadRow[]>(`email_threads?contact_id=in.(${c.join(',')})&company_id=is.null&deleted_at=is.null&select=id,company_id,contact_id,last_message_at,status&limit=2000`, []))
    : []
  const threads = new Map<string, ThreadRow & { companyId: string }>()
  for (const t of threadsDirect) if (t.company_id) threads.set(t.id, { ...t, companyId: t.company_id })
  for (const t of threadsViaContact) {
    const cid = t.contact_id ? companyByContact.get(t.contact_id) : undefined
    if (cid && !threads.has(t.id)) threads.set(t.id, { ...t, companyId: cid })
  }

  const threadIds = Array.from(threads.keys())
  const messages = threadIds.length
    ? await inChunks(threadIds, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,direction,sent_at,from_address&order=sent_at.desc`, []))
    : []
  const lastMsg = new Map<string, MsgRow>()
  for (const m of messages) if (!lastMsg.has(m.thread_id)) lastMsg.set(m.thread_id, m)

  const openRfq = await countOpenRfqByCase(cases.map(c => c.id))
  const freshCutoff = Date.now() - QUOTE_FRESH_DAYS * 86_400_000

  return companies.map((co): CompanySummaryRow => {
    const myThreads = Array.from(threads.values()).filter(t => t.companyId === co.id)
    const openThreads = myThreads.filter(t => t.status === 'active').length
    let needsReply = 0
    let lastActivityAt: string | null = null
    for (const t of myThreads) {
      const last = lastMsg.get(t.id)
      if (t.status === 'active' && last?.direction === 'inbound' && !isInternal(last.from_address) && !isAutomated(last.from_address)) needsReply++
      if (t.last_message_at && (!lastActivityAt || t.last_message_at > lastActivityAt)) lastActivityAt = t.last_message_at
    }

    const myNotes = debitNotes.filter(d => d.company_id === co.id)
    const notes = myNotes.map(d => derivePayment(d))
    const pay = summarizePayments(notes)
    const lastBillingDate = myNotes.map(d => d.issue_date).filter(Boolean).sort().pop() ?? null

    const policies = customers.filter(c => c.company_id === co.id).flatMap(c => c.policies ?? [])
    const activeEnds = policies.filter(p => p.status === 'active' && p.end_date).map(p => p.end_date as string).sort()
    const activePolicies = policies.filter(p => p.status === 'active').length

    const contactCount = new Set([...contacts.filter(c => c.company_id === co.id).map(c => c.id), ...junction.filter(j => j.company_id === co.id).map(j => j.contact_id)]).size

    const openQuotes = cases.filter(c => c.company_id === co.id).reduce((n, c) => n + (openRfq.get(c.id) ?? 0), 0)
      + pmQuotes.filter(p => p.company_id === co.id && new Date(p.created_at).getTime() > freshCutoff).length

    const suggestedStage = suggestStage({
      activePolicies, nextRenewalDate: activeEnds[0] ?? null, openQuotes, openThreads, lastActivityAt,
      openDebitNotes: pay.openCount, totalDebitNotes: myNotes.length, lastBillingDate,
    }, co.stage)

    return {
      ...co,
      contactCount, openThreads, needsReply, lastActivityAt,
      money: pay.byCurrency, overdueCount: pay.overdueCount, openDebitNotes: pay.openCount,
      nextRenewalDate: activeEnds[0] ?? null, activePolicies,
      openQuotes, suggestedStage,
    }
  }).sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name))
}

export function summariseAll(rows: CompanySummaryRow[]) {
  const byStage: Record<string, number> = {}
  let overdueCount = 0, needsReply = 0
  const money = new Map<string, { outstanding: number; overdue: number }>()
  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1
    overdueCount += r.overdueCount; needsReply += r.needsReply
    for (const m of r.money) {
      const cur = money.get(m.currency) ?? { outstanding: 0, overdue: 0 }
      cur.outstanding += m.outstanding; cur.overdue += m.overdue
      money.set(m.currency, cur)
    }
  }
  return { byStage, overdueCount, needsReply, money: Array.from(money.entries()).map(([currency, v]) => ({ currency, ...v })) }
}

export type { Company }
