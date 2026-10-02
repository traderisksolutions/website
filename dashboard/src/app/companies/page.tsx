'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { useBoardData, type Row } from '@/components/board/useBoardData'
import { CompanyTable, compareRows, SORT_LABEL, type Sort, type SortKey } from '@/components/companies/CompanyTable'
import { CompanyDrawer } from '@/components/companies/CompanyDrawer'
import { needsAttention } from '@/components/companies/attention'
import { inRenewalWindow, RENEWAL_WINDOWS, renewalBucket, type RenewalWindow } from '@/lib/crm/renewal'
import { STAGES, STAGE_LABEL, type Company } from '@/lib/crm/types'

/**
 * Companies: the portfolio, in Home's design system. A title and one sentence, search, plain
 * text views with counts, one summary line whose figures filter, then the table — every
 * column sortable, the Company column frozen. A row opens the same panel Home uses.
 */
export default function CompaniesPage() {
  return <Suspense fallback={null}><CompaniesInner /></Suspense>
}

const INK = '#202124'
const MUTED = '#5f6368'

type View = 'all' | 'attention' | 'renewals' | 'awaiting' | 'mine' | 'unassigned'
const VIEWS: { key: View; label: string }[] = [
  { key: 'all', label: 'All clients' }, { key: 'attention', label: 'Needs attention' }, { key: 'renewals', label: 'Renewals' }, { key: 'awaiting', label: 'Awaiting reply' }, { key: 'mine', label: 'My clients' }, { key: 'unassigned', label: 'Unassigned' },
]
interface Filters { stage: string; owner: string; renewal: RenewalWindow; awaiting: '' | 'yes' | 'no'; threads: '' | 'open' | 'none' }
const EMPTY: Filters = { stage: '', owner: '', renewal: 'all', awaiting: '', threads: '' }
const DEFAULT_SORT: Sort = { key: 'renewal', dir: 'desc' }

function CompaniesInner() {
  const router = useRouter()
  const search = useSearchParams()
  const { data, rows, error, sync, actions, patchCompany, workloads, staff, staffList, me, today, reload } = useBoardData()
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('all')
  // ?kind=insurer opens Companies → Insurers directly; the rate-table and calculator pickers
  // link here when an insurer is missing.
  const [kind, setKind] = useState<'client' | 'insurer'>(search.get('kind') === 'insurer' ? 'insurer' : 'client')
  const [f, setF] = useState<Filters>(EMPTY)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const id = search.get('company'); if (id) setSelected(id) }, [search])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); searchRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const onSort = useCallback((key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'stage' || key === 'owner' ? 'asc' : 'desc' }), [])

  const inRenewals = (r: Row) => inRenewalWindow(r.company.nextRenewalDate, today, 'w90') || renewalBucket(r.company.nextRenewalDate, today) === 'overdue'
  const inView = useCallback((r: Row, v: View) => {
    const c = r.company
    switch (v) {
      case 'all': return true
      case 'attention': return needsAttention(r, today)
      case 'renewals': return inRenewals(r)
      case 'awaiting': return c.needsReply > 0
      case 'mine': return !!me && (c.owner_emails.includes(me) || r.d.owners.includes(me))
      case 'unassigned': return c.owner_emails.length === 0
    }
  }, [today, me]) // eslint-disable-line react-hooks/exhaustive-deps
  
  const visible: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = rows.filter(r => {
      const c = r.company
      if (c.kind !== kind) return false
      if (!inView(r, view)) return false
      if (!inRenewalWindow(c.nextRenewalDate, today, f.renewal)) return false
      if (f.stage && c.stage !== f.stage) return false
      if (f.owner === '__none__' && c.owner_emails.length > 0) return false
      if (f.owner === '__me__' && (!me || !c.owner_emails.includes(me))) return false
      if (f.owner && f.owner !== '__none__' && f.owner !== '__me__' && !c.owner_emails.includes(f.owner)) return false
      if (f.awaiting === 'yes' && c.needsReply === 0) return false
      if (f.awaiting === 'no' && c.needsReply > 0) return false
      if (f.threads === 'open' && c.openThreads === 0) return false
      if (f.threads === 'none' && c.openThreads > 0) return false
      if (needle && ![c.name, ...c.domains, ...c.owner_emails, ...c.owner_emails.map(o => staff.get(o)?.name ?? ''), c.industry ?? '', ...c.tasks.map(t => t.title)].join(' ').toLowerCase().includes(needle)) return false
      return true
    })
    return [...list].sort((a, b) => compareRows(a, b, sort))
  }, [rows, q, f, sort, today, me, staff, view, inView, kind])

  const selectedRow = selected ? rows.find(r => r.company.id === selected) ?? null : null
  const select = (id: string) => { setSelected(id); router.replace(`/companies?company=${id}`, { scroll: false }) }
  const close = useCallback(() => { setSelected(null); router.replace('/companies', { scroll: false }) }, [router])

  const chips: { label: string; clear: () => void }[] = [
    ...(f.stage ? [{ label: `Stage: ${STAGE_LABEL[f.stage as keyof typeof STAGE_LABEL] ?? f.stage}`, clear: () => setF(v => ({ ...v, stage: '' })) }] : []),
    ...(f.owner ? [{ label: `Owner: ${f.owner === '__none__' ? 'No owner' : f.owner === '__me__' ? 'Me' : staff.get(f.owner)?.name ?? f.owner}`, clear: () => setF(v => ({ ...v, owner: '' })) }] : []),
    ...(f.renewal !== 'all' ? [{ label: `Renewal: ${RENEWAL_WINDOWS.find(w => w.key === f.renewal)!.label}`, clear: () => setF(v => ({ ...v, renewal: 'all' })) }] : []),
    ...(f.awaiting ? [{ label: f.awaiting === 'yes' ? 'Awaiting our reply' : 'Nothing awaiting reply', clear: () => setF(v => ({ ...v, awaiting: '' })) }] : []),
    ...(f.threads ? [{ label: f.threads === 'open' ? 'Has open threads' : 'No open threads', clear: () => setF(v => ({ ...v, threads: '' })) }] : []),
  ]
  const activeCount = chips.length
  const stateLine = [
    `Showing ${visible.length} of ${rows.filter(r => r.company.kind === kind).length} ${kind === 'client' ? 'clients' : 'insurers'}`,
    view !== 'all' ? VIEWS.find(v => v.key === view)!.label : null,
    ...chips.map(c => c.label),
    q.trim() ? `matching “${q.trim()}”` : null,
    `sorted by ${SORT_LABEL[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`,
  ].filter(Boolean).join(' · ')
  const anyFilter = view !== 'all' || activeCount > 0 || !!q.trim()

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className={cn('mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20 transition-[padding]', selectedRow && 'lg:pr-[500px]')}>
        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Companies</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{data ? `${rows.filter(r => r.company.kind === kind).length} ${kind === 'client' ? 'client' : 'insurer'} relationship${rows.filter(r => r.company.kind === kind).length === 1 ? '' : 's'}` : 'Loading…'}</p>
            <div className="mt-4 flex items-center gap-6" role="tablist" aria-label="Clients or insurers">
              {(['client', 'insurer'] as const).map(k => {
                const on = kind === k
                const n = rows.filter(r => r.company.kind === k).length
                return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setKind(k); setSelected(null) }} className={cn('relative pb-2 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{k === 'client' ? 'Clients' : 'Insurers'}<span className="ml-1.5 tabular-nums" style={{ color: '#80868b' }}>{data ? n : ''}</span><span className={cn('absolute left-0 right-0 bottom-0 h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></button>
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {sync !== 'idle' && <span role="status" className="text-[13px]" style={{ color: '#80868b' }}>{sync === 'syncing' ? 'Saving…' : sync === 'saved' ? 'Saved' : 'Not saved'}</span>}
            <label className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
              <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients, domains, owners" aria-label="Search companies" className="h-12 w-[260px] sm:w-[340px] rounded-[12px] border bg-white pl-11 pr-9 text-[15px] outline-none focus:border-[#202124] transition-colors" style={{ borderColor: '#dadce0' }} />
              {q ? <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
                 : <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] border rounded px-1.5 leading-[18px] hidden sm:block" style={{ color: '#9aa0a6', borderColor: '#dadce0' }}>/</kbd>}
            </label>
            <div className="relative">
              <button type="button" onClick={() => setFilterOpen(v => !v)} aria-expanded={filterOpen} aria-haspopup="dialog"
                className={cn('h-12 px-4 rounded-[12px] border bg-white text-[15px] inline-flex items-center gap-2 cursor-pointer hover:bg-[#f8f9fa]', activeCount ? 'font-medium' : '')} style={{ borderColor: activeCount ? INK : '#dadce0', color: INK }}>
                <SlidersHorizontal size={15} /> Filter{activeCount ? ` · ${activeCount}` : ''}
              </button>
              {filterOpen && <FilterPopover f={f} onChange={next => setF(v => ({ ...v, ...next }))} staff={staffList} me={me} onClose={() => setFilterOpen(false)} onClear={() => setF(EMPTY)} />}
            </div>
            <button type="button" onClick={() => setCreating(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90" style={{ background: INK }}>Add company</button>
          </div>
        </div>

        {error && <p className="mt-8 text-[14px]" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void reload()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>}

        {!data && !error && (
          <div className="mt-6 rounded-[16px] overflow-hidden bg-white" style={{ border: '1px solid #e8eaed' }} aria-busy="true">
            <div className="h-11" style={{ borderBottom: '1px solid #e8eaed' }} />
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[66px] px-6 flex items-center gap-8" style={{ borderBottom: '1px solid #e8eaed' }}><span className="h-3.5 w-44 rounded bg-[#f1f3f4] animate-pulse" /><span className="h-3.5 w-16 rounded bg-[#f1f3f4] animate-pulse" /><span className="h-3.5 w-28 rounded bg-[#f1f3f4] animate-pulse ml-auto" /></div>)}
          </div>
        )}

        {data && (
          <>
            {anyFilter && (
              <p className="mt-6 mb-3 text-[13.5px] flex items-center gap-3 flex-wrap" style={{ color: MUTED }} aria-live="polite">
                <span>{stateLine}</span>
                <button type="button" onClick={() => { setView('all'); setF(EMPTY); setQ('') }} className="bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4" style={{ color: INK }}>Clear filters</button>
              </p>
            )}
            {!anyFilter && <div className="mt-6" />}
            {visible.length === 0 ? (
              <p className="py-16 text-center text-[16px] m-0" style={{ color: MUTED }}>No companies match. <button type="button" onClick={() => { setView('all'); setF(EMPTY); setQ('') }} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Clear filters</button></p>
            ) : (
              <CompanyTable rows={visible} today={today} staff={staff} workloads={workloads} selectedId={selected} onSelect={select} sort={sort} onSort={onSort} highlight={q} />
            )}
          </>
        )}

        <NewCompanyDialog open={creating} onClose={() => setCreating(false)} />
      </div>

      {selectedRow && (
        <CompanyDrawer row={selectedRow} today={today} staff={staff} staffList={staffList} workloads={workloads} actions={actions} me={me}
          onClose={close} onPatchCompany={patchCompany} onCompanyUpdated={(c: Company) => { void patchCompany(c.id, { name: c.name }) }} />
      )}
    </div>
  )
}

const sel = 'h-9 max-w-[180px] appearance-none rounded-[8px] bg-transparent pl-2.5 pr-7 text-[14px] text-right cursor-pointer border-0 outline-none hover:bg-[#f1f3f4] focus-visible:ring-2 focus-visible:ring-[#202124]'

/** The Filter panel: a short settings list, one parameter per row, its value on the right. */
function FilterPopover({ f, onChange, staff, me, onClose, onClear }: {
  f: Filters; onChange: (next: Partial<Filters>) => void; staff: { email: string; name: string }[]; me: string | null; onClose: () => void; onClear: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-haspopup="dialog"]')) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  const active = [f.stage, f.owner, f.renewal !== 'all' ? f.renewal : '', f.awaiting, f.threads].filter(Boolean).length
  const rowsDef: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }[] = [
    { label: 'Stage', value: f.stage, onChange: v => onChange({ stage: v }), options: [{ value: '', label: 'Any' }, ...STAGES.map(s => ({ value: s, label: STAGE_LABEL[s] }))] },
    { label: 'Owner', value: f.owner, onChange: v => onChange({ owner: v }), options: [{ value: '', label: 'Anyone' }, ...(me ? [{ value: '__me__', label: 'Me' }] : []), { value: '__none__', label: 'No owner' }, ...staff.map(s => ({ value: s.email, label: s.name }))] },
    { label: 'Next policy renewal', value: f.renewal, onChange: v => onChange({ renewal: v as RenewalWindow }), options: RENEWAL_WINDOWS.map(w => ({ value: w.key, label: w.key === 'all' ? 'Any time' : w.label })) },
    { label: 'Awaiting reply', value: f.awaiting, onChange: v => onChange({ awaiting: v as Filters['awaiting'] }), options: [{ value: '', label: 'Either' }, { value: 'yes', label: 'Waiting on us' }, { value: 'no', label: 'Nothing waiting' }] },
    { label: 'Threads', value: f.threads, onChange: v => onChange({ threads: v as Filters['threads'] }), options: [{ value: '', label: 'Either' }, { value: 'open', label: 'Has open threads' }, { value: 'none', label: 'No open threads' }] },
  ]
  return (
    <div ref={ref} role="dialog" aria-label="Filter companies" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[360px] rounded-[16px] bg-white overflow-hidden" style={{ border: '1px solid #e8eaed', boxShadow: '0 16px 48px rgba(32,33,36,0.14)' }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-[15px] font-medium" style={{ color: INK }}>Filters{active ? <span className="ml-1.5 text-[13px] font-normal" style={{ color: '#80868b' }}>{active} on</span> : null}</span>
        <button type="button" onClick={onClear} disabled={!active} className="text-[13px] bg-transparent border-0 cursor-pointer disabled:cursor-default disabled:opacity-40 hover:underline underline-offset-4" style={{ color: INK }}>Reset</button>
      </div>
      <ul className="m-0 p-0 list-none">
        {rowsDef.map(row => (
          <li key={row.label} className="flex items-center justify-between gap-4 px-5 h-12" style={{ borderTop: '1px solid #f1f3f4' }}>
            <span className="text-[14px]" style={{ color: INK }}>{row.label}</span>
            <span className="relative">
              <select value={row.value} onChange={e => row.onChange(e.target.value)} aria-label={row.label} className={cn(sel, row.value ? 'font-medium' : '')} style={{ direction: 'rtl', color: row.value ? INK : MUTED }}>
                {row.options.map(o => <option key={o.value} value={o.value} style={{ direction: 'ltr' }}>{o.label}</option>)}
              </select>
              <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MUTED }}><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #f1f3f4' }}>
        <span className="text-[12px]" style={{ color: '#80868b' }}>Renewal periods count from today.</span>
        <button type="button" onClick={onClose} className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium border-0 cursor-pointer" style={{ background: INK }}>Done</button>
      </div>
    </div>
  )
}
