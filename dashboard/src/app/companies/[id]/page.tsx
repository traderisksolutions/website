'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { CompanyHeader } from '@/components/crm/CompanyHeader'
import { AlertsPanel, LeftOffPanel } from '@/components/crm/AlertsPanel'
import { CompanyNexus } from '@/components/crm/CompanyNexus'
import { PeoplePanel } from '@/components/crm/PeoplePanel'
import { PoliciesPanel, type Policy } from '@/components/crm/PoliciesPanel'
import { CompanyQuotation } from '@/components/crm/CompanyQuotation'
import { CompanyPayments } from '@/components/crm/CompanyPayments'
import { CompanyMail } from '@/components/crm/CompanyMail'
import { CompanyTimeline } from '@/components/crm/CompanyTimeline'
import { Spinner } from '@/components/crm/primitives'
import type {
  Company, CompanyThread, Person, PaymentDerived, PaymentSummary,
  QuoteRow, ActivityEvent, Stage, Alert, LeftOff, CaseRow,
} from '@/lib/crm/types'

type Overview = {
  company: Company
  alerts: Alert[]
  leftOff: LeftOff
  lastThreads: CompanyThread[]
  stakeholders: Person[]
  needsReply: number
  statusLine: string
  summaryStale: boolean
}
type Detail = {
  contactList: { id: string; name: string; email: string | null; phone: string | null }[]
  policies: Policy[]
  payments: PaymentDerived[]
  paymentSummary: PaymentSummary
}

const TABS = [
  { key: 'overview',  label: 'Overview'            },
  { key: 'nexus',     label: 'Nexus'               },
  { key: 'threads',   label: 'Threads'             },
  { key: 'people',    label: 'People'              },
  { key: 'purchases', label: 'Purchase History'    },
  { key: 'quotation', label: 'Quotation'           },
  { key: 'payments',  label: 'Finance'             },
  { key: 'activity',  label: 'Activity'            },
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
  const setTab = (t: Tab) => router.replace(`/companies/${id}${t === 'overview' ? '' : `?tab=${t}`}`, { scroll: false })

  const [ov, setOv] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [threads, setThreads] = useState<CompanyThread[] | null>(null)
  const [people, setPeople] = useState<{ people: Person[]; observedDomains: { domain: string; count: number }[] } | null>(null)
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null)
  const [cases, setCases] = useState<CaseRow[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const j = useCallback(async <T,>(path: string, fallback: T): Promise<T> => {
    try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.json() : fallback } catch { return fallback }
  }, [])

  useEffect(() => { createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null)).catch(() => {}) }, [])

  useEffect(() => {
    let live = true
    fetch(`/api/companies/${id}/overview`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) { setError(r.status === 404 ? 'Company not found.' : 'Could not load this company.'); return }
        if (live) setOv(await r.json())
      })
      .catch(() => setError('Could not load this company.'))
    return () => { live = false }
  }, [id])

  const loadThreads = useCallback(() => j<{ threads: CompanyThread[] }>(`/api/companies/${id}/threads`, { threads: [] }).then(r => setThreads(r.threads)), [id, j])
  const loadCases = useCallback(() => j<{ cases: CaseRow[] }>(`/api/companies/${id}/cases`, { cases: [] }).then(r => setCases(r.cases)), [id, j])
  const reloadDetail = useCallback(() => {
    void j<Detail>(`/api/companies/${id}`, { contactList: [], policies: [], payments: [], paymentSummary: { byCurrency: [], overdueCount: 0, openCount: 0, nextDue: null } }).then(setDetail)
  }, [id, j])

  // Everything else loads in the background so any tab is instant once open.
  useEffect(() => {
    void Promise.all([
      j<Detail>(`/api/companies/${id}`, { contactList: [], policies: [], payments: [], paymentSummary: { byCurrency: [], overdueCount: 0, openCount: 0, nextDue: null } }).then(setDetail),
      loadThreads(),
      loadCases(),
      j<{ people: Person[]; observedDomains: { domain: string; count: number }[] }>(`/api/companies/${id}/people`, { people: [], observedDomains: [] }).then(setPeople),
      j<{ quotes: QuoteRow[] }>(`/api/companies/${id}/quotes`, { quotes: [] }).then(r => setQuotes(r.quotes)),
      j<{ events: ActivityEvent[] }>(`/api/companies/${id}/activity`, { events: [] }).then(r => setActivity(r.events)),
    ])
  }, [id, j, loadThreads, loadCases])

  // Tell the chat dock which company is open so "Ask AI" has the right scope.
  useEffect(() => {
    if (!ov) return
    window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: ov.company.id, name: ov.company.name } }))
    return () => { window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: null, name: null } })) }
  }, [ov])

  async function patchCompany(body: Record<string, unknown>) {
    const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Could not save.')
    setOv(prev => prev ? { ...prev, company: d.company } : prev)
    return d.company as Company
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <p className="text-[14px] text-destructive mb-2">{error}</p>
        <Link href="/companies" className="text-[13px] text-primary hover:underline">← Back to Companies</Link>
      </div>
    )
  }
  if (!ov) return <Spinner label="Loading company…" />

  const { company } = ov

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <CompanyHeader
          company={company}
          statusLine={ov.statusLine}
          onCompany={c => setOv(prev => prev ? { ...prev, company: c } : prev)}
          onStage={async (s: Stage) => { await patchCompany({ stage: s }) }}
          onAskAi={() => window.dispatchEvent(new CustomEvent('chat:open'))}
        />

        {/* Eight tabs on one line from laptop width up; only a phone ever scrolls them. */}
        <div className="flex border-b border-[--border-subtle] mb-1 overflow-x-auto lg:overflow-visible -mx-6 px-6 sm:mx-0 sm:px-0" role="tablist">
          {TABS.map(t => {
            const badge = t.key === 'overview' ? ov.alerts.filter(a => a.tone === 'red' || a.tone === 'amber').length
              : t.key === 'threads' ? ov.needsReply
              : t.key === 'payments' ? (detail?.paymentSummary.overdueCount ?? 0)
              : t.key === 'nexus' ? (cases?.length ?? 0)
              : 0
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn('inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap px-2.5 py-2 border-0 bg-transparent cursor-pointer text-[12.5px] border-b-2 -mb-px transition-colors',
                  tab === t.key ? 'border-primary text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {t.label}
                {badge > 0 && <span className="text-[10px] font-semibold rounded-[5px] px-1 leading-4" style={{ background: 'var(--neutral-status-bg)', color: 'var(--neutral-status-fg)' }}>{badge}</span>}
              </button>
            )
          })}
        </div>

        {tab === 'overview' && (
          <>
            <AlertsPanel alerts={ov.alerts} />
            <LeftOffPanel leftOff={ov.leftOff} />
          </>
        )}

        {tab === 'nexus' && (threads && cases ? (
          <CompanyNexus
            company={company}
            threads={threads}
            cases={cases}
            stakeholders={ov.stakeholders}
            summaryStale={ov.summaryStale}
            userEmail={userEmail}
            onBrief={b => setOv(prev => prev ? { ...prev, company: { ...prev.company, ai_brief: b, ai_brief_at: b.generated_at, ai_brief_model: b.model }, summaryStale: false } : prev)}
            onApplyStage={async s => { await patchCompany({ stage: s }) }}
            onCasesChanged={() => { void loadCases(); void loadThreads() }}
          />
        ) : <Spinner />)}

        {tab === 'threads' && (threads ? (
          <CompanyMail threads={threads} companyId={id} companyName={company.name} onRefresh={() => { setThreads(null); void loadThreads() }} />
        ) : <Spinner />)}

        {tab === 'people' && (people ? (
          <PeoplePanel
            people={people.people}
            observedDomains={people.observedDomains}
            knownDomains={company.domains}
            onAddDomain={async d => { await patchCompany({ domains: [...company.domains, d] }) }}
          />
        ) : <Spinner />)}

        {tab === 'purchases' && (detail ? <PoliciesPanel policies={detail.policies} /> : <Spinner />)}

        {tab === 'quotation' && (quotes && threads ? (
          <CompanyQuotation companyId={id} companyName={company.name} quotes={quotes} threads={threads} />
        ) : <Spinner />)}

        {tab === 'payments' && (detail ? (
          <CompanyPayments companyId={id} notes={detail.payments} summary={detail.paymentSummary} onChanged={reloadDetail} />
        ) : <Spinner />)}

        {tab === 'activity' && (activity ? <CompanyTimeline events={activity} /> : <Spinner />)}
      </div>
    </div>
  )
}
