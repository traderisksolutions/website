/**
 * Everything the company agent is allowed to know about one company, assembled once and
 * rendered as plain text for a prompt. The same object feeds the brief, the next-action
 * extraction and the company chat, so they never disagree about the facts.
 */
import { sbTry, inChunks, getCompanyThreadIds, bareEmail } from './db'
import { listCompanyThreads } from './threads'
import { rankPeople } from './people'
import { loadCompanyPayments } from './payments-server'
import { listCompanyQuotes } from './quotes'
import { listCompanyCases } from './cases'
import { fmtMoney, todaySGT } from './format'
import { STAGE_LABEL } from './types'
import type { Company, CompanyThread, Person, PaymentDerived, PaymentSummary, QuoteRow, CaseRow } from './types'

type MsgRow = { thread_id: string; direction: 'inbound' | 'outbound'; from_address: string | null; sent_at: string; body_text: string | null }

export interface CompanyContext {
  company: Company
  threadIds: string[]
  threads: CompanyThread[]
  people: Person[]
  primary: Person | null
  payments: PaymentDerived[]
  paymentSummary: PaymentSummary
  quotes: QuoteRow[]
  cases: CaseRow[]
  excerpts: Map<string, MsgRow[]>
  text: string
}

const RECENT_THREADS = 14
const MSGS_PER_THREAD = 3
const EXCERPT_CHARS = 700

export async function buildCompanyContext(company: Company, opts: { withExcerpts?: boolean } = {}): Promise<CompanyContext> {
  const threadIds = await getCompanyThreadIds(company.id)
  const [threads, peopleRes, pay, quotes, cases] = await Promise.all([
    listCompanyThreads(company.id, threadIds),
    rankPeople(company, threadIds),
    loadCompanyPayments(company.id),
    listCompanyQuotes(company, threadIds),
    listCompanyCases(company.id, threadIds),
  ])

  const excerpts = new Map<string, MsgRow[]>()
  if (opts.withExcerpts !== false) {
    const recent = threads.slice(0, RECENT_THREADS).map(t => t.id)
    const msgs = recent.length
      ? await inChunks(recent, 50, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,direction,from_address,sent_at,body_text&order=sent_at.desc&limit=${RECENT_THREADS * MSGS_PER_THREAD * 2}`, []))
      : []
    for (const m of msgs) {
      const arr = excerpts.get(m.thread_id) ?? []
      if (arr.length < MSGS_PER_THREAD) { arr.push(m); excerpts.set(m.thread_id, arr) }
    }
  }

  const ctx: CompanyContext = {
    company, threadIds, threads, people: peopleRes.people, primary: peopleRes.primary,
    payments: pay.notes, paymentSummary: pay.summary, quotes, cases, excerpts, text: '',
  }
  ctx.text = renderContext(ctx)
  return ctx
}

function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export function renderContext(ctx: CompanyContext): string {
  const { company } = ctx
  const today = todaySGT()
  const lines: string[] = []

  lines.push(`TODAY: ${today}`)
  lines.push(`COMPANY: ${company.name}`)
  lines.push(`Stage: ${STAGE_LABEL[company.stage]} · Kind: ${company.kind} · Owner: ${company.owner_email ?? 'unassigned'} · Domains: ${company.domains.join(', ') || 'none recorded'}`)
  if (company.industry) lines.push(`Industry: ${company.industry}`)
  if (company.notes) lines.push(`Staff notes: ${clip(company.notes, 600)}`)

  lines.push('', '── PEOPLE (ranked by correspondence) ──')
  const clientPeople = ctx.people.filter(p => p.party === 'client' || p.party === 'other').slice(0, 8)
  if (clientPeople.length === 0) lines.push('No external correspondents yet.')
  for (const p of clientPeople) {
    lines.push(`- ${p.name ?? p.email} <${p.email}> · ${p.party}${p.isPrimary ? ' · PRIMARY' : ''} · wrote ${p.sent}, addressed ${p.received}, copied ${p.cc} · last seen ${p.lastSeen?.slice(0, 10) ?? '?'} · topics: ${p.topics.map(t => `${t.category}×${t.count}`).join(', ')}`)
  }
  const insurers = ctx.people.filter(p => p.party === 'insurer').slice(0, 6)
  if (insurers.length) lines.push(`Insurer contacts on these threads: ${insurers.map(p => `${p.name ?? p.email} <${p.email}>`).join('; ')}`)

  lines.push('', '── PAYMENTS (debit notes) ──')
  if (ctx.payments.length === 0) lines.push('No debit notes.')
  for (const d of ctx.payments.slice(0, 20)) {
    lines.push(`- ${d.debit_note_no} · ${fmtMoney(d.net_amount ?? d.gross_amount, d.currency)} · issued ${d.issue_date} · due ${d.payment_due_date ?? '?'} · ${d.derived}${d.daysOverdue ? ` (${d.daysOverdue} days overdue)` : ''} · outstanding ${fmtMoney(d.outstanding, d.currency)} · ${d.classOfInsurance ?? ''} ${d.policyNumber ? `#${d.policyNumber}` : ''} · ${d.insurer ?? ''}`)
  }
  for (const m of ctx.paymentSummary.byCurrency) lines.push(`Total outstanding ${m.currency} ${m.outstanding.toFixed(2)}, of which overdue ${m.overdue.toFixed(2)}`)

  lines.push('', '── QUOTES ──')
  if (ctx.quotes.length === 0) lines.push('No quotes or RFQs.')
  for (const q of ctx.quotes.slice(0, 15)) lines.push(`- [${q.kind}] ${q.title} · ${q.status}${q.isOpen ? ' (open)' : ''} · created ${q.created_at.slice(0, 10)}${q.quotesReceived != null ? ` · insurer quotes received: ${q.quotesReceived}` : ''}${q.memberCount != null ? ` · ${q.memberCount} members` : ''}`)

  lines.push('', '── NEXUS CASES ──')
  if (ctx.cases.length === 0) lines.push('No cases.')
  for (const c of ctx.cases.slice(0, 10)) lines.push(`- ${c.name} · ${c.status} · ${c.thread_count} threads · last activity ${c.last_activity?.slice(0, 10) ?? '?'}${c.description ? ` · ${clip(c.description, 160)}` : ''}`)

  lines.push('', `── EMAIL THREADS (${ctx.threads.length} total, newest first) ──`)
  if (ctx.threads.length === 0) lines.push('No threads linked yet.')
  for (const t of ctx.threads.slice(0, 40)) {
    lines.push(`\n[thread ${t.id}] ${t.subject ?? '(no subject)'} · ${t.category ?? 'uncategorised'} · ${t.message_count} messages · last ${t.last_message_at?.slice(0, 10) ?? '?'} (${t.lastDirection ?? '?'})${t.needsReply ? ' · AWAITING OUR REPLY' : ''}${t.contact?.email ? ` · with ${t.contact.name ?? t.contact.email}` : ''}`)
    if (t.summary) lines.push(`  Summary: ${clip(t.summary, 500)}`)
    if (t.nextAction) lines.push(`  Suggested next action: ${clip(t.nextAction, 200)}`)
    const ex = ctx.excerpts.get(t.id)
    if (ex) for (const m of [...ex].reverse()) lines.push(`  ${m.sent_at.slice(0, 10)} ${m.direction === 'inbound' ? '←' : '→'} ${bareEmail(m.from_address)}: ${clip(m.body_text, EXCERPT_CHARS)}`)
  }

  return lines.join('\n')
}
