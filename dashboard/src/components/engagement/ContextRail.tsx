'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardTask } from '@/lib/crm/board'
import type { CompanyThread, PaymentDerived, PaymentSummary } from '@/lib/crm/types'
import type { Policy } from '@/components/crm/PoliciesPanel'
import { fmtMoney, fmtDate } from '@/lib/format'
import { daysUntil, isOpen, sortTasks } from '@/components/board/model'
import { AddToCaseControl } from './AddToCaseControl'
import { ChiefBar } from './ChiefBar'
import { LinkCompanyPopover } from './LinkCompanyPopover'
import { ThreadParty, readInsurerClient, type PartyChange } from './ThreadParty'
import { ThreadReferral } from './ThreadReferral'
import { useCompanyCard, useInboxTeam } from './company-card'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import { AiAnalysisPanel } from '@/components/engagement-agent/ai-analysis-panel'
import { EngagementContextPanel } from '@/components/engagement-agent/engagement-context-panel'
import { Btn } from '@/components/crm/primitives'
import { AiRow, Group, InfoRow, PlainLink, PropRow, SectionLabel, listValue } from './rail-bits'
import type { Lead, RealMsg, StoredSummary, RagSource } from './types'
import { fullName, timeAgo } from './helpers'
import { companyThreads } from '@/app/companies/[id]/actions'
import { companyDetail } from '@/app/companies/actions'

/**
 * The context rail beside a thread, in three groups (11 Nov 2026):
 *   Actions      who the thread waits on and the one thing to do, the AI's suggestions, drafts,
 *                open to-dos, add to a case (src/components/engagement/ChiefBar.tsx)
 *   AI           read the thread, pricing options, summary, draft reply
 *   Information  company, policy, renewal, outstanding, contact, related threads, status and notes
 * Record-sidebar layout (21 Nov 2026): a plain section label per group, From as one row of pills,
 * Information as a property list (one line per value, the full text on hover). Reads the company's card (name,
 * owner, open to-dos: company-card.tsx) and the same company APIs as Companies.
 */

type Detail = { policies: Policy[]; payments: PaymentDerived[]; paymentSummary: PaymentSummary }

const KIND_LABEL: Record<string, string> = { client: 'Client', insurer: 'Insurer', prospect: 'Prospect', partner: 'Referral', other: 'Company' }
const QUIET_LINK = 'bg-transparent border-0 p-0 cursor-pointer text-small text-trs-muted hover:underline'

export function ContextRail({ lead, messages, threadId, conversationThreadId, activeThreadId, onSelectThread, onStatus, onTransfer, onRestoreDraft, summaries, summariesLoading, latestMessageId, ragSources, onRefreshSummaries, taskRefresh, onClose, onAddTask, onDraftOpen }: {
  lead: Lead
  messages: RealMsg[]
  threadId: string | null
  conversationThreadId: string | null
  activeThreadId: string | null
  onSelectThread: (id: string) => void
  onStatus: (id: string, s: string) => void
  onTransfer: (id: string, note: string) => Promise<void>
  onRestoreDraft: (body: string, generatedBy: string) => void
  summaries: StoredSummary[]
  summariesLoading: boolean
  latestMessageId: string | null
  ragSources: RagSource[]
  onRefreshSummaries: () => void
  /** Bumped by the thread view after it creates a task, so to-dos re-read. */
  taskRefresh: number
  /** Present when the rail is a column; inside a sheet the sheet's own close is enough. */
  onClose?: () => void
  /** Opens the "New to-do" dialog owned by the thread view. */
  onAddTask?: () => void
  /** A draft in the Actions group opened or closed; the rail widens while one is open. */
  onDraftOpen?: (open: boolean) => void
}) {
  // A thread linked to an insurer or partner is about a client: the rail shows that client where it
  // is known, and never lists the insurer's other conversations as this thread's (the AAS WIC request
  // to Chubb listed Chubb's Bangkok itinerary deck, 11 Nov 2026).
  // A label set here (Client, Insurer, Referral) holds until the list reloads the thread.
  const [party, setParty] = useState<{ threadId: string | null } & PartyChange | null>(null)
  const mine = party && party.threadId === threadId ? party : null
  const kind = mine?.kind ?? lead.companyKind ?? null
  const clientCompanyId = mine && mine.clientCompanyId !== undefined ? mine.clientCompanyId : lead.clientCompanyId ?? null
  const clientNamed = mine && mine.clientNamed !== undefined ? mine.clientNamed : lead.clientNamed ?? null
  const counterparty = kind === 'insurer' || kind === 'partner'
  const companyId = (counterparty ? clientCompanyId : lead.companyId) ?? null
  const { onLinkCompany, onRefresh } = useEngagementNav()
  const onParty = (c: PartyChange) => {
    setParty(p => ({ ...(p && p.threadId === threadId ? p : {}), threadId, ...c }))
    onRefresh?.()
  }
  const card = useCompanyCard(companyId, taskRefresh)
  const team = useInboxTeam()
  /** Status and notes reads its conversations when first opened, not with the rail. */
  const [statusOpen, setStatusOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [related, setRelated] = useState<CompanyThread[] | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)

  useEffect(() => {
    setDetail(null); setRelated(null)
    if (!companyId) return
    companyDetail(companyId).then(r => { if (r.ok) setDetail(r.data) }).catch(() => {})
    companyThreads(companyId).then(r => setRelated(r.ok ? r.data.threads : [])).catch(() => setRelated([]))
  }, [companyId])

  const company = card?.company ?? null
  const staff = useMemo(() => new Map(team.staff.map(s => [s.email, s])), [team])
  const today = new Date().toISOString().slice(0, 10)
  const tasks = useMemo(() => company && card ? sortTasks(card.tasks.filter(isOpen), today) : [], [company, card, today])
  const policy = useMemo(() => {
    const active = (detail?.policies ?? []).filter(p => p.status === 'active' && p.end_date).sort((a, b) => a.end_date!.localeCompare(b.end_date!))
    return active[0] ?? null
  }, [detail])
  const sgd = detail?.paymentSummary.byCurrency.find(m => m.currency === 'SGD') ?? detail?.paymentSummary.byCurrency[0] ?? null
  // The company's newest threads, the one open now among them and marked; the conversation the
  // reader came from stays in the list, so it is one click back.
  const threadList = useMemo(() => {
    const all = related ?? []
    const keep = new Set([activeThreadId, conversationThreadId].filter(Boolean) as string[])
    const top = all.slice(0, 5)
    const missing = all.filter(t => keep.has(t.id) && !top.some(x => x.id === t.id))
    return [...top.slice(0, 5 - missing.length), ...missing]
  }, [related, activeThreadId, conversationThreadId])
  const nameOf = (email: string | null) => email ? (staff.get(email)?.name ?? email.split('@')[0]) : null
  const storedDraft = summaries[0]?.draft_reply ?? null
  const summary = summaries[0]?.summary ?? null
  const contact = fullName(lead)

  const actionsFooter = (
    <div className="flex flex-col gap-1.5">
      {companyId && card && tasks.length > 0 && (
        <ul className="m-0 p-0 list-none mb-1">
          {tasks.slice(0, 5).map(t => <WorkRow key={t.id} t={t} today={today} nameOf={nameOf} />)}
        </ul>
      )}
      {/* Secondary links: tertiary text buttons on one row. */}
      <div className="flex flex-wrap items-center gap-1 -ml-3">
        {onAddTask && <Btn level="tertiary" size="xs" onClick={onAddTask}>Add to-do</Btn>}
        {threadId && <AddToCaseControl threadId={threadId} />}
      </div>
    </div>
  )

  const aiExtras = (
    <>
      <AiRow title="Summary" detail={summary ? `Last read ${summaries[0]?.created_at ? timeAgo(summaries[0].created_at) : 'earlier'}` : 'The thread in a few lines, with a drafted reply'} action={summariesLoading ? 'Summarising…' : summary ? (analysisOpen ? 'Hide' : 'Show') : 'Summarise'}
        onClick={() => { if (!summary) onRefreshSummaries(); else setAnalysisOpen(v => !v) }} disabled={!threadId || summariesLoading}>
        {summary && !analysisOpen && <p className="m-0 mb-1 text-body leading-normal line-clamp-3 text-trs-ink-2">{summary}</p>}
        {analysisOpen && (
          <div className="mt-1">
            <AiAnalysisPanel summaries={summaries} loading={summariesLoading} threadId={threadId} latestMessageId={latestMessageId} ragSources={ragSources} onRefresh={onRefreshSummaries} />
          </div>
        )}
      </AiRow>
      {storedDraft && <AiRow title="Draft reply" detail="From the summary, into the composer" action="Load" onClick={() => onRestoreDraft(storedDraft, 'summary')} />}
    </>
  )

  return (
    <aside className={cn('h-full flex flex-col min-h-0 bg-white', onClose && 'border-l border-trs-line')} aria-label="Context">
      <div className="flex-shrink-0 flex items-center justify-between pl-[18px] pr-3 pt-4 pb-3 text-body text-trs-muted">
        <span>Context</span>
        {onClose && <Btn level="tertiary" size="xs" onClick={onClose} title="Close context" aria-label="Close context" className="w-8 px-0 text-trs-ink-2"><X size={15} /></Btn>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-6">
        {/* Who the thread is from comes first: it decides whose client, policy and actions the rail shows. */}
        {threadId && (
          <section className="px-1 mb-6 empty:hidden" aria-label="From">
            {/* The label applies to the company the thread is filed under: an unfiled thread links one here first. */}
            <SectionLabel>From</SectionLabel>
            {lead.companyId
              ? <ThreadParty threadId={threadId} companyName={lead.companyName ?? null} kind={kind} clientCompanyId={counterparty ? clientCompanyId : null} clientName={company?.name ?? null} clientNamed={counterparty ? clientNamed : null}
                  onChanged={onParty} />
              : <span className="text-body"><LinkCompanyPopover threadId={threadId} /></span>}
            <ThreadReferral threadId={threadId} kind={kind} />
          </section>
        )}
        {threadId
          ? <ChiefBar threadId={threadId} refreshKey={latestMessageId ?? ''} onOpenChange={onDraftOpen} actionsFooter={actionsFooter} aiExtras={aiExtras}
              beforeRead={lead.companyId && kind === 'insurer' ? () => readInsurerClient(threadId, onParty) : undefined} />
          : <Group label="AI">{aiExtras}</Group>}

        <Group label="Information">
          {companyId ? (() => {
            const name = company?.name ?? (counterparty ? mine?.clientName : lead.companyName) ?? 'Company'
            const domains = company ? listValue(company.domains.length ? company.domains : [company.domain]) : null
            const facts = company ? [KIND_LABEL[company.kind] ?? company.kind, domains?.text, nameOf(company.owner_email) ?? 'No owner', counterparty && lead.companyName ? `via ${lead.companyName}` : null].filter(Boolean).join(' · ') : null
            const factsTitle = company ? [KIND_LABEL[company.kind] ?? company.kind, domains?.title, nameOf(company.owner_email) ?? 'No owner', counterparty && lead.companyName ? `via ${lead.companyName}` : null].filter(Boolean).join(' · ') : null
            return (
              <PropRow label="Company" title={name} sub={facts} subTitle={factsTitle}
                links={threadId ? <LinkCompanyPopover threadId={threadId} change forClient={counterparty} /> : undefined}>
                <PlainLink href={`/companies/${companyId}`}>{name}</PlainLink>
              </PropRow>
            )
          })() : counterparty && lead.companyId ? (
            <PropRow label="Company" title={lead.companyName ?? 'Insurer'}
              sub={`${KIND_LABEL[kind ?? ''] ?? 'Company'}${clientNamed ? ` · about ${clientNamed}, not on file` : ' · client not linked'}`}
              links={threadId ? (
                <>
                  {clientNamed && onLinkCompany && <button type="button" onClick={() => onLinkCompany(threadId, null, clientNamed)} className={QUIET_LINK}>Create {clientNamed} and link</button>}
                  <LinkCompanyPopover threadId={threadId} forClient />
                </>
              ) : undefined}>
              <PlainLink href={`/insurers/${lead.companyId}`}>{lead.companyName ?? 'Insurer'}</PlainLink>
            </PropRow>
          ) : (
            <PropRow label="Company" links={threadId ? <LinkCompanyPopover threadId={threadId} /> : undefined}>Not linked</PropRow>
          )}
          {companyId && (
            <PropRow label="Employment Benefits">
              <PlainLink href={`/companies/${companyId}?tab=eb`}>Quotations</PlainLink>
            </PropRow>
          )}
          {companyId && (() => {
            if (!detail) return <PropRow label="Policy"><span className="text-trs-muted">…</span></PropRow>
            if (!policy) return <PropRow label="Policy"><span className="text-trs-muted">None active on file</span></PropRow>
            const insurers = listValue((policy.insurer ?? '').split(/\s*[,;]\s*/))
            const facts = [insurers?.text, policy.policy_number].filter(Boolean).join(' · ')
            const factsTitle = [insurers?.title, policy.policy_number].filter(Boolean).join(' · ')
            return (
              <PropRow label="Policy" title={policy.class_of_insurance ?? 'Policy'} sub={facts || null} subTitle={factsTitle || null}
                links={<><PlainLink href={`/debit-notes?company_id=${companyId}`}>Debit notes</PlainLink><PlainLink href={`/claims?company=${companyId}`}>Claims</PlainLink></>}>
                <PlainLink href={`/policies/${policy.id}`}>{policy.class_of_insurance ?? 'Policy'}</PlainLink>
              </PropRow>
            )
          })()}
          {companyId && detail && policy?.end_date && (
            <PropRow label="Renewal" sub={<>{relativeDays(policy.end_date, today)} · <PlainLink href={`/calendar?date=${policy.end_date.slice(0, 10)}`}>Calendar</PlainLink></>}>
              <span className="tabular-nums">{fmtDate(policy.end_date)}</span>
            </PropRow>
          )}
          {companyId && (
            <PropRow label="Outstanding" sub={detail ? `${detail.paymentSummary.openCount} debit note${detail.paymentSummary.openCount === 1 ? '' : 's'}` : null}>
              {!detail ? <span className="text-trs-muted">…</span> : <span className="tabular-nums">{sgd ? fmtMoney(sgd.outstanding, sgd.currency) : 'SGD 0.00'}</span>}
            </PropRow>
          )}
          {(contact || lead.email) && (
            <PropRow label="Contact" title={contact || lead.email} sub={contact && lead.email ? lead.email : null} subTitle={lead.email}>{contact || lead.email}</PropRow>
          )}
          {companyId && related && threadList.some(t => t.id !== activeThreadId) && (
            <InfoRow label="Threads">
              <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                {threadList.map(t => {
                  const on = activeThreadId === t.id
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => onSelectThread(t.id)} aria-current={on ? 'true' : undefined}
                        className={cn('w-full text-left bg-transparent border-0 border-l-2 border-solid p-0 pl-2 cursor-pointer', on ? 'font-medium border-trs-green' : 'border-transparent')}>
                        <span className="block text-body truncate text-trs-ink">{t.subject ?? '(no subject)'}</span>
                        <span className="block text-small truncate text-trs-muted">{t.needsReply ? 'Awaiting your reply · ' : ''}{timeAgo(t.last_message_at)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </InfoRow>
          )}

          {/* Status, notes, conversations and draft history: the existing panel, folded. */}
          <details className="mt-3" onToggle={e => { if (e.currentTarget.open) setStatusOpen(true) }}>
            <summary className="cursor-pointer text-body list-none [&::-webkit-details-marker]:hidden text-trs-ink"><span className="inline-block w-4 text-trs-subtle" >›</span>Status and notes</summary>
            <section className="mt-2" aria-label="Contact and status">
              <div className="[--ea-context-w:100%]">
                {statusOpen && <EngagementContextPanel lead={lead} messages={messages} threadId={threadId} conversationThreadId={conversationThreadId} activeThreadId={activeThreadId}
                  onSelectThread={onSelectThread} onStatus={onStatus} onTransfer={onTransfer} onRestoreDraft={onRestoreDraft} />}
              </div>
            </section>
          </details>
        </Group>
      </div>
    </aside>
  )
}

function relativeDays(iso: string, today: string): string {
  const d = daysUntil(iso, today)!
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

function WorkRow({ t, today, nameOf }: { t: BoardTask; today: string; nameOf: (e: string | null) => string | null }) {
  const d = t.due_on ? daysUntil(t.due_on, today) : null
  const due = d === null ? null : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d > 1 && d < 7 ? new Date(t.due_on!).toLocaleDateString('en-SG', { weekday: 'short' }) : d >= 7 ? fmtDate(t.due_on!) : `${-d} day${d === -1 ? '' : 's'} late`
  const who = nameOf(t.primary_assignee)?.split(' ')[0] ?? null
  return (
    <li className="flex items-start justify-between gap-2 py-1 text-body">
      <span className="min-w-0 leading-[1.4] text-trs-ink">{t.title}</span>
      <span className="flex-shrink-0 whitespace-nowrap text-trs-muted">{[who, due].filter(Boolean).join(' · ')}</span>
    </li>
  )
}
