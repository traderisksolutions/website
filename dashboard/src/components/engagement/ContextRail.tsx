'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardPayload, BoardTask } from '@/lib/crm/board'
import type { CompanyThread, PaymentDerived, PaymentSummary } from '@/lib/crm/types'
import type { Policy } from '@/components/crm/PoliciesPanel'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { daysUntil, isOpen, sortTasks } from '@/components/board/model'
import { AddToCaseControl } from './AddToCaseControl'
import { ChiefBar } from './ChiefBar'
import { LinkCompanyPopover } from './LinkCompanyPopover'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import { AiAnalysisPanel } from '@/components/engagement-agent/ai-analysis-panel'
import { EngagementContextPanel } from '@/components/engagement-agent/engagement-context-panel'
import { AiRow, Arrow, Group, InfoRow, Small, INK, BODY, MUTED, HAIR } from './rail-bits'
import type { Lead, RealMsg, StoredSummary, RagSource } from './types'
import { fullName, timeAgo } from './helpers'

/**
 * The context rail beside a thread, in three groups (11 Nov 2026):
 *   Actions      who the thread waits on and the one thing to do, the AI's suggestions, drafts,
 *                open to-dos, add to a case (src/components/engagement/ChiefBar.tsx)
 *   AI           read the thread, pricing options, summary, draft reply
 *   Information  company, policy, renewal, outstanding, contact, related threads, status and notes
 * White ground, green pill per group, spacing in place of boxes. Reads the same board and company
 * APIs as Home and Companies.
 */

let boardCache: { at: number; p: Promise<BoardPayload> } | null = null
export function loadBoard(): Promise<BoardPayload> {
  if (boardCache && Date.now() - boardCache.at < 60_000) return boardCache.p
  const p = fetch('/api/board', { cache: 'no-store' }).then(r => r.json() as Promise<BoardPayload>)
  boardCache = { at: Date.now(), p }
  return p
}

type Detail = { policies: Policy[]; payments: PaymentDerived[]; paymentSummary: PaymentSummary }

const KIND_LABEL: Record<string, string> = { client: 'Client', insurer: 'Insurer', prospect: 'Prospect', partner: 'Partner', other: 'Company' }
const QUIET_LINK = 'bg-transparent border-0 p-0 cursor-pointer text-[13px] hover:underline'

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
  const counterparty = lead.companyKind === 'insurer' || lead.companyKind === 'partner'
  const companyId = lead.clientCompanyId ?? (counterparty ? null : lead.companyId ?? null)
  const { onLinkCompany } = useEngagementNav()
  const [board, setBoard] = useState<BoardPayload | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [related, setRelated] = useState<CompanyThread[] | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)

  useEffect(() => { loadBoard().then(setBoard).catch(() => setBoard(null)) }, [taskRefresh])
  useEffect(() => {
    setDetail(null); setRelated(null)
    if (!companyId) return
    fetch(`/api/companies/${companyId}`, { cache: 'no-store' }).then(r => r.json()).then(setDetail).catch(() => {})
    fetch(`/api/companies/${companyId}/threads`, { cache: 'no-store' }).then(r => r.json()).then(d => setRelated(d.threads ?? [])).catch(() => setRelated([]))
  }, [companyId])

  const company = useMemo(() => board?.companies.find(c => c.id === companyId) ?? null, [board, companyId])
  const staff = useMemo(() => new Map((board?.staff ?? []).map(s => [s.email, s])), [board])
  const today = board?.today ?? new Date().toISOString().slice(0, 10)
  const tasks = useMemo(() => company ? sortTasks(company.tasks.filter(isOpen), today) : [], [company, today])
  const policy = useMemo(() => {
    const active = (detail?.policies ?? []).filter(p => p.status === 'active' && p.end_date).sort((a, b) => a.end_date!.localeCompare(b.end_date!))
    return active[0] ?? null
  }, [detail])
  const sgd = detail?.paymentSummary.byCurrency.find(m => m.currency === 'SGD') ?? detail?.paymentSummary.byCurrency[0] ?? null
  const others = (related ?? []).filter(t => t.id !== threadId).slice(0, 5)
  const nameOf = (email: string | null) => email ? (staff.get(email)?.name ?? email.split('@')[0]) : null
  const storedDraft = summaries[0]?.draft_reply ?? null
  const summary = summaries[0]?.summary ?? null
  const contact = fullName(lead)

  const actionsFooter = (
    <div className="flex flex-col gap-1.5">
      {companyId && board && tasks.length > 0 && (
        <ul className="m-0 p-0 list-none mb-1">
          {tasks.slice(0, 5).map(t => <WorkRow key={t.id} t={t} today={today} nameOf={nameOf} />)}
        </ul>
      )}
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: MUTED }}>
        {onAddTask && <button type="button" onClick={onAddTask} className={QUIET_LINK} style={{ color: INK }}>Add to-do</button>}
        {onAddTask && threadId && <span aria-hidden>·</span>}
        {threadId && <span className="inline-flex"><AddToCaseControl threadId={threadId} /></span>}
      </p>
    </div>
  )

  const aiExtras = (
    <>
      <AiRow title="Summary" detail={summary ? `Last read ${summaries[0]?.created_at ? timeAgo(summaries[0].created_at) : 'earlier'}` : 'The thread in a few lines, with a drafted reply'} action={summariesLoading ? 'Summarising…' : summary ? (analysisOpen ? 'Hide' : 'Show') : 'Summarise'}
        onClick={() => { if (!summary) onRefreshSummaries(); else setAnalysisOpen(v => !v) }} disabled={!threadId || summariesLoading}>
        {summary && !analysisOpen && <p className="m-0 mt-1.5 pl-[19px] text-[13px] leading-[1.5] line-clamp-3" style={{ color: BODY }}>{summary}</p>}
        {analysisOpen && (
          <div className="mt-2 pl-[19px]">
            <p className="m-0 mb-1 text-[12px]" style={{ color: MUTED }}>AI-generated. Check it against the messages before acting.</p>
            <div className="rounded-[10px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
              <AiAnalysisPanel summaries={summaries} loading={summariesLoading} threadId={threadId} latestMessageId={latestMessageId} ragSources={ragSources} onRefresh={onRefreshSummaries} />
            </div>
          </div>
        )}
      </AiRow>
      {storedDraft && <AiRow title="Draft reply" detail="From the summary, into the composer" action="Load" onClick={() => onRestoreDraft(storedDraft, 'summary')} />}
    </>
  )

  return (
    <aside className="h-full flex flex-col min-h-0 bg-white" aria-label="Context" style={{ borderLeft: onClose ? `1px solid ${HAIR}` : undefined }}>
      <div className="flex-shrink-0 flex items-center justify-between pl-[18px] pr-3 pt-4 pb-3 text-[13px]" style={{ color: MUTED }}>
        <span>Context</span>
        {onClose && <button type="button" onClick={onClose} title="Close context" aria-label="Close context" className="h-[30px] w-[30px] rounded-[10px] bg-transparent border-0 cursor-pointer inline-flex items-center justify-center hover:bg-[#f1f2ee]" style={{ color: BODY }}><X size={15} /></button>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-6">
        {threadId
          ? <ChiefBar threadId={threadId} refreshKey={latestMessageId} onOpenChange={onDraftOpen} actionsFooter={actionsFooter} aiExtras={aiExtras} />
          : <Group label="AI">{aiExtras}</Group>}

        <Group label="Information">
          <InfoRow label="Company">
            {companyId ? (
              <>
                <Arrow href={`/companies/${companyId}`}>{company?.name ?? lead.companyName ?? 'Company'}</Arrow>
                {company && <><br /><Small>{[KIND_LABEL[company.kind] ?? company.kind, company.domains[0] ?? company.domain, nameOf(company.owner_email) ?? 'No owner yet', counterparty && lead.companyName ? `via ${lead.companyName}` : null].filter(Boolean).join(' · ')}</Small></>}
              </>
            ) : counterparty && lead.companyId ? (
              <>
                <Arrow href={`/insurers/${lead.companyId}`}>{lead.companyName ?? 'Insurer'}</Arrow>
                <br /><Small>{KIND_LABEL[lead.companyKind ?? ''] ?? 'Company'}{lead.clientNamed ? ` · about ${lead.clientNamed}, not on file` : ' · client not linked'}</Small>
                {threadId && lead.clientNamed && onLinkCompany && <><br /><button type="button" onClick={() => onLinkCompany(threadId, null, lead.clientNamed!)} className={QUIET_LINK} style={{ color: INK }}>Create {lead.clientNamed} and link</button></>}
                {threadId && <><br /><LinkCompanyPopover threadId={threadId} /></>}
              </>
            ) : (
              <>Not linked{threadId && <><br /><LinkCompanyPopover threadId={threadId} /></>}</>
            )}
          </InfoRow>
          {companyId && (
            <InfoRow label="Policy">
              {!detail ? <Small>…</Small> : !policy ? <Small>None active on file</Small> : (
                <>{policy.class_of_insurance ?? 'Policy'}<br /><Small>{[policy.insurer, policy.policy_number].filter(Boolean).join(' · ')}{policy.insurer || policy.policy_number ? ' · ' : ''}<Arrow href={`/debit-notes?company_id=${companyId}`}>Debit notes</Arrow></Small></>
              )}
            </InfoRow>
          )}
          {companyId && detail && policy?.end_date && (
            <InfoRow label="Renewal">
              <span className="tabular-nums">{fmtDate(policy.end_date)}</span> <Small>· {relativeDays(policy.end_date, today)} · <Arrow href={`/calendar?date=${policy.end_date.slice(0, 10)}`}>Calendar</Arrow></Small>
            </InfoRow>
          )}
          {companyId && (
            <InfoRow label="Outstanding">
              {!detail ? <Small>…</Small> : <><span className="tabular-nums">{sgd ? fmtMoney(sgd.outstanding, sgd.currency) : 'SGD 0.00'}</span> <Small>· {detail.paymentSummary.openCount} debit note{detail.paymentSummary.openCount === 1 ? '' : 's'}</Small></>}
            </InfoRow>
          )}
          {(contact || lead.email) && (
            <InfoRow label="Contact">{contact || lead.email}{contact && lead.email && <><br /><Small>{lead.email}</Small></>}</InfoRow>
          )}
          {companyId && related && others.length > 0 && (
            <InfoRow label="Threads">
              <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                {others.map(t => (
                  <li key={t.id}>
                    <button type="button" onClick={() => onSelectThread(t.id)} aria-current={activeThreadId === t.id ? 'true' : undefined} className={cn('w-full text-left bg-transparent border-0 p-0 cursor-pointer', activeThreadId === t.id && 'font-medium')}>
                      <span className="block text-[13.5px] truncate" style={{ color: INK }}>{t.subject ?? '(no subject)'}</span>
                      <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{t.needsReply ? 'Awaiting your reply · ' : ''}{timeAgo(t.last_message_at)}</span>
                    </button>
                  </li>
                ))}
                {conversationThreadId && activeThreadId && activeThreadId !== conversationThreadId && (
                  <li><button type="button" onClick={() => onSelectThread(conversationThreadId)} className={QUIET_LINK} style={{ color: INK }}>Back to this conversation →</button></li>
                )}
              </ul>
            </InfoRow>
          )}

          {/* Status, notes, conversations and draft history: the existing panel, folded. */}
          <details className="mt-3">
            <summary className="cursor-pointer text-[13.5px] list-none [&::-webkit-details-marker]:hidden" style={{ color: INK }}><span className="inline-block w-4" style={{ color: '#8c958f' }}>›</span>Status and notes</summary>
            <section className="mt-2 rounded-[12px] overflow-hidden" style={{ border: `1px solid ${HAIR}` }} aria-label="Contact and status">
              <div style={{ '--ea-context-w': '100%' } as React.CSSProperties}>
                <EngagementContextPanel lead={lead} messages={messages} threadId={threadId} conversationThreadId={conversationThreadId} activeThreadId={activeThreadId}
                  onSelectThread={onSelectThread} onStatus={onStatus} onTransfer={onTransfer} onRestoreDraft={onRestoreDraft} />
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
    <li className="flex items-start justify-between gap-2 py-1 text-[13px]">
      <span className="min-w-0 leading-[1.4]" style={{ color: INK }}>{t.title}</span>
      <span className="flex-shrink-0 whitespace-nowrap" style={{ color: MUTED }}>{[who, due].filter(Boolean).join(' · ')}</span>
    </li>
  )
}
