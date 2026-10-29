'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { DataTableSearch } from '@/components/data-table/toolbar'
import { Button } from '@/components/ui/button'
import { Segmented, inputCls } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { ActionChip, EmailChip, OutreachChip } from '@/components/sales/chips'
import { LeadDrawer } from '@/components/sales/LeadDrawer'
import { ImportLeadsDialog } from '@/components/sales/ImportLeadsDialog'
import { DEFAULT_FILTERS, FIT_BANDS, PAGE_SIZES, activeFilterCount, parseFilters, toSearch, type LeadFilters } from '@/lib/sales/filters'
import { ACTIONS, ACTION_LABEL, EMAIL_LABEL, EMAIL_STATUSES, OUTREACH_LABEL, OUTREACH_STATUSES, locationLabel, type KpiSet, type LeadRow } from '@/lib/sales/types'
import { fmtDate, fmtDay, n } from '@/lib/sales/labels'
import type { WorkflowStatus } from '@/lib/sales/config'

const INK = '#0f1412'
const MUTED = '#4a5550'
const LOCATION_ORDER = ['SG', 'MY', 'ID', 'HK']

type Payload = { filters: LeadFilters; rows: LeadRow[]; total: number; kpis: KpiSet; workflow: WorkflowStatus }

export default function LeadsPage() {
  return <Suspense fallback={null}><Leads /></Suspense>
}

/** Leads: one row per company from the lead tool, strongest first. Opening a row shows the
 *  evidence, the people and the draft waiting for approval. */
function Leads() {
  const router = useRouter()
  const search = useSearchParams()
  const filters = useMemo(() => parseFilters(search), [search])
  const openLead = search.get('lead')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(filters.q)
  const [importOpen, setImportOpen] = useState(false)
  const [sort, setSort] = useState<{ key: 'score' | 'fit' | 'intent' | 'company' | 'newest'; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch(`/api/sales/leads${toSearch(filters)}`, { cache: 'no-store' })
      const j = await res.json()
      if (id !== reqId.current) return
      if (!res.ok) throw new Error(j.error ?? 'Could not load leads')
      setData(j); setError(null)
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (id === reqId.current) setLoading(false) }
  }, [filters])
  useEffect(() => { void load() }, [load])

  const go = useCallback((next: Partial<LeadFilters>, lead: string | null = openLead) => {
    const merged = { ...filters, ...next, page: next.page ?? 1 }
    router.replace(`/sales/leads${toSearch(merged, { lead })}`, { scroll: false })
  }, [filters, openLead, router])

  // Debounced search, 300 ms.
  useEffect(() => {
    if (q.trim() === filters.q) return
    const t = setTimeout(() => go({ q: q.trim() }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const kpis = data?.kpis
  const k = kpis ? (kpis.byLocation[filters.location === 'all' ? 'all' : filters.location] ?? kpis.byLocation.all) : null
  const locations = kpis ? Object.keys(kpis.byLocation).filter(l => l !== 'all' && kpis.byLocation[l].accounts > 0)
    .sort((a, b) => (LOCATION_ORDER.indexOf(a) + 1 || 99) - (LOCATION_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b)) : []
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / filters.pageSize))
  const first = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1
  const last = Math.min(total, filters.page * filters.pageSize)
  const filtered = activeFilterCount(filters) > 0
  const ids = rows.map(r => r.id)
  const idx = openLead ? ids.indexOf(openLead) : -1
  const openRow = useCallback((id: string | null) => go({ page: filters.page }, id), [go, filters.page])
  const sortBy = (key: typeof sort.key) => {
    const dir = sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : (key === 'company' ? 'asc' : 'desc')
    setSort({ key, dir })
    const map: Record<string, LeadFilters['sort']> = { score: 'score_desc', fit: 'fit_desc', intent: 'intent_desc', company: 'company_asc', newest: 'newest' }
    go({ sort: map[key] })
  }
  const exportHref = `/api/sales/leads/export${toSearch({ ...filters, page: 1, pageSize: DEFAULT_FILTERS.pageSize })}`

  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Leads</h1>
              <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
                {!k ? 'Loading…' : <>
                  {n(k.accounts)} companies · {n(k.contacts)} people · {n(k.verifiedContacts)} verified emails ·{' '}
                  <button type="button" onClick={() => go({ outreach: 'pending_approval' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2 text-[15px]" style={{ color: INK }}>{n(k.drafts.pending_approval ?? 0)} pending approval</button>
                  {' '}· {n(k.drafts.approved ?? 0)} approved · {n(k.drafts.sent ?? 0)} sent · {n(k.drafts.replied ?? 0)} replied
                </>}
              </p>
              {k && (
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>
                  New: <button type="button" onClick={() => go({ added: '24h', sort: 'newest' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2 text-[13.5px]" style={{ color: INK }}>{n(k.added24h)} in 24 hours</button>
                  {' · '}<button type="button" onClick={() => go({ added: '7d', sort: 'newest' })} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-2 text-[13.5px]" style={{ color: INK }}>{n(k.added7d)} in 7 days</button>
                  {kpis?.lastAddedAt && <> · last added {fmtDate(kpis.lastAddedAt, true)}</>}
                  {data && <> · email lookup {data.workflow.lookup ? 'on' : 'off'} · sending {data.workflow.sending ? 'on' : data.workflow.gmail ? 'paused' : 'off'}</>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">
              <Button size="lg" variant="outline" asChild><a href={exportHref} download>Export CSV</a></Button>
              <Button size="lg" onClick={() => setImportOpen(true)}>Import leads</Button>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Segmented value={filters.location} onChange={v => go({ location: v })}
              options={[{ value: 'all', label: 'All', count: kpis?.byLocation.all.accounts }, ...locations.map(l => ({ value: l, label: locationLabel(l), count: kpis?.byLocation[l].accounts }))]} />
          </div>

          <div className="mt-4 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #e6e8e4' }}>
            <div className="flex flex-wrap gap-2 min-w-0" role="group" aria-label="Filters">
              <FilterSelect label="Draft" value={filters.outreach} onChange={v => go({ outreach: v as LeadFilters['outreach'] })}
                options={[['any', 'Any draft'], ['none', OUTREACH_LABEL.none], ...OUTREACH_STATUSES.map(s => [s, OUTREACH_LABEL[s]] as [string, string])]} />
              <FilterSelect label="Email" value={filters.email} onChange={v => go({ email: v as LeadFilters['email'] })}
                options={[['any', 'Any email'], ...EMAIL_STATUSES.map(s => [s, EMAIL_LABEL[s]] as [string, string]), ['none', EMAIL_LABEL.none]]} />
              <FilterSelect label="Fit" value={filters.fit} onChange={v => go({ fit: v as LeadFilters['fit'] })}
                options={[['any', 'Any fit'], ['strong', `Strong ${FIT_BANDS.strong}+`], ['good', `Good ${FIT_BANDS.good}–${FIT_BANDS.strong - 1}`], ['weak', `Weak <${FIT_BANDS.good}`]]} />
              <FilterSelect label="Next step" value={filters.action} onChange={v => go({ action: v as LeadFilters['action'] })}
                options={[['any', 'Any next step'], ...ACTIONS.map(a => [a, ACTION_LABEL[a]] as [string, string])]} />
              <FilterSelect label="Contact" value={filters.hasContact} onChange={v => go({ hasContact: v as LeadFilters['hasContact'] })}
                options={[['any', 'Any contact'], ['yes', 'Has contact'], ['no', 'No contact']]} />
              <FilterSelect label="Added" value={filters.added} onChange={v => go({ added: v as LeadFilters['added'] })}
                options={[['any', 'Any time'], ['24h', 'Added in 24 hours'], ['7d', 'Added in 7 days']]} />
              {filtered && <button type="button" onClick={() => { setQ(''); go({ ...DEFAULT_FILTERS, location: filters.location, sort: filters.sort, pageSize: filters.pageSize }) }} className="bg-transparent border-0 cursor-pointer text-[13.5px] underline underline-offset-2 px-1" style={{ color: MUTED }}>Clear filters</button>}
            </div>
            <DataTableSearch value={q} onChange={setQ} placeholder="Search company, domain, contact or email" className="flex-shrink-0" />
          </div>
        </div>

        <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />

        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>
          {error && <p className="m-0 mb-4 text-[14px]" role="alert">{error}</p>}
          <Register label="Leads" minWidth={960} className={cn(loading && 'opacity-60')}>
            <RegisterHead>
              <RegisterTh first active={sort.key === 'company'} dir={sort.dir} onSort={() => sortBy('company')} hint="Company, domain and industry">Company</RegisterTh>
              <RegisterTh align="right" active={sort.key === 'fit'} dir={sort.dir} onSort={() => sortBy('fit')} hint="Fit score, 0–100">Fit</RegisterTh>
              <RegisterTh align="right" active={sort.key === 'intent'} dir={sort.dir} onSort={() => sortBy('intent')} hint="Intent score, 0–100">Intent</RegisterTh>
              <RegisterTh align="right" active={sort.key === 'score'} dir={sort.dir} onSort={() => sortBy('score')} hint="Fit plus intent">Score</RegisterTh>
              <RegisterTh hint="The best contact on file">Contact</RegisterTh>
              <RegisterTh hint="Status of the primary contact's email">Email</RegisterTh>
              <RegisterTh hint="What the lead tool recommends">Next step</RegisterTh>
              <RegisterTh last hint="The latest draft and its status">Draft</RegisterTh>
            </RegisterHead>
            <tbody>
              {!data && loading ? <SkeletonRows /> : rows.length === 0 ? (
                <RegisterEmpty colSpan={8}>
                  {kpis && kpis.byLocation.all.accounts === 0 ? 'No leads yet. Leads arrive from the lead tool, or import a CSV.' : <>No leads match these filters. <button type="button" onClick={() => { setQ(''); go({ ...DEFAULT_FILTERS }) }} className="underline bg-transparent border-0 cursor-pointer p-0 text-[15px]" style={{ color: INK }}>Clear filters</button></>}
                </RegisterEmpty>
              ) : rows.map(r => {
                const on = r.id === openLead
                const isNew = !!r.created_at && !!kpis && r.created_at >= kpis.newSince
                const flagged = (r.exclusion_flags?.length ?? 0) > 0
                const draftNote = r.outreach_status ? [!r.outreach_to_email ? 'No recipient' : null, r.drafted_at ? fmtDay(r.drafted_at) : null].filter(Boolean).join(' · ') : ''
                return (
                  <RegisterRow key={r.id} selected={on} onClick={() => openRow(on ? null : r.id)}>
                    <RegisterCell first selected={on} identityWidth={260}
                      primary={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate min-w-0">{r.company ?? r.domain ?? 'Unnamed'}</span><span className="text-[11px] flex-shrink-0" style={{ color: MUTED }} title={locationLabel(r.location)}>{r.location}</span>{isNew && <span className="text-[11px] font-medium uppercase tracking-wide flex-shrink-0">New</span>}</span>}
                      secondary={`${flagged ? 'Flagged · ' : ''}${[r.domain, r.industry].filter(Boolean).join(' · ') || '–'}`} />
                    <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{r.fit_score ?? '–'}</span></RegisterCell>
                    <RegisterCell align="right"><span className="tabular-nums" style={{ color: MUTED }}>{r.intent_score ?? '–'}</span></RegisterCell>
                    <RegisterCell align="right"><span className="tabular-nums font-medium">{r.total_score ?? '–'}</span></RegisterCell>
                    <RegisterCell primary={r.contact_name ?? <span style={{ color: MUTED }}>No contact</span>} secondary={r.contact_name ? `${(r.contact_count ?? 0) > 1 ? `+${(r.contact_count ?? 0) - 1} · ` : ''}${r.contact_title ?? '–'}` : undefined} />
                    <RegisterCell primary={<EmailChip status={r.email_status} hasEmail={!!r.contact_email} />} secondary={r.contact_email ?? undefined} />
                    <RegisterCell><ActionChip action={r.recommended_action} /></RegisterCell>
                    <RegisterCell last primary={<OutreachChip status={r.outreach_status} />} secondary={draftNote || undefined} />
                  </RegisterRow>
                )
              })}
            </tbody>
          </Register>

          {data && (
            <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: MUTED }}>
              <p className="m-0 tabular-nums" aria-live="polite">{loading ? 'Loading…' : total ? `Showing ${n(first)}–${n(last)} of ${n(total)}` : 'No matches'}</p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2">Rows
                  <select value={filters.pageSize} onChange={e => go({ pageSize: Number(e.target.value) as LeadFilters['pageSize'] })} className={`${inputCls} h-9 w-auto text-[13px]`}>
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => go({ page: filters.page - 1 })}>Previous</Button>
                <span className="tabular-nums">Page {filters.page} of {n(pages)}</span>
                <Button variant="outline" size="sm" disabled={filters.page >= pages} onClick={() => go({ page: filters.page + 1 })}>Next</Button>
              </div>
            </nav>
          )}
        </div>
      </AppMainPanel>

      <LeadDrawer id={openLead} lookupOn={data?.workflow.lookup ?? false} onClose={() => openRow(null)} onChanged={load}
        onPrev={idx > 0 ? () => openRow(ids[idx - 1]) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => openRow(ids[idx + 1]) : undefined} />
    </AppSplitLayout>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  const active = value !== options[0][0]
  return (
    <label className="inline-flex">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={cn(inputCls, 'h-9 w-auto text-[13.5px] pr-8', active && 'border-[#0f1412] font-medium')}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid #e6e8e4' }}>
          {[60, 20, 20, 20, 50, 40, 30, 40].map((w, j) => (
            <td key={j} className={cn('px-3 h-14', j === 0 && 'pl-6', j === 7 && 'pr-5')}>
              <div className="h-3.5 rounded bg-[#f1f2ee] animate-pulse" style={{ width: `${w}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
