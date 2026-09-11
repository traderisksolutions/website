/**
 * The company Overview in one call: alerts (what needs attention), where we left off, the last
 * few threads and the client-side stakeholders. Facts only — the Nexus
 * summary itself is the saved brief on the company row and is refreshed by hand.
 */
import { sbTry, inChunks, getCompanyThreadIds, bareEmail, displayNameFromAddress, enc } from './db'
import { listCompanyThreads } from './threads'
import { rankPeople } from './people'
import { loadCompanyPayments } from './payments-server'
import { fmtMoney, fmtDate, fmtRelative, todaySGT, daysBetween } from './format'
import { STAGE_LABEL } from './types'
import type { Alert, Company, CompanyOverview, LeftOff, PaymentSummary } from './types'

type MsgRow = { thread_id: string; direction: 'inbound' | 'outbound'; from_address: string | null; subject: string | null; sent_at: string }
type PolicyRow = { end_date: string | null; status: string | null; class_of_insurance: string | null }
type CustomerRow = { policies: PolicyRow[] | null }
type AuditRow = { created_at: string; user_name: string | null; new_value: { stage?: string } | null }

export async function buildOverview(company: Company): Promise<CompanyOverview & { paymentSummary: PaymentSummary; nextRenewalDate: string | null }> {
  const today = todaySGT()
  const threadIds = await getCompanyThreadIds(company.id)
  const [threads, peopleRes, pay, customers, audit, lastMsgs] = await Promise.all([
    listCompanyThreads(company.id, threadIds),
    rankPeople(company, threadIds),
    loadCompanyPayments(company.id),
    sbTry<CustomerRow[]>(`customers?company_id=eq.${enc(company.id)}&select=policies(end_date,status,class_of_insurance)`, []),
    sbTry<AuditRow[]>(`audit_logs?resource_type=eq.company&resource_id=eq.${enc(company.id)}&action=eq.company.stage&select=created_at,user_name,new_value&order=created_at.desc&limit=1`, []),
    threadIds.length ? inChunks(threadIds, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,direction,from_address,subject,sent_at&order=sent_at.desc&limit=40`, [])) : Promise.resolve([] as MsgRow[]),
  ])

  const alerts: Alert[] = []

  // Money
  for (const n of pay.notes.filter(n => n.derived === 'overdue').sort((a, b) => b.daysOverdue - a.daysOverdue)) {
    alerts.push({ id: `overdue-${n.id}`, kind: 'overdue', tone: 'red', title: `${fmtMoney(n.outstanding, n.currency)} overdue on ${n.debit_note_no}`, detail: `${n.daysOverdue} day${n.daysOverdue === 1 ? '' : 's'} past due · ${n.classOfInsurance ?? n.insurer ?? ''}`.trim(), href: `/companies/${company.id}?tab=payments`, at: n.payment_due_date })
  }

  // Replies
  const waiting = threads.filter(t => t.needsReply)
  for (const t of waiting.slice(0, 5)) {
    alerts.push({ id: `reply-${t.id}`, kind: 'awaiting_reply', tone: 'amber', title: `Awaiting our reply: ${t.subject ?? '(no subject)'}`, detail: `${t.contact?.name ?? t.contact?.email ?? 'Client'} wrote ${fmtRelative(t.last_message_at)}`, href: `/engagement?lead=${t.id}`, at: t.last_message_at })
  }
  if (waiting.length > 5) alerts.push({ id: 'reply-more', kind: 'awaiting_reply', tone: 'amber', title: `${waiting.length - 5} more thread${waiting.length - 5 === 1 ? '' : 's'} awaiting a reply`, detail: null, href: `/companies/${company.id}?tab=threads`, at: null })

  // Renewals
  const policies = customers.flatMap(c => c.policies ?? []).filter(p => p.status === 'active' && p.end_date)
  const upcoming = policies.map(p => p.end_date as string).sort()
  const nextRenewalDate = upcoming.find(d => d >= today) ?? upcoming[upcoming.length - 1] ?? null
  for (const p of policies) {
    const d = daysBetween(today, p.end_date as string)
    if (d < 0) alerts.push({ id: `ended-${p.end_date}-${p.class_of_insurance}`, kind: 'policy_ended', tone: 'amber', title: `${p.class_of_insurance ?? 'Policy'} ended ${fmtRelative(p.end_date)}`, detail: 'Renewal not recorded yet', href: `/companies/${company.id}?tab=purchases`, at: p.end_date })
    else if (d <= 60) alerts.push({ id: `renew-${p.end_date}-${p.class_of_insurance}`, kind: 'renewal', tone: d <= 14 ? 'amber' : 'blue', title: `${p.class_of_insurance ?? 'Policy'} renews ${fmtRelative(p.end_date)}`, detail: fmtDate(p.end_date), href: `/companies/${company.id}?tab=purchases`, at: p.end_date })
  }

  // Agent
  const lastMessageAt = threads[0]?.last_message_at ?? null
  const summaryStale = !!company.ai_brief_at && !!lastMessageAt && company.ai_brief_at < lastMessageAt
  if (!company.ai_brief) alerts.push({ id: 'no-summary', kind: 'no_summary', tone: 'neutral', title: 'No Nexus summary yet', detail: 'Generate one to see the whole relationship in one read', href: null, at: null })
  else if (summaryStale) alerts.push({ id: 'stale-summary', kind: 'summary_stale', tone: 'neutral', title: 'Nexus summary is older than the latest email', detail: `Summary ${fmtRelative(company.ai_brief_at)} · last email ${fmtRelative(lastMessageAt)}`, href: null, at: null })

  // Where we left off
  const outbound = lastMsgs.filter(m => m.direction === 'outbound').sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]
  const inbound  = lastMsgs.filter(m => m.direction === 'inbound').sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]
  const leftOff: LeftOff = {
    lastOutbound: outbound ? { at: outbound.sent_at, by: displayNameFromAddress(outbound.from_address) ?? bareEmail(outbound.from_address), subject: outbound.subject, threadId: outbound.thread_id } : null,
    lastInbound:  inbound  ? { at: inbound.sent_at,  from: displayNameFromAddress(inbound.from_address) ?? bareEmail(inbound.from_address), subject: inbound.subject, threadId: inbound.thread_id } : null,
    lastStageChange: audit[0] ? { at: audit[0].created_at, stage: STAGE_LABEL[(audit[0].new_value?.stage ?? company.stage) as keyof typeof STAGE_LABEL] ?? String(audit[0].new_value?.stage), by: audit[0].user_name } : null,
  }

  // One-line status for the header
  const parts: string[] = []
  const sgd = pay.summary.byCurrency.find(m => m.currency === 'SGD') ?? pay.summary.byCurrency[0]
  if (sgd?.overdue) parts.push(`${fmtMoney(sgd.overdue, sgd.currency)} overdue`)
  else if (sgd?.outstanding) parts.push(`${fmtMoney(sgd.outstanding, sgd.currency)} outstanding`)
  if (waiting.length) parts.push(`${waiting.length} awaiting reply`)
  if (nextRenewalDate) parts.push(nextRenewalDate < today ? `policy ended ${fmtRelative(nextRenewalDate)}` : `renews ${fmtRelative(nextRenewalDate)}`)
  const statusLine = parts.length ? parts.join(' · ') : 'Nothing outstanding'

  return {
    alerts, leftOff,
    lastThreads: threads.slice(0, 5),
    stakeholders: peopleRes.people.filter(p => p.party === 'client' || p.party === 'other').slice(0, 6),
    needsReply: waiting.length,
    statusLine, summaryStale,
    paymentSummary: pay.summary, nextRenewalDate,
  }
}
