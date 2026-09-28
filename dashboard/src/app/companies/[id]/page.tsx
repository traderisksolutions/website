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
import { PoliciesPanel, type Policy, type CompanyValue } from '@/components/crm/PoliciesPanel'
import { CompanyQuotation } from '@/components/crm/CompanyQuotation'
import { CompanyPayments } from '@/components/crm/CompanyPayments'
import { CompanyMail } from '@/components/crm/CompanyMail'
import { CompanyTimeline } from '@/components/crm/CompanyTimeline'
import { Spinner } from '@/components/crm/primitives'
import type {
  Company, CompanyThread, Person, PaymentDerived, PaymentSummary,
  QuoteRow, ActivityEvent, Stage, Alert, LeftOff, CaseRow,
} from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'

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
  value?: CompanyValue
}

const TABS = [
  { key: 'overview',  label: 'Overview'            },
  { key: 'nexus',     label: 'Nexus'               },
  { key: 'threads',   label: 'Threads'             },
  { key: 'people',    label: 'People'              },
  { key: 'purchases', label: 'Purchase history'    },
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
      <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
        <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
          <Link href="/companies" className="inline-flex items-center gap-1.5 text-[14px] no-underline hover:underline" style={{ color: MUTED }}>← Companies</Link>
          <p className="m-0 mt-6 text-[16px]" style={{ color: MUTED }}>{error}</p>
        </div>
      </div>
    )
  }
  if (!ov) return <Spinner label="Loading company…" />

  const { company } = ov

  // A plain count per tab, as on Companies. Never an urgency figure.
  const countFor = (t: Tab): number | null => {
    switch (t) {
      case 'threads': return threads?.length ?? null
      case 'nexus': return cases?.length ?? null
      case 'people': return people?.people.length ?? null
      case 'purchases': return detail?.policies.length ?? null
      case 'quotation': return quotes?.length ?? null
      case 'payments': return detail?.paymentSummary.openCount ?? null
      default: return null
    }
  }

  // Reading the client's mail is a full-screen job, so the Threads tab drops the page
  // chrome and runs edge to edge under one slim bar that continues the main navigation.
  if (tab === 'threads') {
    return (
      <div className="flex flex-col bg-white" style={{ height: 'calc(100vh - 56px)', color: INK }}>
        <div className="flex items-center gap-3 px-4 sm:px-6 h-12 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #e8eaed' }}>
          <button
            type="button"
            onClick={() => setTab('overview')}
            className="inline-flex items-center gap-1 text-[14px] bg-transparent border-0 p-0 cursor-pointer flex-shrink-0 no-underline hover:underline"
            style={{ color: MUTED }}
          >
            ← Back
          </button>
          <span className="text-[14px] font-medium truncate" style={{ color: INK }}>{company.name}</span>
          <span className="text-[13px] flex-shrink-0" style={{ color: MUTED }}>
            {threads ? `${threads.length} thread${threads.length === 1 ? '' : 's'}` : ''}
            {ov.needsReply > 0 && ` · ${ov.needsReply} awaiting reply`}
          </span>

          <div className="ml-auto hidden md:flex items-center gap-1 flex-shrink-0" role="tablist">
            {TABS.filter(t => t.key !== 'threads').map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                onClick={() => setTab(t.key)}
                className="h-8 px-2.5 rounded-[8px] border-0 bg-transparent cursor-pointer text-[13px] whitespace-nowrap hover:bg-[#f1f3f4]"
                style={{ color: MUTED }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {threads
            ? <CompanyMail threads={threads} companyId={id} companyName={company.name} fullHeight onRefresh={() => { setThreads(null); void loadThreads() }} />
            : <Spinner label="Loading conversations…" />}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <CompanyHeader
          company={company}
          statusLine={ov.statusLine}
          onCompany={c => setOv(prev => prev ? { ...prev, company: c } : prev)}
          onStage={async (s: Stage) => { await patchCompany({ stage: s }) }}
          onAskAi={() => window.dispatchEvent(new CustomEvent('chat:open'))}
        />

        {/* Eight tabs on one line from laptop width up; only a phone ever scrolls them. */}
        <div className="flex items-center gap-6 mb-8 overflow-x-auto lg:overflow-visible -mx-6 px-6 sm:mx-0 sm:px-0" style={{ borderBottom: '1px solid #e8eaed' }} role="tablist">
          {TABS.map(t => {
            const on = tab === t.key
            const n = countFor(t.key)
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={cn('relative pb-3 flex-shrink-0 whitespace-nowrap bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')}
                style={{ color: on ? INK : MUTED }}
              >
                {t.label}
                {n !== null && n > 0 && <span className="ml-1.5 tabular-nums text-[13px]" style={{ color: '#80868b' }}>{n}</span>}
                <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
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

        {tab === 'people' && (people ? (
          <PeoplePanel
            people={people.people}
            observedDomains={people.observedDomains}
            knownDomains={company.domains}
            onAddDomain={async d => { await patchCompany({ domains: [...company.domains, d] }) }}
          />
        ) : <Spinner />)}

        {tab === 'purchases' && (detail ? <PoliciesPanel policies={detail.policies} value={detail.value} /> : <Spinner />)}

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
