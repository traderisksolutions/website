'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceCampaign, WorkspaceLead, WorkspaceReply } from '@/app/api/outbound/workspace/route'
import type { CompanySummaryRow, Stage } from '@/lib/crm/types'
import { CampaignRow, CampaignPanel, CAMPAIGN_QUICK, CAMPAIGN_SORTS, inCampaignQuick, sortCampaigns, campaignAttention, INK, MUTED, type CampaignQuick, type CampaignSort } from '@/components/outreach/Campaigns'
import { LeadsGrid, LeadPanel, MoveToSalesDialog, NewCampaignDialog, SourcesView, PipelineView, LEAD_QUICK, LEAD_SORT_LABEL, inLeadQuick, sortLeads, sourceLabel, type LeadQuick, type LeadSort } from '@/components/outreach/Leads'

/**
 * Sales outreach: campaigns first, then the leads behind them, the stage view of companies
 * in the journey, and where leads come from. One read powers the whole page; the campaign
 * workspace at /outbound/campaigns/[id] remains the place a sequence is written and sent.
 */
export default function SalesOutreachPage() {
  return <Suspense fallback={null}><SalesOutreach /></Suspense>
}

type View = 'campaigns' | 'leads' | 'pipeline' | 'sources'
const VIEWS: { key: View; label: string }[] = [{ key: 'campaigns', label: 'Campaigns' }, { key: 'leads', label: 'Leads' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'sources', label: 'Sources' }]
type Workspace = { today: string; campaigns: WorkspaceCampaign[]; leads: WorkspaceLead[]; replies: WorkspaceReply[] }
type Board = { leads: unknown[]; sales: CompanySummaryRow[]; convert: CompanySummaryRow[]; operations: CompanySummaryRow[]; counts: { start: number; sales: number; convert: number; operations: number } }

function SalesOutreach() {
  const router = useRouter()
  const search = useSearchParams()
  const [ws, setWs] = useState<Workspace | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>((search.get('view') as View) || 'campaigns')
  const [q, setQ] = useState('')
  const [cQuick, setCQuick] = useState<CampaignQuick>('all')
  const [cSort, setCSort] = useState<CampaignSort>('activity')
  const [lQuick, setLQuick] = useState<LeadQuick>('all')
  const [lSource, setLSource] = useState<string | null>(null)
  const [lCampaign, setLCampaign] = useState<string | null>(null)
  const [lSort, setLSort] = useState<{ key: LeadSort; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' })
  const [campaignId, setCampaignId] = useState<string | null>(search.get('campaign'))
  const [leadId, setLeadId] = useState<string | null>(null)
  const [moving, setMoving] = useState<WorkspaceLead | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch('/api/outbound/workspace', { cache: 'no-store' }), fetch('/api/companies/pipeline', { cache: 'no-store' })])
      const wa = await a.json(); if (!a.ok) throw new Error(wa.error ?? 'Could not load campaigns.')
      setWs(wa)
      if (b.ok) setBoard(await b.json())
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { router.replace(`/pipeline${view === 'campaigns' ? '' : `?view=${view}`}${campaignId ? `${view === 'campaigns' ? '?' : '&'}campaign=${campaignId}` : ''}`, { scroll: false }) }, [view, campaignId, router])

  const needle = q.trim().toLowerCase()
  const campaigns = useMemo(() => !ws ? [] : sortCampaigns(ws.campaigns.filter(c => inCampaignQuick(c, cQuick)).filter(c => !needle || [c.name, c.product ?? '', c.headline ?? ''].join(' ').toLowerCase().includes(needle)), cSort), [ws, cQuick, cSort, needle])
  const leads = useMemo(() => !ws ? [] : sortLeads(ws.leads.filter(l => inLeadQuick(l, lQuick)).filter(l => !lSource || sourceLabel(l.source) === lSource).filter(l => !lCampaign || l.campaigns.some(c => c.id === lCampaign)).filter(l => !needle || [l.name, l.email ?? '', l.company ?? '', ...l.campaigns.map(c => c.name)].join(' ').toLowerCase().includes(needle)), lSort.key, lSort.dir), [ws, lQuick, lSource, lCampaign, needle, lSort])
  const selectedCampaign = ws?.campaigns.find(c => c.id === campaignId) ?? null
  const selectedLead = ws?.leads.find(l => l.id === leadId) ?? null

  const summary = useMemo(() => {
    if (!ws) return null
    const active = ws.campaigns.filter(c => c.status === 'active').length
    const prospects = ws.leads.filter(l => !['converted', 'dropped'].includes(l.status) && !l.doNotContact).length
    const follow = ws.leads.filter(l => inLeadQuick(l, 'follow_up')).length
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const replies = ws.replies.filter(r => r.type === 'reply' && r.receivedAt >= weekAgo).length
    const attention = ws.campaigns.filter(c => inCampaignQuick(c, 'attention')).length
    const paused = ws.campaigns.filter(c => c.status === 'paused').length, completed = ws.campaigns.filter(c => c.status === 'completed').length
    return { active, prospects, follow, replies, attention, paused, completed }
  }, [ws])

  async function setStatus(id: string, status: string) {
    const r = await fetch(`/api/outbound/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (r.ok) { setNotice(status === 'paused' ? 'Campaign paused.' : 'Campaign resumed.'); await load() } else setNotice('Could not change the status.')
  }
  async function moveStage(id: string, to: Stage) {
    setBusy(id)
    try { const r = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: to }) }); if (!r.ok) throw new Error(); await load() }
    catch { setNotice('Could not move the company.') } finally { setBusy(null) }
  }
  const onSortLeads = (k: LeadSort) => setLSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'created' ? 'desc' : 'asc' })
  const leadState = [
    `${leads.length} lead${leads.length === 1 ? '' : 's'}`,
    lQuick !== 'all' ? LEAD_QUICK.find(x => x.key === lQuick)!.label : null,
    lSource ? `Source: ${lSource}` : null,
    lCampaign ? `Campaign: ${ws?.campaigns.find(c => c.id === lCampaign)?.name ?? ''}` : null,
    needle ? `matching “${q.trim()}”` : null,
    `sorted by ${LEAD_SORT_LABEL[lSort.key]}, ${lSort.dir === 'asc' ? 'ascending' : 'descending'}`,
  ].filter(Boolean).join(' · ')
  const leadFiltered = lQuick !== 'all' || !!lSource || !!lCampaign || !!needle

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className={cn('mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20 transition-[padding]', (selectedCampaign || selectedLead) && 'lg:pr-[560px]')}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-[640px]">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Sales outreach</h1>
            <p className="m-0 mt-2 text-[16px]" style={{ color: MUTED }}>Turn new interest into qualified opportunities. Track campaigns, follow up with prospects, and move promising conversations into Sales.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={view === 'campaigns' ? 'Search campaigns' : 'Search leads, companies, campaigns'} aria-label="Search" className="h-12 w-[240px] sm:w-[320px] rounded-[12px] border bg-white pl-11 pr-4 text-[15px] outline-none focus:border-[#202124] transition-colors" style={{ borderColor: '#dadce0' }} />
            </label>
            <Link href="/outbound/leads" className="h-12 px-5 rounded-[12px] bg-white text-[15px] border no-underline inline-flex items-center hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>Import leads</Link>
            <button type="button" onClick={() => setCreating(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>New campaign</button>
          </div>
        </div>

        {summary && (
          <p className="m-0 mt-6 text-[15px]" style={{ color: '#3c4043' }}>
            <Fig n={summary.active} label={`active campaign${summary.active === 1 ? '' : 's'}`} onClick={() => { setView('campaigns'); setCQuick('active') }} /> · <Fig n={summary.prospects} label="prospects" onClick={() => { setView('leads'); setLQuick('all') }} /> · <Fig n={summary.follow} label="awaiting follow-up" onClick={() => { setView('leads'); setLQuick('follow_up') }} /> · <Fig n={summary.replies} label="replies this week" onClick={() => { setView('leads'); setLQuick('replied') }} />
          </p>
        )}
        {notice && <p className="m-0 mt-3 text-[13.5px] inline-flex items-center gap-3" style={{ color: MUTED }} role="status">{notice} <button type="button" onClick={() => setNotice(null)} className="underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Dismiss</button></p>}

        <nav className="mt-8" aria-label="Workspace views" style={{ borderBottom: '1px solid #e8eaed' }}>
          <ul className="m-0 p-0 list-none flex items-center gap-7">
            {VIEWS.map(v => { const on = view === v.key; return <li key={v.key}><button type="button" role="tab" aria-selected={on} onClick={() => setView(v.key)} className={cn('relative pb-3 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{v.label}<span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></button></li> })}
          </ul>
        </nav>

        {error && <p className="mt-8 text-[14px]" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void load()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>}
        {!ws && !error && (
          <div className="mt-8 flex flex-col gap-4" aria-busy="true">
            <div className="h-5 w-72 rounded bg-[#f1f3f4] animate-pulse" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[112px] rounded-[20px] bg-[#f1f3f4] animate-pulse" />)}
          </div>
        )}

        {ws && view === 'campaigns' && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="m-0 text-[24px] font-medium tracking-[-0.02em]">Campaigns</h2>
                <p className="m-0 mt-1 text-[13.5px] tabular-nums" style={{ color: MUTED }}>{summary!.active} active · {summary!.paused} paused · {summary!.completed} completed{summary!.attention ? ` · ${summary!.attention} need attention` : ''}</p>
              </div>
              <label className="text-[13.5px] inline-flex items-center gap-2" style={{ color: MUTED }}>Sort by
                <select value={cSort} onChange={e => setCSort(e.target.value as CampaignSort)} className="h-9 rounded-[8px] border bg-white px-2.5 text-[13.5px]" style={{ borderColor: '#dadce0', color: INK }}>{CAMPAIGN_SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
              </label>
            </div>
            <ul className="m-0 mt-4 p-0 list-none flex items-center gap-x-5 gap-y-1 flex-wrap text-[14px]">
              {CAMPAIGN_QUICK.map(k => { const on = cQuick === k.key; const n = ws.campaigns.filter(c => inCampaignQuick(c, k.key)).length; return <li key={k.key}><button type="button" onClick={() => setCQuick(k.key)} aria-pressed={on} className={cn('bg-transparent border-0 p-0 cursor-pointer', on ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: on ? INK : MUTED }}>{k.label} <span className="tabular-nums" style={{ color: '#80868b' }}>{n}</span></button></li> })}
            </ul>
            {campaigns.length === 0 ? (
              <div className="mt-8 rounded-[20px] px-8 py-12 text-center" style={{ background: '#F5F5F3' }}>
                <p className="m-0 text-[20px] font-medium">{ws.campaigns.length === 0 ? 'No campaigns yet' : 'No campaigns match'}</p>
                <p className="m-0 mt-2 text-[14.5px] max-w-[46ch] mx-auto" style={{ color: MUTED }}>{ws.campaigns.length === 0 ? 'Create a campaign to organise outreach, measure replies, and turn promising leads into opportunities.' : 'Try another view or clear the search.'}</p>
                {ws.campaigns.length === 0 && <button type="button" onClick={() => setCreating(true)} className="mt-5 h-11 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer" style={{ background: INK }}>Create campaign</button>}
              </div>
            ) : (
              <ul className="m-0 mt-5 p-0 list-none flex flex-col gap-3">
                {campaigns.map(c => <CampaignRow key={c.id} c={c} selected={campaignId === c.id} compact={!!campaignId} onOpen={() => { setLeadId(null); setCampaignId(c.id) }} />)}
              </ul>
            )}
          </div>
        )}

        {ws && view === 'leads' && (
          <div className="mt-6">
            <ul className="m-0 p-0 list-none flex items-center gap-x-5 gap-y-1 flex-wrap text-[14px]">
              {LEAD_QUICK.map(k => { const on = lQuick === k.key; const n = ws.leads.filter(l => inLeadQuick(l, k.key)).length; return <li key={k.key}><button type="button" onClick={() => setLQuick(k.key)} aria-pressed={on} className={cn('bg-transparent border-0 p-0 cursor-pointer', on ? 'font-medium underline underline-offset-[6px] decoration-2' : 'hover:underline underline-offset-[6px]')} style={{ color: on ? INK : MUTED }}>{k.label} <span className="tabular-nums" style={{ color: '#80868b' }}>{n}</span></button></li> })}
            </ul>
            <p className="m-0 mt-4 mb-3 text-[13.5px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} aria-live="polite">
              <span>{leadState}</span>
              {leadFiltered && <button type="button" onClick={() => { setLQuick('all'); setLSource(null); setLCampaign(null); setQ('') }} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Clear all</button>}
            </p>
            {leads.length === 0 ? <p className="m-0 py-14 text-center text-[15px]" style={{ color: MUTED }}>No leads match these filters. Try clearing a filter or import a new audience.</p>
              : <LeadsGrid leads={leads} sort={lSort.key} dir={lSort.dir} onSort={onSortLeads} selectedId={leadId} onSelect={l => { setCampaignId(null); setLeadId(l.id) }} highlight={needle} />}
          </div>
        )}

        {ws && view === 'pipeline' && (
          <div className="mt-6">
            <p className="m-0 mb-5 text-[14px]" style={{ color: MUTED }}>Leads that are not a company yet live under <button type="button" onClick={() => setView('leads')} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Leads</button>. Move one to Sales to create its company here.</p>
            <PipelineView board={board} onStage={moveStage} busy={busy} />
          </div>
        )}

        {ws && view === 'sources' && (
          <div className="mt-6">
            <p className="m-0 mb-5 text-[14px]" style={{ color: MUTED }}>Where leads come from and how each source performs. Click a source to see its leads.</p>
            <SourcesView leads={ws.leads} onPick={src => { setLSource(src); setLQuick('all'); setView('leads') }} />
          </div>
        )}
      </div>

      {selectedCampaign && ws && <CampaignPanel c={selectedCampaign} leads={ws.leads} replies={ws.replies} onClose={() => setCampaignId(null)} onStatus={setStatus} onMoveToSales={l => setMoving(l)} />}
      {selectedLead && <LeadPanel l={selectedLead} onClose={() => setLeadId(null)} onMoveToSales={() => setMoving(selectedLead)} />}
      {moving && <MoveToSalesDialog l={moving} onClose={() => setMoving(null)} onDone={id => { setMoving(null); setLeadId(null); setNotice(`${moving.name} moved to Sales.`); void load(); if (id) router.push(`/companies?company=${id}`) }} />}
      {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
      <span className="hidden">{campaignAttention.name}</span>
    </div>
  )
}

function Fig({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-4" style={{ color: 'inherit' }}><span className="font-medium tabular-nums" style={{ color: INK }}>{n}</span> {label}</button>
}
