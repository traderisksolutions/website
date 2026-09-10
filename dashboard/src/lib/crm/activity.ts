/**
 * A single timeline for a company: emails in and out, debit notes issued and paid, quotes,
 * cases, completed actions and stage changes — newest first. Read-only; each source keeps its
 * own table, this just lines them up.
 */
import { sbTry, inChunks, enc, displayNameFromAddress, bareEmail } from './db'
import type { ActivityEvent, CompanyAction, CaseRow, PaymentDerived, QuoteRow } from './types'
import { fmtMoney } from './format'

type MsgRow = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; from_address: string | null; subject: string | null; sent_at: string }
type AuditRow = { id: string; action: string; created_at: string; user_name: string | null; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null }
type DraftRow = { id: string; thread_id: string | null; status: string; generated_by: string | null; email_type: string | null; subject: string | null; created_at: string; sent_at: string | null }

const DRAFT_SOURCE: Record<string, string> = { auto: 'Agent drafted a reply automatically', gemini: 'Agent drafted a reply', gdrive: 'Agent drafted a reply from the knowledge base', rag: 'Agent drafted a reply from the knowledge base', manual: 'Staff wrote a draft' }

export interface ActivityInputs {
  threadIds: string[]
  payments: PaymentDerived[]
  quotes: QuoteRow[]
  cases: CaseRow[]
  actions: CompanyAction[]
}

export async function buildActivity(companyId: string, input: ActivityInputs, limit = 80): Promise<ActivityEvent[]> {
  const [messages, audit, drafts] = await Promise.all([
    input.threadIds.length
      ? inChunks(input.threadIds, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,subject,sent_at&order=sent_at.desc&limit=${limit}`, []))
      : Promise.resolve([] as MsgRow[]),
    sbTry<AuditRow[]>(`audit_logs?resource_type=eq.company&resource_id=eq.${enc(companyId)}&select=id,action,created_at,user_name,old_value,new_value&order=created_at.desc&limit=40`, []),
    input.threadIds.length
      ? inChunks(input.threadIds, 100, c => sbTry<DraftRow[]>(`ai_drafts?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,status,generated_by,email_type,subject,created_at,sent_at&order=created_at.desc&limit=40`, []))
      : Promise.resolve([] as DraftRow[]),
  ])

  const events: ActivityEvent[] = []

  for (const d of drafts) {
    const what = DRAFT_SOURCE[d.generated_by ?? ''] ?? 'A reply was drafted'
    events.push({ id: `draft-${d.id}`, kind: 'ai_draft', at: d.created_at, title: `${what}${d.email_type ? ` (${d.email_type.replace(/_/g, ' ')})` : ''}`, detail: `${d.status === 'sent' ? 'Sent' : d.status === 'pending' ? 'Waiting for review' : d.status.charAt(0).toUpperCase() + d.status.slice(1)}${d.subject ? ` · ${d.subject}` : ''}`, href: d.thread_id ? `/engagement?lead=${d.thread_id}` : null })
  }

  for (const m of messages) {
    const who = displayNameFromAddress(m.from_address) ?? bareEmail(m.from_address)
    events.push({
      id: `msg-${m.id}`, kind: m.direction === 'inbound' ? 'email_in' : 'email_out', at: m.sent_at,
      title: m.subject?.trim() || '(no subject)',
      detail: m.direction === 'inbound' ? `From ${who}` : `Sent by ${who}`,
      href: `/engagement?lead=${m.thread_id}`,
    })
  }

  for (const d of input.payments) {
    events.push({
      id: `dn-${d.id}`, kind: 'debit_note', at: `${d.issue_date}T00:00:00Z`,
      title: `Debit note ${d.debit_note_no} issued`,
      detail: `${fmtMoney(d.net_amount ?? d.gross_amount, d.currency)} · ${d.insurer ?? 'insurer not recorded'}${d.payment_due_date ? ` · due ${d.payment_due_date}` : ''}`,
      href: `/debit-notes?company_id=${companyId}`,
    })
    if (d.derived === 'paid' && d.updated_at && d.updated_at.slice(0, 10) !== d.issue_date) {
      events.push({ id: `paid-${d.id}`, kind: 'payment', at: d.updated_at, title: `Debit note ${d.debit_note_no} marked paid`, detail: fmtMoney(d.net_amount ?? d.gross_amount, d.currency), href: `/debit-notes?company_id=${companyId}` })
    }
  }

  for (const q of input.quotes) {
    events.push({ id: `q-${q.kind}-${q.id}`, kind: 'quote', at: q.created_at, title: q.title, detail: q.status, href: q.href })
  }

  for (const c of input.cases) {
    events.push({ id: `case-${c.id}`, kind: 'case', at: c.created_at, title: `Case opened: ${c.name}`, detail: c.description, href: `/nexus?case=${c.id}` })
  }

  for (const a of input.actions) {
    if (a.status === 'done' && a.completed_at) events.push({ id: `act-${a.id}`, kind: 'action_done', at: a.completed_at, title: `Done: ${a.title}`, detail: a.owner_email ? `by ${a.owner_email}` : null, href: null })
  }

  for (const r of audit) {
    if (r.action === 'company.stage') {
      events.push({ id: `audit-${r.id}`, kind: 'stage', at: r.created_at, title: `Stage changed to ${String(r.new_value?.stage ?? '?')}`, detail: `${r.old_value?.stage ? `from ${String(r.old_value.stage)} · ` : ''}${r.user_name ?? 'staff'}`, href: null })
    } else if (r.action === 'company.created' || r.action === 'company.from_lead') {
      events.push({ id: `audit-${r.id}`, kind: 'note', at: r.created_at, title: r.action === 'company.from_lead' ? 'Company created from a lead' : 'Company created', detail: r.user_name ?? null, href: null })
    } else if (r.action === 'thread.linked') {
      events.push({ id: `audit-${r.id}`, kind: 'note', at: r.created_at, title: 'Thread linked to this company', detail: r.user_name ?? null, href: r.new_value?.thread_id ? `/engagement?lead=${String(r.new_value.thread_id)}` : null })
    } else if (r.action === 'company.updated') {
      events.push({ id: `audit-${r.id}`, kind: 'note', at: r.created_at, title: 'Company details updated', detail: r.user_name ?? null, href: null })
    }
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
