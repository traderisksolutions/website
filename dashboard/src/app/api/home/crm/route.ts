/**
 * GET /api/home/crm → what needs attention today, across every client company:
 * emails awaiting our reply, overdue and due-soon debit notes, renewals in the next 60 days,
 * and the size of the triage queue.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { listCompanySummaries, summariseAll } from '@/lib/crm/aggregates'
import { sbTry, inChunks, isInternal, isAutomated, bareEmail, displayNameFromAddress } from '@/lib/crm/db'
import { derivePayment }             from '@/lib/crm/payments'
import { todaySGT, addDays }         from '@/lib/crm/format'
import type { DebitNoteRow } from '@/lib/crm/types'

type ThreadRow = { id: string; subject: string | null; company_id: string | null; contact_id: string | null; last_message_at: string | null; category: string | null; contacts: { company_id: string | null } | null }
type MsgRow = { thread_id: string; direction: 'inbound' | 'outbound'; from_address: string | null; sent_at: string }
type PolicyRow = { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; end_date: string; customers: { company_id: string | null } | null }

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const today = todaySGT()
    const rows = await listCompanySummaries()
    const nameById = new Map(rows.map(r => [r.id, r.name]))
    const totals = summariseAll(rows)

    const [threads, debitNotes, policies, unlinked, drafts] = await Promise.all([
      sbTry<ThreadRow[]>(`email_threads?deleted_at=is.null&status=eq.active&select=id,subject,company_id,contact_id,last_message_at,category,contacts(company_id)&order=last_message_at.desc&limit=150`, []),
      sbTry<DebitNoteRow[]>(`debit_notes?status=in.(unpaid,partially_paid)&select=id,company_id,contact_id,policy_id,debit_note_no,issue_date,payment_due_date,currency,gross_amount,net_amount,commission,paid_amount,paid_direct_amount,status,paid_direct_status,pay_direct_to_insurer,insurer,event_type,drive_folder_url,updated_at&order=payment_due_date.asc&limit=200`, []),
      sbTry<PolicyRow[]>(`policies?status=eq.active&end_date=gte.${today}&end_date=lte.${addDays(today, 60)}&select=id,policy_number,insurer,class_of_insurance,end_date,customers(company_id)&order=end_date.asc&limit=50`, []),
      sbTry<{ id: string }[]>(`email_threads?company_id=is.null&deleted_at=is.null&select=id&limit=1000`, []),
      sbTry<{ id: string }[]>(`ai_drafts?status=eq.pending&select=id&limit=500`, []),
    ])

    const ids = threads.map(t => t.id)
    const msgs = ids.length ? await inChunks(ids, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,direction,from_address,sent_at&order=sent_at.desc`, [])) : []
    const last = new Map<string, MsgRow>()
    for (const m of msgs) if (!last.has(m.thread_id)) last.set(m.thread_id, m)

    const needsReply = threads.flatMap(t => {
      const m = last.get(t.id)
      if (!m || m.direction !== 'inbound' || isInternal(m.from_address) || isAutomated(m.from_address)) return []
      const companyId = t.company_id ?? t.contacts?.company_id ?? null
      return [{ threadId: t.id, subject: t.subject, category: t.category, companyId, companyName: companyId ? nameById.get(companyId) ?? null : null, from: displayNameFromAddress(m.from_address) ?? bareEmail(m.from_address), at: m.sent_at }]
    }).slice(0, 25)

    const payments = debitNotes.map(d => derivePayment(d)).filter(d => d.outstanding > 0)
    const overdue = payments.filter(d => d.derived === 'overdue').map(d => ({ ...d, companyName: nameById.get(d.company_id) ?? null }))
    const dueSoon = payments.filter(d => d.derived !== 'overdue' && d.daysToDue !== null && d.daysToDue <= 14).map(d => ({ ...d, companyName: nameById.get(d.company_id) ?? null }))

    const renewals = policies.map(p => ({ policyId: p.id, policyNumber: p.policy_number, insurer: p.insurer, classOfInsurance: p.class_of_insurance, endDate: p.end_date, companyId: p.customers?.company_id ?? null, companyName: p.customers?.company_id ? nameById.get(p.customers.company_id) ?? null : null }))

    return NextResponse.json({
      today,
      kpis: {
        needsReply: needsReply.length,
        overdueCount: overdue.length,
        overdueMoney: totals.money,
        renewals60d: renewals.length,
        unlinkedThreads: unlinked.length,
        pendingDrafts: drafts.length,
        companies: rows.length,
        byStage: totals.byStage,
      },
      needsReply, overdue, dueSoon, renewals,
      companies: rows.slice(0, 8),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
