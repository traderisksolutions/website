'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AppScrollPage } from '@/components/app-shell'
import { CompanyHeader } from '@/components/crm/CompanyHeader'
import { BriefCard } from '@/components/crm/BriefCard'
import { ActionsPanel } from '@/components/crm/ActionsPanel'
import { PeoplePanel } from '@/components/crm/PeoplePanel'
import { PaymentsPanel } from '@/components/crm/PaymentsPanel'
import { QuotesPanel } from '@/components/crm/QuotesPanel'
import { ThreadsPanel } from '@/components/crm/ThreadsPanel'
import { CasesPanel } from '@/components/crm/CasesPanel'
import { CompanyTimeline } from '@/components/crm/CompanyTimeline'
import { NewCaseDialog } from '@/components/crm/dialogs'
import { SectionCard, Spinner, Empty } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/crm/format'
import type { Company, CompanyAction, CompanyThread, Person, PaymentDerived, PaymentSummary, QuoteRow, CaseRow, ActivityEvent, AiBrief, Stage } from '@/lib/crm/types'

type Detail = {
  company: Company
  contactList: { id: string; name: string; email: string | null; phone: string | null }[]
  policies: { id: string; policy_number: string | null; insurer: string | null; class_of_insurance: string | null; currency: string | null; premium: number | null; start_date: string | null; end_date: string | null; status: string | null }[]
  payments: PaymentDerived[]
  paymentSummary: PaymentSummary
  summary: { contactCount: number; activePolicies: number; nextRenewalDate: string | null; openDebitNoteCount: number; overdueCount: number }
}

const TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'threads', label: 'Threads' }, { key: 'people', label: 'People' },
  { key: 'quotes', label: 'Quotes' }, { key: 'payments', label: 'Payments' }, { key: 'cases', label: 'Cases' },
  { key: 'actions', label: 'Actions' }, { key: 'activity', label: 'Activity' }, { key: 'policies', label: 'Policies' },
] as const
type Tab = typeof TABS[number]['key']

export default function CompanyWorkspacePage() {
  return <Suspense fallback={<Spinner />}><CompanyWorkspace /></Suspense>
}

function CompanyWorkspace() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const tab = (TABS.some(t => t.key === search.get('tab')) ? search.get('tab') : 'overview') as Tab
  const setTab = (t: Tab) => router.replace(`/companies/${id}${t === 'overview' ? '' : `?tab=${t}`}`)

  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [threads, setThreads] = useState<CompanyThread[] | null>(null)
  const [people, setPeople] = useState<{ people: Person[]; observedDomains: { domain: string; count: number }[] } | null>(null)
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null)
  const [cases, setCases] = useState<CaseRow[] | null>(null)
  const [actions, setActions] = useState<CompanyAction[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
  const [caseDialog, setCaseDialog] = useState<{ open: boolean; threadIds: string[] }>({ open: false, threadIds: [] })

  const j = useCallback(async <T,>(path: string, fallback: T): Promise<T> => {
    try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.json() : fallback } catch { return fallback }
  }, [])

  const loadAll = useCallback(async () => {
    const d = await fetch(`/api/companies/${id}`, { cache: 'no-store' })
    if (!d.ok) { setError(d.status === 404 ? 'Company not found.' : 'Could not load this company.'); return }
    setDetail(await d.json())
    void Promise.all([
      j<{ threads: CompanyThread[] }>(`/api/companies/${id}/threads`, { threads: [] }).then(r => setThreads(r.threads)),
      j<{ people: Person[]; observedDomains: { domain: string; count: number }[] }>(`/api/companies/${id}/people`, { people: [], observedDomains: [] }).then(setPeople),
      j<{ quotes: QuoteRow[] }>(`/api/companies/${id}/quotes`, { quotes: [] }).then(r => setQuotes(r.quotes)),
      j<{ cases: CaseRow[] }>(`/api/companies/${id}/cases`, { cases: [] }).then(r => setCases(r.cases)),
      j<{ actions: CompanyAction[] }>(`/api/companies/${id}/actions`, { actions: [] }).then(r => setActions(r.actions)),
      j<{ events: ActivityEvent[] }>(`/api/companies/${id}/activity`, { events: [] }).then(r => setActivity(r.events)),
    ])
  }, [id, j])

  useEffect(() => { loadAll() }, [loadAll])

  // Tell the chat dock which company is open so "Ask about this company" has the right scope.
  useEffect(() => {
    if (!detail) return
    window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: detail.company.id, name: detail.company.name } }))
    return () => { window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: null, name: null } })) }
  }, [detail])

  const needsReply = useMemo(() => threads?.filter(t => t.needsReply).length ?? 0, [threads])
  const openActions = useMemo(() => actions?.filter(a => a.status === 'open').length ?? 0, [actions])

  async function patchCompany(body: Record<string, unknown>) {
    const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Could not save.')
    setDetail(prev => prev ? { ...prev, company: d.company } : prev)
    return d.company as Company
  }

  async function addActionFromBrief(item: AiBrief['open_items'][number]) {
    const res = await fetch(`/api/companies/${id}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: item.title, detail: item.detail ?? null, kind: item.kind ?? 'general', due_date: item.due ?? null }) })
    const d = await res.json()
    if (res.ok) setActions(prev => [d.action, ...(prev ?? [])])
  }

  if (error) {
    return (
      <AppScrollPage maxWidth="1240px">
        <p className="text-[14px] text-destructive mb-2">{error}</p>
        <Link href="/companies" className="text-[13px] text-primary hover:underline">← Back to Companies</Link>
      </AppScrollPage>
    )
  }
  if (!detail) return <Spinner label="Loading company…" />

  const { company } = detail

  return (
    <AppScrollPage maxWidth="1240px">
      <CompanyHeader
        company={company}
        summary={detail.summary}
        paymentSummary={detail.paymentSummary}
        needsReply={needsReply}
        openActions={openActions}
        onCompany={c => setDetail(prev => prev ? { ...prev, company: c } : prev)}
        onStage={async (s: Stage) => { await patchCompany({ stage: s }) }}
        onAskAi={() => window.dispatchEvent(new CustomEvent('chat:open'))}
      />

      <div className="flex border-b border-[--border-subtle] mb-4 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map(t => {
          const badge = t.key === 'threads' ? needsReply : t.key === 'actions' ? (actions?.filter(a => a.status === 'proposed').length ?? 0) : t.key === 'payments' ? detail.summary.overdueCount : 0
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn('inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 border-0 bg-transparent cursor-pointer text-[13px] border-b-2 -mb-px transition-colors',
                tab === t.key ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t.label}
              {badge > 0 && <span className="text-[10px] font-semibold rounded-[5px] px-1 leading-4" style={{ background: t.key === 'payments' ? 'var(--error-bg)' : 'var(--primary-badge-bg)', color: t.key === 'payments' ? 'var(--error)' : 'var(--primary-hex)' }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 flex flex-col gap-4 min-w-0">
            <BriefCard company={company} onBrief={b => setDetail(prev => prev ? { ...prev, company: { ...prev.company, ai_brief: b, ai_brief_at: b.generated_at, ai_brief_model: b.model } } : prev)} onAddAction={addActionFromBrief} onApplyStage={async s => { await patchCompany({ stage: s }) }} />
            {actions ? <ActionsPanel companyId={id} actions={actions} onChange={setActions} compact /> : <Spinner />}
            {threads ? <ThreadsPanel threads={threads} compact /> : <Spinner />}
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            {people ? <PeoplePanel people={people.people} limit={4} /> : <Spinner />}
            <PaymentsPanel companyId={id} notes={detail.payments} summary={detail.paymentSummary} compact />
            {quotes ? <QuotesPanel companyId={id} quotes={quotes} compact /> : <Spinner />}
            {cases ? <CasesPanel cases={cases} onNew={() => setCaseDialog({ open: true, threadIds: [] })} compact /> : <Spinner />}
            {activity ? <CompanyTimeline events={activity} limit={8} /> : <Spinner />}
          </div>
        </div>
      )}

      {tab === 'threads' && (threads ? <ThreadsPanel threads={threads} onCombine={ids => setCaseDialog({ open: true, threadIds: ids })} /> : <Spinner />)}

      {tab === 'people' && (people ? (
        <PeoplePanel
          people={people.people}
          observedDomains={people.observedDomains}
          knownDomains={company.domains}
          onAddDomain={async d => { await patchCompany({ domains: [...company.domains, d] }) }}
        />
      ) : <Spinner />)}

      {tab === 'quotes' && (quotes ? <QuotesPanel companyId={id} quotes={quotes} /> : <Spinner />)}
      {tab === 'payments' && <PaymentsPanel companyId={id} notes={detail.payments} summary={detail.paymentSummary} />}
      {tab === 'cases' && (cases ? <CasesPanel cases={cases} onNew={() => setCaseDialog({ open: true, threadIds: [] })} /> : <Spinner />)}
      {tab === 'actions' && (actions ? <ActionsPanel companyId={id} actions={actions} onChange={setActions} /> : <Spinner />)}
      {tab === 'activity' && (activity ? <CompanyTimeline events={activity} /> : <Spinner />)}

      {tab === 'policies' && (
        <SectionCard title="Policies" description="Policies placed through TRS, from debit-note imports." padded={false}>
          {detail.policies.length === 0 && <Empty compact>No policies on file.</Empty>}
          {detail.policies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[600px]">
                <thead><tr className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ background: 'var(--table-header-bg)' }}>
                  <th className="text-left px-4 py-2 font-semibold">Policy</th><th className="text-left px-3 py-2 font-semibold">Insurer</th><th className="text-left px-3 py-2 font-semibold">Class</th><th className="text-left px-3 py-2 font-semibold">Period</th><th className="text-left px-3 py-2 font-semibold">Status</th>
                </tr></thead>
                <tbody>
                  {detail.policies.map(p => (
                    <tr key={p.id} className="border-b border-[--border-subtle]">
                      <td className="px-4 py-2 font-mono text-[11.5px]">{p.policy_number ?? '—'}</td>
                      <td className="px-3 py-2">{p.insurer ?? '—'}</td>
                      <td className="px-3 py-2">{p.class_of_insurance ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</td>
                      <td className="px-3 py-2 capitalize">{p.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <NewCaseDialog
        open={caseDialog.open}
        onClose={() => setCaseDialog({ open: false, threadIds: [] })}
        companyId={id}
        companyName={company.name}
        threadIds={caseDialog.threadIds}
        onCreated={caseId => router.push(`/nexus?case=${caseId}`)}
      />
    </AppScrollPage>
  )
}
