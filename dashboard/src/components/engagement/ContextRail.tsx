'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardPayload, BoardTask } from '@/lib/crm/board'
import type { CompanyThread, PaymentDerived, PaymentSummary } from '@/lib/crm/types'
import type { Policy } from '@/components/crm/PoliciesPanel'
import { fmtMoney, fmtDate } from '@/lib/crm/format'
import { daysUntil, isOpen, sortTasks } from '@/components/board/model'
import { AddToCaseControl } from './AddToCaseControl'
import { LinkCompanyPopover } from './LinkCompanyPopover'
import { AiAnalysisPanel } from '@/components/engagement-agent/ai-analysis-panel'
import { EngagementContextPanel } from '@/components/engagement-agent/engagement-context-panel'
import type { Lead, RealMsg, StoredSummary, RagSource } from './types'
import { timeAgo } from './helpers'

/**
 * The context rail: what the rest of TRS knows about this thread's client, beside the message.
 * One soft field per card: Company (blue), Work (butter), Policy (lavender), Calendar (mint),
 * Finance (peach), Related threads (grey). TRS assist is a quiet grey card of text links over
 * the existing summary panel; Nexus and the contact/status/notes panel follow. Reads the same
 * board and company APIs as Home and Companies.
 */

let boardCache: { at: number; p: Promise<BoardPayload> } | null = null
export function loadBoard(): Promise<BoardPayload> {
  if (boardCache && Date.now() - boardCache.at < 60_000) return boardCache.p
  const p = fetch('/api/board', { cache: 'no-store' }).then(r => r.json() as Promise<BoardPayload>)
  boardCache = { at: Date.now(), p }
  return p
}

type Detail = { policies: Policy[]; payments: PaymentDerived[]; paymentSummary: PaymentSummary }

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const HAIR = '#e8eaed'
const FIELD = { company: '#EAF2FF', work: '#FFF6D8', policy: '#F1EEFF', calendar: '#EAF6EC', finance: '#FFF0E7', grey: '#f1f3f4' }
const KIND_LABEL: Record<string, string> = { client: 'Client', insurer: 'Insurer', prospect: 'Prospect', partner: 'Partner', other: 'Company' }
const CARD_LINK = 'inline-block mt-2.5 text-[13px] no-underline underline-offset-[3px] hover:underline decoration-[#9aa0a6] bg-transparent border-0 p-0 cursor-pointer'

export function ContextRail({ lead, messages, threadId, conversationThreadId, activeThreadId, onSelectThread, onStatus, onTransfer, onRestoreDraft, summaries, summariesLoading, latestMessageId, ragSources, onRefreshSummaries, taskRefresh, onClose, onAddTask }: {
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
  /** Bumped by the thread view after it creates a task, so Work re-reads. */
  taskRefresh: number
  /** Present when the rail is a column; inside a sheet the sheet's own close is enough. */
  onClose?: () => void
  /** Opens the "New to-do" dialog owned by the thread view. */
  onAddTask?: () => void
}) {
  const companyId = lead.companyId ?? null
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

  return (
    <aside className="h-full flex flex-col min-h-0 bg-white" aria-label="Context" style={{ borderLeft: onClose ? `1px solid ${HAIR}` : undefined }}>
      <div className="flex-shrink-0 flex items-center justify-between pl-[18px] pr-3 pt-4 pb-2 text-[13px]" style={{ color: MUTED }}>
        <span>Context</span>
        {onClose && <button type="button" onClick={onClose} title="Close context" aria-label="Close context" className="h-8 w-8 rounded-[10px] bg-transparent border-0 cursor-pointer inline-flex items-center justify-center hover:bg-[#f1f3f4]" style={{ color: BODY }}><X size={15} /></button>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-5 flex flex-col gap-2.5">
        {/* Company */}
        <Card field={FIELD.company} label="Company">
          {companyId ? (
            <>
              <p className="m-0 text-[15px] font-medium leading-[1.3]" style={{ color: INK }}>{company?.name ?? lead.companyName ?? 'Company'}</p>
              {company && <p className="m-0 mt-0.5 text-[13px]" style={{ color: BODY }}>{[company.domains[0] ?? company.domain, KIND_LABEL[company.kind] ?? company.kind].filter(Boolean).join(' · ')}</p>}
              <p className="m-0 mt-2 text-[13px]" style={{ color: BODY }}><span style={{ color: MUTED }}>Owner</span>&nbsp;&nbsp;{company ? (nameOf(company.owner_email) ?? 'No owner yet') : '…'}</p>
              <Link href={`/companies?company=${companyId}`} className={CARD_LINK} style={{ color: INK }}>Open company →</Link>
            </>
          ) : (
            <>
              <p className="m-0 text-[13px]" style={{ color: BODY }}>Not linked to a company.</p>
              {threadId && <p className="m-0 mt-2 text-[13px]"><LinkCompanyPopover threadId={threadId} /></p>}
            </>
          )}
        </Card>

        {/* Work */}
        {companyId && (
          <Card field={FIELD.work} label="Work">
            {!board ? <p className="m-0 text-[13px]" style={{ color: MUTED }}>…</p> : tasks.length === 0 ? <p className="m-0 text-[13px]" style={{ color: BODY }}>No open to-dos.</p> : (
              <ul className="m-0 p-0 list-none">
                {tasks.slice(0, 5).map((t, i) => <WorkRow key={t.id} t={t} today={today} nameOf={nameOf} first={i === 0} />)}
              </ul>
            )}
            {onAddTask && <button type="button" onClick={onAddTask} className={CARD_LINK} style={{ color: INK }}>Add to-do</button>}
          </Card>
        )}

        {/* Policy */}
        {companyId && (
          <Card field={FIELD.policy} label="Policy">
            {!detail ? <p className="m-0 text-[13px]" style={{ color: MUTED }}>…</p> : !policy ? <p className="m-0 text-[13px]" style={{ color: BODY }}>No active policy on file.</p> : (
              <>
                <p className="m-0 text-[15px] font-medium leading-[1.3]" style={{ color: INK }}>{policy.class_of_insurance ?? 'Policy'}</p>
                <p className="m-0 mt-0.5 text-[13px]" style={{ color: BODY }}>{[policy.insurer, policy.policy_number].filter(Boolean).join(' · ') || 'In force'}</p>
                <Link href={`/debit-notes?company_id=${companyId}`} className={CARD_LINK} style={{ color: INK }}>Debit notes →</Link>
              </>
            )}
          </Card>
        )}

        {/* Calendar */}
        {companyId && detail && policy?.end_date && (
          <Card field={FIELD.calendar} label="Calendar">
            <p className="m-0 text-[15px] font-medium leading-[1.3]" style={{ color: INK }}>Renewal · {policy.class_of_insurance ?? 'Policy'}</p>
            <p className="m-0 mt-0.5 text-[13px]" style={{ color: BODY }}>{fmtDate(policy.end_date)} · {relativeDays(policy.end_date, today)}</p>
            <Link href={`/calendar?date=${policy.end_date.slice(0, 10)}`} className={CARD_LINK} style={{ color: INK }}>View in Calendar →</Link>
          </Card>
        )}

        {/* Finance */}
        {companyId && (
          <Card field={FIELD.finance} label="Finance">
            {!detail ? <p className="m-0 text-[13px]" style={{ color: MUTED }}>…</p> : (
              <>
                <p className="m-0 text-[15px] font-medium leading-[1.3] tabular-nums" style={{ color: INK }}>{sgd ? fmtMoney(sgd.outstanding, sgd.currency) : 'SGD 0.00'} outstanding</p>
                <p className="m-0 mt-0.5 text-[13px] tabular-nums" style={{ color: BODY }}>Open debit notes: {detail.paymentSummary.openCount}</p>
              </>
            )}
          </Card>
        )}

        {/* Related threads */}
        {companyId && related && others.length > 0 && (
          <Card field={FIELD.grey} label="Related threads">
            <ul className="m-0 p-0 list-none flex flex-col">
              {others.map((t, i) => (
                <li key={t.id} style={{ borderTop: i > 0 ? '1px solid rgba(0,0,0,0.06)' : undefined }}>
                  <button type="button" onClick={() => onSelectThread(t.id)} aria-current={activeThreadId === t.id ? 'true' : undefined} className={cn('w-full text-left py-1.5 bg-transparent border-0 cursor-pointer', activeThreadId === t.id && 'font-medium')}>
                    <span className="block text-[13px] truncate" style={{ color: BODY }}>{t.subject ?? '(no subject)'}</span>
                    <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{t.needsReply ? 'Awaiting your reply · ' : ''}{timeAgo(t.last_message_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {conversationThreadId && activeThreadId && activeThreadId !== conversationThreadId && (
              <button type="button" onClick={() => onSelectThread(conversationThreadId)} className={CARD_LINK} style={{ color: INK }}>Back to this conversation</button>
            )}
          </Card>
        )}

        {/* TRS assist: text links over the existing handlers; the full analysis opens on demand */}
        <Card field={FIELD.grey} label="TRS assist">
          <p className="m-0 flex items-center gap-x-2 gap-y-1 flex-wrap text-[13px]">
            <AssistLink onClick={onRefreshSummaries} disabled={!threadId || summariesLoading}>{summariesLoading ? 'Summarising…' : 'Summarise'}</AssistLink>
            <Dot />
            <AssistLink onClick={() => storedDraft && onRestoreDraft(storedDraft, 'summary')} disabled={!storedDraft} title={storedDraft ? 'Load the drafted reply into the composer' : 'Summarise first to draft a reply'}>Draft reply</AssistLink>
            {onAddTask && <><Dot /><AssistLink onClick={onAddTask}>Create to-do</AssistLink></>}
            <Dot />
            <AssistLink onClick={() => setAnalysisOpen(v => !v)} aria-expanded={analysisOpen}>{analysisOpen ? 'Hide analysis' : 'Show analysis'}</AssistLink>
          </p>
          {summaries[0]?.summary && !analysisOpen && <p className="m-0 mt-2 text-[13px] leading-[1.5] line-clamp-3" style={{ color: BODY }}>{summaries[0].summary}</p>}
          {analysisOpen && (
            <div className="mt-2.5 rounded-[10px] bg-white overflow-hidden" style={{ border: `1px solid ${HAIR}` }}>
              <p className="m-0 px-3.5 pt-2.5 text-[12px]" style={{ color: MUTED }}>AI-generated. Check it against the messages before acting.</p>
              <AiAnalysisPanel summaries={summaries} loading={summariesLoading} threadId={threadId} latestMessageId={latestMessageId} ragSources={ragSources} onRefresh={onRefreshSummaries} />
            </div>
          )}
        </Card>

        {/* Nexus */}
        {threadId && (
          <Card field={FIELD.grey} label="Nexus">
            <AddToCaseControl threadId={threadId} />
          </Card>
        )}

        {/* Contact, status, notes, conversations, draft history: the existing panel */}
        <section className="rounded-[14px] overflow-hidden" style={{ border: `1px solid ${HAIR}` }} aria-label="Contact and status">
          <div style={{ '--ea-context-w': '100%' } as React.CSSProperties}>
            <EngagementContextPanel lead={lead} messages={messages} threadId={threadId} conversationThreadId={conversationThreadId} activeThreadId={activeThreadId}
              onSelectThread={onSelectThread} onStatus={onStatus} onTransfer={onTransfer} onRestoreDraft={onRestoreDraft} />
          </div>
        </section>
      </div>
    </aside>
  )
}

function Card({ field, label, children }: { field: string; label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] px-4 py-3.5" style={{ background: field }} aria-label={label}>
      <p className="m-0 mb-1.5 text-[12px]" style={{ color: MUTED }}>{label}</p>
      {children}
    </section>
  )
}

function Dot() { return <span aria-hidden style={{ color: '#9aa0a6' }}>·</span> }

function AssistLink({ children, onClick, disabled, title, ...rest }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string; 'aria-expanded'?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} {...rest}
      className="bg-transparent border-0 p-0 cursor-pointer text-[13px] underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124] disabled:cursor-default disabled:no-underline"
      style={{ color: disabled ? '#80868b' : INK }}>{children}</button>
  )
}

function relativeDays(iso: string, today: string): string {
  const d = daysUntil(iso, today)!
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

function WorkRow({ t, today, nameOf, first }: { t: BoardTask; today: string; nameOf: (e: string | null) => string | null; first?: boolean }) {
  const d = t.due_on ? daysUntil(t.due_on, today) : null
  const due = d === null ? null : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d > 1 && d < 7 ? new Date(t.due_on!).toLocaleDateString('en-SG', { weekday: 'short' }) : d >= 7 ? fmtDate(t.due_on!) : `${-d} day${d === -1 ? '' : 's'} late`
  const who = nameOf(t.primary_assignee)?.split(' ')[0] ?? null
  return (
    <li className="flex items-start justify-between gap-2 py-1.5 text-[13px]" style={{ borderTop: first ? undefined : '1px solid rgba(0,0,0,0.06)' }}>
      <span className="min-w-0 leading-[1.4]" style={{ color: INK }}>{t.title}</span>
      <span className="flex-shrink-0 whitespace-nowrap" style={{ color: MUTED }}>{[who, due].filter(Boolean).join(' · ')}</span>
    </li>
  )
}
