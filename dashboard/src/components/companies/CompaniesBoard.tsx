'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InsurersDirectory } from '@/components/insurers/InsurersDirectory'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Btn, Segmented } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { useBoardData, type Row } from '@/components/board/useBoardData'
import type { BoardPayload } from '@/lib/crm/board'
import { PageFrame } from '@/components/page-frame'
import { CompanyTable, compareRows, SORT_LABEL, type Sort, type SortKey } from '@/components/companies/CompanyTable'
import { inRenewalWindow, RENEWAL_WINDOWS, type RenewalWindow } from '@/lib/crm/renewal'
import { STAGES, STAGE_LABEL } from '@/lib/crm/types'

/**
 * Companies: the portfolio. Search, the Filter panel (stage, owner, renewal, awaiting reply,
 * threads), then the table — every column sortable, the Company column frozen. A row opens the
 * company page. The board arrives read on the server (`initial`); null when that read failed, and
 * the board is read here instead.
 */
interface Filters { stage: string; owner: string; renewal: RenewalWindow; awaiting: '' | 'yes' | 'no'; threads: '' | 'open' | 'none' }
const EMPTY: Filters = { stage: '', owner: '', renewal: 'all', awaiting: '', threads: '' }
const DEFAULT_SORT: Sort = { key: 'renewal', dir: 'desc' }

export function CompaniesBoard({ initial }: { initial: BoardPayload | null }) {
  const router = useRouter()
  const search = useSearchParams()
  const { data, rows, error, sync, workloads, staff, staffList, me, today, reload } = useBoardData(initial)
  const [q, setQ] = useState('')
  // ?kind=insurer opens Companies → Insurers directly; the rate-table and calculator pickers
  // link here when an insurer is missing.
  const [kind, setKind] = useState<'client' | 'insurer'>(search.get('kind') === 'insurer' ? 'insurer' : 'client')
  // ?renewal=overdue|w7|w30|w60|w90 opens the register on that window (Today's Coming up links here).
  const [f, setF] = useState<Filters>(() => { const r = search.get('renewal'); return r && RENEWAL_WINDOWS.some(w => w.key === r) ? { ...EMPTY, renewal: r as RenewalWindow } : EMPTY })
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [creating, setCreating] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); searchRef.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const onSort = useCallback((key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'stage' || key === 'owner' ? 'asc' : 'desc' }), [])

  const visible: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = rows.filter(r => {
      const c = r.company
      if (c.kind !== kind) return false
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
  }, [rows, q, f, sort, today, me, staff, kind])

  const select = (id: string) => router.push(`/companies/${id}`)

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
    ...chips.map(c => c.label),
    q.trim() ? `matching “${q.trim()}”` : null,
    `sorted by ${SORT_LABEL[sort.key]}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`,
  ].filter(Boolean).join(' · ')
  const anyFilter = activeCount > 0 || !!q.trim()

  return (
    <div className="bg-white text-trs-ink">
      <PageFrame className="pb-20">
        <PageHeader
          title="Companies"
          meta={data ? `${rows.filter(r => r.company.kind === kind).length} ${kind === 'client' ? 'clients' : 'insurers'}` : 'Loading…'}
          actions={kind === 'client' && <>
            {sync !== 'idle' && <span role="status" className="text-body text-trs-subtle">{sync === 'syncing' ? 'Saving…' : sync === 'saved' ? 'Saved' : 'Not saved'}</span>}
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-trs-subtle" />
              <Input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients, domains, owners" aria-label="Search companies" className="h-9 w-[220px] sm:w-[300px] pl-9 pr-9" />
              {q ? <Btn level="tertiary" size="xs" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 px-0 border-0"><X size={13} /></Btn>
                 : <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-small border border-trs-line-2 rounded px-1.5 leading-[18px] hidden sm:block text-trs-subtle">/</kbd>}
            </label>
            <div className="relative">
              <Btn onClick={() => setFilterOpen(v => !v)} aria-expanded={filterOpen} aria-haspopup="dialog" className={activeCount ? 'border-trs-ink' : undefined}>
                <SlidersHorizontal size={15} /> Filter{activeCount ? ` · ${activeCount}` : ''}
              </Btn>
              {filterOpen && <FilterPopover f={f} onChange={next => setF(v => ({ ...v, ...next }))} staff={staffList} me={me} onClose={() => setFilterOpen(false)} onClear={() => setF(EMPTY)} />}
            </div>
            <Btn level="primary" onClick={() => setCreating(true)}>Add client</Btn>
          </>}
        >
          <Segmented<'client' | 'insurer'> value={kind} label="Clients or insurers" onChange={k => { setKind(k); router.replace(k === 'insurer' ? '/companies?kind=insurer' : '/companies', { scroll: false }) }} options={(['client', 'insurer'] as const).map(k => ({ value: k, label: k === 'client' ? 'Clients' : 'Insurers', count: data ? rows.filter(r => r.company.kind === k).length : undefined }))} />
        </PageHeader>

        {kind === 'insurer' && <InsurersDirectory embedded />}

        {kind === 'client' && error && <p className="m-0 text-body text-trs-muted">{error} <Btn level="tertiary" size="xs" onClick={() => void reload()} className="h-auto p-0 border-0 underline bg-transparent hover:bg-transparent font-normal text-body text-trs-ink">Retry</Btn></p>}

        {kind === 'client' && !data && !error && (
          <div className="rounded overflow-hidden bg-white border border-trs-line" aria-busy="true">
            <div className="h-11 border-b border-trs-line" />
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 px-6 flex items-center gap-8 border-b border-trs-line"><span className="h-3.5 w-44 rounded bg-trs-field animate-pulse" /><span className="h-3.5 w-16 rounded bg-trs-field animate-pulse" /><span className="h-3.5 w-28 rounded bg-trs-field animate-pulse ml-auto" /></div>)}
          </div>
        )}

        {kind === 'client' && data && (
          <>
            {anyFilter && (
              <p className="m-0 text-body flex items-center gap-3 flex-wrap text-trs-muted" aria-live="polite">
                <span>{stateLine}</span>
                <Btn level="tertiary" size="xs" onClick={() => { setF(EMPTY); setQ('') }} className="h-auto p-0 border-0 bg-transparent hover:bg-transparent font-normal text-body underline underline-offset-4 text-trs-ink">Clear filters</Btn>
              </p>
            )}
            {visible.length === 0 ? (
              <p className="py-16 text-center text-heading m-0 text-trs-muted">No companies match. <Btn level="tertiary" size="xs" onClick={() => { setF(EMPTY); setQ('') }} className="h-auto p-0 border-0 underline bg-transparent hover:bg-transparent font-normal text-heading text-trs-ink">Clear filters</Btn></p>
            ) : (
              <CompanyTable rows={visible} today={today} staff={staff} workloads={workloads} selectedId={null} onSelect={select} sort={sort} onSort={onSort} highlight={q} />
            )}
          </>
        )}

        <NewCompanyDialog open={creating} onClose={() => setCreating(false)} />
      </PageFrame>
    </div>
  )
}

const sel = 'h-9 max-w-[180px] appearance-none rounded bg-transparent pl-2.5 pr-7 text-body text-right cursor-pointer border-0 outline-none hover:bg-trs-field focus-visible:ring-2 focus-visible:ring-trs-ink [direction:rtl]'

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
    <div ref={ref} role="dialog" aria-label="Filter companies" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[360px] rounded bg-white overflow-hidden border border-trs-line shadow-[0_16px_48px_rgba(15,20,18,0.14)]">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-body font-medium text-trs-ink">Filters{active ? <span className="ml-1.5 text-body font-normal text-trs-subtle">{active} on</span> : null}</span>
        <Btn level="tertiary" size="xs" onClick={onClear} disabled={!active} className="h-auto p-0 border-0 bg-transparent hover:bg-transparent font-normal text-body hover:underline underline-offset-4 text-trs-ink">Reset</Btn>
      </div>
      <ul className="m-0 p-0 list-none">
        {rowsDef.map(row => (
          <li key={row.label} className="flex items-center justify-between gap-4 px-5 h-12 border-t border-trs-field">
            <span className="text-body text-trs-ink">{row.label}</span>
            <span className="relative">
              <select value={row.value} onChange={e => row.onChange(e.target.value)} aria-label={row.label} className={cn(sel, row.value ? 'font-medium text-trs-ink' : 'text-trs-muted')}>
                {row.options.map(o => <option key={o.value} value={o.value} className="[direction:ltr]">{o.label}</option>)}
              </select>
              <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-trs-muted"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 flex items-center justify-between border-t border-trs-field">
        <span className="text-small text-trs-subtle">Renewal periods count from today.</span>
        <Btn level="primary" size="xs" onClick={onClose}>Done</Btn>
      </div>
    </div>
  )
}
