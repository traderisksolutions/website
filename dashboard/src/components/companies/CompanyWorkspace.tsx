'use client'

import { CompanyEb } from '@/components/companies/CompanyEb'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CompanyHeader } from '@/components/crm/CompanyHeader'
import { AlertsPanel, LeftOffPanel } from '@/components/crm/AlertsPanel'
import { AccountNotesPanel } from '@/components/crm/AccountNotesPanel'
import { CompanyNexus } from '@/components/crm/CompanyNexus'
import { PeoplePanel } from '@/components/crm/PeoplePanel'
import { CompanyQuotes } from '@/components/crm/CompanyQuotes'
import { CompanyPayments } from '@/components/crm/CompanyPayments'
import { CompanyMail } from '@/components/crm/CompanyMail'
import { CompanyThreadList } from '@/components/crm/CompanyThreadList'
import { CompanyLog } from '@/components/crm/CompanyLog'
import { Segmented, Spinner } from '@/components/crm/primitives'
import { ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PoliciesRegister } from '@/components/policies/PoliciesRegister'
import { DataRoom } from '@/components/documents/DataRoom'
import { companyFacts } from '@/lib/companies/facts'
import { CompanyRail } from '@/components/companies/CompanyRail'
import { WorkingOn } from '@/components/policies/WorkingOn'
import { ProposalTrack } from '@/components/eb/ProposalTrack'
import { AppointmentLetterDialog } from '@/components/letters/AppointmentLetterDialog'
import type { LetterStatus } from '@/lib/letters/appointment'
import { MembersPanel } from '@/components/policies/MembersPanel'
import { ReviewDraftsDrawer, type QueueItem } from '@/components/placement/ReviewDraftsDrawer'
import type { PolicyView } from '@/components/policies/types'
import type { ActivityEvent, CaseRow, Company, CompanyThread, PaymentDerived, PaymentSummary, Stage } from '@/lib/crm/types'
import type { CompanyWorkspaceData, PlacementData, WorkspaceOverview } from '@/lib/companies/workspace'
import { CompanyKnowledge } from '@/components/assistant/CompanyKnowledge'
import { CompanyClaims } from '@/components/companies/CompanyClaims'
import { Breadcrumbs } from '@/components/nav/Breadcrumbs'
import { PageFrame } from '@/components/page-frame'

type Detail = { payments: PaymentDerived[]; paymentSummary: PaymentSummary }

/**
 * The Workbench order (19 Nov 2026): what the client holds, what is being worked on, then quotes,
 * claims, mail, files, people, money and the log. The rest follow. Renewals folded into Policies
 * (20 Nov 2026): the Renews column and the soonest-renewal order.
 */
const MAIN_TABS = [
  { key: 'policies', label: 'Policies' },
  { key: 'working',  label: 'Working on' },
  { key: 'quotes',   label: 'Quotes' },
  { key: 'claims',   label: 'Claims' },
  { key: 'threads',  label: 'Threads' },
  { key: 'documents', label: 'Documents' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'payments', label: 'Finance' },
  { key: 'log',      label: 'Activity' },
] as const
const MORE_TABS = [
  { key: 'eb',       label: 'Employment Benefits' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'members',  label: 'Employees' },
  { key: 'nexus',    label: 'Nexus' },
] as const
const TABS = [...MAIN_TABS, ...MORE_TABS]
type Tab = typeof TABS[number]['key']
const DEFAULT_TAB: Tab = 'policies'
type ThreadView = 'list' | 'reader'
/** Older links still name the tabs that were folded or renamed. */
const TAB_ALIAS: Record<string, Tab> = { quotation: 'quotes', activity: 'log', overview: 'contacts', people: 'contacts', purchases: 'policies', employees: 'members', renewals: 'policies' }
/** A policy still being quoted belongs with the requests; the rest are on the books. */
const QUOTING = new Set(['quoting', 'presented'])
const EMPTY_BUNDLE: PlacementData = { bundle: { placements: [], lines: [], rounds: [], dispatches: [], quotes: [], tiers: [], log: [] }, positions: [] }
const EMPTY_DETAIL: Detail = { payments: [], paymentSummary: { byCurrency: [], overdueCount: 0, openCount: 0, nextDue: null } }

/**
 * Changes the address without a server round trip. router.replace would re-render the server page
 * and re-read the whole company on every tab click; Next keeps useSearchParams in step with this.
 */
function replaceUrl(url: string) { window.history.replaceState(null, '', url) }

/**
 * The company page. The server reads what the Policies tab, the header, the rail and the tab counts
 * show (src/lib/companies/workspace.ts) and passes it in; nothing is fetched on arrival. Cases load
 * when Nexus first opens, the activity log when Activity does; reloads after a change go through the API.
 */
export function CompanyWorkspace({ id, initial }: { id: string; initial: CompanyWorkspaceData }) {
  const router = useRouter()
  const search = useSearchParams()
  const asked = search.get('tab') ?? ''
  const tab: Tab = TABS.some(t => t.key === asked) ? asked as Tab : TAB_ALIAS[asked] ?? DEFAULT_TAB
  const setTab = (t: Tab) => { replaceUrl(`/companies/${id}${t === DEFAULT_TAB ? '' : `?tab=${t}`}`) }
  // Threads opens on the list by relevance; the reader is one click away and a row opens it on that thread.
  const threadView: ThreadView = search.get('view') === 'reader' ? 'reader' : 'list'
  const openThreadId = search.get('thread')
  const setThreadView = (v: ThreadView, threadId?: string) => { replaceUrl(`/companies/${id}?tab=threads${v === 'reader' ? '&view=reader' : ''}${threadId ? `&thread=${threadId}` : ''}`) }

  const [ov, setOv] = useState<WorkspaceOverview>(initial.overview)
  const [detail, setDetail] = useState<Detail>(initial.payments)
  const [threads, setThreads] = useState<CompanyThread[] | null>(initial.threads)
  const [threadsHidden, setThreadsHidden] = useState(initial.threadsHidden)
  const { people, quotes, docStatus, docFiles, userEmail } = initial
  const [placementData, setPlacementData] = useState<PlacementData>(initial.placements)
  const [policies, setPolicies] = useState<PolicyView[]>(initial.policies)
  const [cases, setCases] = useState<CaseRow[] | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null)
  const [draftsCount, setDraftsCount] = useState<number | null>(initial.draftsCount)
  // ?drafts=1 (the Home board's "Drafts to approve" link) opens the drafts workspace on arrival.
  const [draftsOpen, setDraftsOpen] = useState(() => search.get('drafts') === '1')
  // A dispatch or draft id to open the workspace on (a "Drafted" cell in the comparison grid).
  const [draftsFocus, setDraftsFocus] = useState<string | null>(null)
  const openDrafts = useCallback((focus?: string) => { setDraftsFocus(focus ?? null); setDraftsOpen(true) }, [])
  const [letter, setLetter] = useState<LetterStatus | null>(initial.letter)
  const [letterOpen, setLetterOpen] = useState(false)
  const [claimsOpen, setClaimsOpen] = useState<number | null>(null)

  // Each read records its own failure so the tab that shows it can say what failed (not an empty
  // list). The server's read hands over its failures under the same keys.
  const [failed, setFailed] = useState<Record<string, string>>(initial.failed)
  const j = useCallback(async <T,>(path: string, fallback: T): Promise<T> => {
    const key = path.split('?')[0].replace(`/api/companies/${id}`, '') || 'detail'
    try {
      const r = await fetch(path, { cache: 'no-store' })
      if (r.ok) { setFailed(f => { if (!(key in f)) return f; const n = { ...f }; delete n[key]; return n }); return await r.json() }
      const d = await r.json().catch(() => ({})) as { error?: string }
      setFailed(f => ({ ...f, [key]: d.error ?? `Could not load (${r.status}).` }))
      return fallback
    } catch (e) {
      setFailed(f => ({ ...f, [key]: e instanceof Error ? e.message : 'Could not load.' }))
      return fallback
    }
  }, [id])
  /** The red line a tab shows when its data did not load. */
  const failure = (...keys: string[]) => {
    const k = keys.find(x => failed[x])
    return k ? <p className="m-0 mb-4 text-sm text-trs-neg" role="alert">This tab did not load: {failed[k]}</p> : null
  }

  const loadThreads = useCallback(() => j<{ threads: CompanyThread[]; hidden?: number }>(`/api/companies/${id}/threads`, { threads: [] }).then(r => { setThreads(r.threads); setThreadsHidden(r.hidden ?? 0) }), [id, j])
  // A thread filed under an insurer that names this client is not in the reader's list: it opens in the Inbox.
  const openThread = (threadId: string) => { if (threads?.some(t => t.id === threadId)) setThreadView('reader', threadId); else router.push(`/engagement?thread=${threadId}`) }
  const loadCases = useCallback(() => j<{ cases: CaseRow[] }>(`/api/companies/${id}/cases`, { cases: [] }).then(r => setCases(r.cases)), [id, j])
  const loadPlacements = useCallback(() => j<PlacementData>(`/api/companies/${id}/placements`, EMPTY_BUNDLE).then(setPlacementData), [id, j])
  const loadPolicies = useCallback(() => j<{ policies: PolicyView[] }>(`/api/companies/${id}/policies`, { policies: [] }).then(r => setPolicies(r.policies)), [id, j])
  const loadActivity = useCallback(() => j<{ events: ActivityEvent[] }>(`/api/companies/${id}/activity`, { events: [] }).then(r => setActivity(r.events)), [id, j])
  const loadDrafts = useCallback(() => j<{ queue: QueueItem[] }>(`/api/companies/${id}/drafts`, { queue: [] }).then(r => setDraftsCount(r.queue.length)), [id, j])
  const loadLetter = useCallback(() => j<{ status: LetterStatus | null }>(`/api/letters/appointment?company_id=${id}`, { status: null }).then(r => setLetter(r.status)), [id, j])
  const reloadDetail = useCallback(() => { void j<Detail>(`/api/companies/${id}`, EMPTY_DETAIL).then(setDetail) }, [id, j])

  // Cases (Nexus) and the activity log are read when their tab first opens, not on arrival.
  useEffect(() => { if (tab === 'nexus' && cases === null) void loadCases() }, [tab, cases, loadCases])
  useEffect(() => { if (tab === 'log' && activity === null) void loadActivity() }, [tab, activity, loadActivity])

  /** After any placement, policy or draft changes: the spine, its log (once read) and the approval count. */
  const activityRead = activity !== null
  const onSpineChanged = useCallback(() => {
    void loadPlacements(); void loadPolicies(); void loadDrafts(); reloadDetail()
    if (activityRead) void loadActivity()
  }, [loadPlacements, loadPolicies, loadActivity, loadDrafts, reloadDetail, activityRead])
  const onDraftsCount = useCallback((n: number) => setDraftsCount(n), [])
  const closeDrafts = useCallback(() => setDraftsOpen(false), [])

  // Tell the chat dock which company is open so "Ask AI" has the right scope.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: ov.company.id, name: ov.company.name } }))
    return () => { window.dispatchEvent(new CustomEvent('crm:active-company', { detail: { companyId: null, name: null } })) }
  }, [ov])

  async function patchCompany(body: Record<string, unknown>) {
    const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Could not save.')
    setOv(prev => ({ ...prev, company: d.company }))
    return d.company as Company
  }

  const { company } = ov
  const facts = companyFacts(policies, new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10))
  const existing = policies.filter(p => !QUOTING.has(p.lifecycle))
  // Policies being quoted that no request on this page covers (an employment-benefits rate run, say).
  const lineIds = new Set(placementData.bundle.lines.map(l => l.id))
  const quotingLoose = policies.filter(p => QUOTING.has(p.lifecycle) && !(p.placement_line_id && lineIds.has(p.placement_line_id)))

  // A plain count per tab, as on Companies. Never an urgency figure. Nexus and Activity count once read.
  const countFor = (t: Tab): number | null => {
    switch (t) {
      case 'policies': return existing.length
      case 'quotes': return placementData.bundle.placements.filter(p => p.status === 'open' || p.status === 'presented' || p.status === 'bound').length + quotingLoose.length
      case 'members': return policies.filter(p => p.is_eb).length
      case 'eb': return quotes.length
      case 'payments': return detail.paymentSummary.openCount
      case 'threads': return threads?.length ?? null
      case 'log': return activity === null ? null : placementData.bundle.log.length + activity.length
      case 'nexus': return cases?.length ?? null
      case 'claims': return claimsOpen
      case 'contacts': return people.people.length
      default: return null
    }
  }

  const drafts = (
    <ReviewDraftsDrawer
      companyId={id}
      open={draftsOpen}
      focus={draftsFocus}
      onClose={closeDrafts}
      onChanged={onSpineChanged}
      onCount={onDraftsCount}
      lines={placementData.bundle.lines}
      policies={policies}
    />
  )

  // Reading the client's mail is a full-screen job, so the Threads tab drops the page
  // chrome and runs edge to edge under one slim bar that continues the main navigation.
  if (tab === 'threads') {
    return (
      <div className="flex flex-col bg-white text-trs-ink h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-2 min-h-12 flex-shrink-0 bg-white border-b border-trs-line">
          <Breadcrumbs className="min-w-0" current={{ label: 'Threads', href: `/companies/${id}?tab=threads` }} fallback={{ label: company.name, href: `/companies/${id}` }} />
          <span className="text-xs flex-shrink-0 text-trs-muted">
            {threads ? `${threads.length} thread${threads.length === 1 ? '' : 's'}` : ''}
            {ov.needsReply > 0 && ` · ${ov.needsReply} awaiting reply`}
          </span>
          <Segmented<ThreadView> value={threadView} onChange={v => setThreadView(v)} label="Threads view" className="flex-shrink-0" options={[{ value: 'list', label: 'List' }, { value: 'reader', label: 'Reader' }]} />

          <div className="w-full md:w-auto md:ml-auto flex flex-wrap items-center gap-1 min-w-0" role="tablist" aria-label="Company sections">
            {TABS.filter(t => t.key !== 'threads').map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                onClick={() => setTab(t.key)}
                className="h-8 px-2.5 rounded-md border-0 bg-transparent cursor-pointer text-xs whitespace-nowrap flex-shrink-0 hover:bg-trs-field text-trs-muted"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {threadView === 'list'
            ? <div className="h-full overflow-y-auto px-4 sm:px-6 py-4">{failure('/threads')}<CompanyThreadList companyId={id} onOpen={openThread} onLinked={() => void loadThreads()} /></div>
            : failed['/threads'] ? <div className="px-4 sm:px-6 py-4">{failure('/threads')}</div>
            : threads
              ? <CompanyMail threads={threads} hidden={threadsHidden} companyId={id} companyName={company.name} fullHeight openId={openThreadId} onRefresh={() => { setThreads(null); void loadThreads() }} />
              : <Spinner label="Loading conversations…" />}
        </div>
        {drafts}
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))] bg-white text-trs-ink">
      <PageFrame className="pb-20">
        <CompanyHeader
          company={company}
          statusLine={ov.statusLine}
          facts={facts}
          team={initial.team}
          onCompany={c => setOv(prev => ({ ...prev, company: c }))}
          onStage={async (s: Stage) => { await patchCompany({ stage: s }) }}
          onNewRequest={() => setTab('working')}
        />

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
        {ov.alerts.length > 0 && <AlertsPanel alerts={ov.alerts} />}

        {/* The working tabs in one segmented row, the rest under More. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 min-w-0">
          <Segmented<Tab> variant="tabs" value={tab} onChange={setTab} label="Company sections" options={[...MAIN_TABS, ...MORE_TABS.filter(t => t.key === tab)].map(t => {
            const n = countFor(t.key)
            return { value: t.key, label: t.label, count: n !== null && n > 0 ? n : undefined }
          })} />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-trs-line-2 bg-white px-3 text-xs font-medium text-trs-ink cursor-pointer hover:bg-trs-tint">More <ChevronDown size={13} /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-56 rounded-xl border-trs-line bg-white p-1.5 shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
              {MORE_TABS.map(t => { const n = countFor(t.key); return (
                <DropdownMenuItem key={t.key} onSelect={() => setTab(t.key)} className="flex justify-between px-3 py-2 rounded-lg text-sm cursor-pointer text-trs-ink data-[highlighted]:bg-trs-tint">
                  {t.label}{n ? <span className="text-trs-muted tabular-nums">{n}</span> : null}
                </DropdownMenuItem>) })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {tab === 'working' && <><ProposalTrack companyId={id} justSent={search.get('sent') === 'proposal'} /><WorkingOn company={{ id, name: company.name }} /></>}

        {tab === 'contacts' && (
          <>
            {ov.alerts.length === 0 && <AlertsPanel alerts={ov.alerts} />}
            <LeftOffPanel leftOff={ov.leftOff} />
            <AccountNotesPanel notes={company.notes} onSave={notes => patchCompany({ notes })} />
            <PeoplePanel
              people={people.people}
              observedDomains={people.observedDomains}
              knownDomains={company.domains}
              onAddDomain={async d => { await patchCompany({ domains: [...company.domains, d] }) }}
            />
          </>
        )}

        {tab === 'documents' && <DataRoom companyId={id} />}
        {tab === 'knowledge' && <CompanyKnowledge companyId={id} />}
        {tab === 'claims' && <CompanyClaims companyId={id} onCount={setClaimsOpen} />}

        {tab === 'policies' && failure('/policies', '/data-room', '/placements')}
        {tab === 'policies' && (
          <PoliciesRegister title="" policies={existing} docStatus={docStatus} files={docFiles} bundle={placementData.bundle} payments={detail.payments}
            onChanged={onSpineChanged} onOpenDrafts={openDrafts} />
        )}

        {tab === 'eb' && <CompanyEb companyId={id} companyName={company.name} policies={policies} />}
        {tab === 'quotes' && failure('/quotes', '/placements', '/policies')}
        {tab === 'quotes' && (threads ? (
          <>
            <CompanyQuotes companyId={id} companyName={company.name} quotes={quotes} threads={threads} data={placementData} policies={policies} onChanged={onSpineChanged} onOpenDrafts={openDrafts} />
            {quotingLoose.length > 0 && (
              <PoliciesRegister title="Being quoted outside a request" policies={quotingLoose} bundle={placementData.bundle} payments={detail.payments}
                onChanged={onSpineChanged} onOpenDrafts={openDrafts} />
            )}
          </>
        ) : <Spinner />)}

        {tab === 'members' && failure('/policies', '/placements')}
        {tab === 'members' && <MembersPanel policies={policies} bundle={placementData.bundle} onChanged={onSpineChanged} onOpenDrafts={openDrafts} />}

        {tab === 'payments' && failure('detail')}
        {tab === 'payments' && <CompanyPayments companyId={id} notes={detail.payments} summary={detail.paymentSummary} onChanged={reloadDetail} />}

        {tab === 'log' && failure('/activity', '/placements')}
        {tab === 'log' && <CompanyLog bundle={placementData.bundle} events={activity} onChanged={onSpineChanged} />}

        {tab === 'nexus' && failure('/cases', '/threads')}
        {tab === 'nexus' && (threads && cases ? (
          <CompanyNexus
            company={company}
            threads={threads}
            cases={cases}
            stakeholders={ov.stakeholders}
            summaryStale={ov.summaryStale}
            userEmail={userEmail}
            onBrief={b => setOv(prev => ({ ...prev, company: { ...prev.company, ai_brief: b, ai_brief_at: b.generated_at, ai_brief_model: b.model }, summaryStale: false }))}
            onApplyStage={async s => { await patchCompany({ stage: s }) }}
            onCasesChanged={() => { void loadCases(); void loadThreads() }}
          />
        ) : <Spinner />)}
        </div>
        <CompanyRail company={company} facts={facts} letter={letter} contact={ov.stakeholders[0] ?? null} lastThread={ov.lastThreads[0] ?? null}
          draftsCount={draftsCount} onTab={t => t === 'threads' ? setThreadView('list') : setTab(t)} onDrafts={() => setDraftsOpen(true)} onLetter={() => setLetterOpen(true)} />
        </div>
      </PageFrame>
      {drafts}
      <AppointmentLetterDialog open={letterOpen} onClose={() => setLetterOpen(false)} companyId={id} onDone={() => { void loadLetter() }} />
    </div>
  )
}
