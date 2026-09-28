'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffMember } from '@/lib/crm/staff'
import type { Company } from '@/lib/crm/types'
import { NewCompanyDialog } from '@/components/crm/dialogs'
import { useBoardData, type Row } from '@/components/board/useBoardData'
import { isOpen, sortTasks } from '@/components/board/model'
import { PersonTag, dueLabel } from '@/components/board/TodoEditor'
import { CompanyDrawer } from '@/components/companies/CompanyDrawer'

/**
 * Home: the companies pinned to work on, managed by the team. A card is the company, its open
 * to-dos as white labels in a list that scrolls inside the card, and the owner's badge at the
 * foot. Opening a card is where to-dos are added, edited and removed. Search reaches every
 * client, and a result can be pinned from there.
 */

const FIELD = '#F1F3F4'
const INK = '#202124'
const MUTED = '#5f6368'
const PAGE = 30

function longDate(d: Date): string {
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const isPinned = (r: Row) => !!r.company.home_pinned_at
const isUnassigned = (r: Row) => r.company.kind === 'client' && ((!r.company.owner_email && (r.d.openCount > 0 || r.company.needsReply > 0)) || r.company.tasks.some(t => isOpen(t) && !t.primary_assignee))
function nextDue(r: Row): string | null {
  const dated = r.company.tasks.filter(t => isOpen(t) && t.due_on).map(t => t.due_on!).sort()
  return dated[0] ?? null
}

export function Catalogue() {
  const router = useRouter()
  const search = useSearchParams()
  const { data, rows, error, sync, actions, patchCompany, workloads, staff, staffList, me, today, reload } = useBoardData()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  /** Pinned = what the team chose to work on. Unassigned = companies nobody owns that still have work, or an open to-do with no person on it. */
  const [view, setView] = useState<'pinned' | 'unassigned'>('pinned')

  useEffect(() => { const id = search.get('company'); if (id) setSelected(id) }, [search])
  useEffect(() => { setLimit(PAGE) }, [q])

  // Until the pin column exists, fall back to companies with open to-dos, and say so.
  const pinsAvailable = rows.length === 0 || rows[0].company.home_pinned_at !== undefined
  const needle = q.trim().toLowerCase()

  const visible = useMemo(() => rows
    .filter(r => needle
      ? [r.company.name, ...r.company.domains, ...r.company.tasks.map(t => t.title)].join(' ').toLowerCase().includes(needle)
      : view === 'unassigned' ? isUnassigned(r) : pinsAvailable ? isPinned(r) : r.d.openCount > 0)
    .sort((a, b) => (nextDue(a) ?? '9999').localeCompare(nextDue(b) ?? '9999') || a.company.name.localeCompare(b.company.name)), [rows, needle, pinsAvailable, view])
  const unassignedCount = useMemo(() => rows.filter(isUnassigned).length, [rows])
  const pinnedCount = useMemo(() => rows.filter(r => pinsAvailable ? isPinned(r) : r.d.openCount > 0).length, [rows, pinsAvailable])
  const shown = visible.slice(0, limit)

  const select = (id: string) => { setSelected(id); router.replace(`/?company=${id}`, { scroll: false }) }
  const close = useCallback(() => { setSelected(null); router.replace('/', { scroll: false }) }, [router])
  const selectedRow = selected ? rows.find(r => r.company.id === selected) ?? null : null
  const pin = (id: string, on: boolean) => void patchCompany(id, { pinned: on })

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className={cn('mx-auto max-w-[1280px] px-6 sm:px-12 lg:px-16 pt-14 pb-20 transition-[padding]', selectedRow && 'lg:pr-[500px]')}>

        <header className="text-center max-w-[720px] mx-auto">
          <h1 className="m-0 text-[36px] sm:text-[44px] font-medium tracking-[-0.03em] leading-[1.08]" style={{ textWrap: 'balance' }}>Companies to work on</h1>
          <p className="m-0 mt-3 text-[14px]" style={{ color: '#80868b' }}>{longDate(new Date())}</p>
        </header>

        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <label className="relative w-full max-w-[520px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all companies" aria-label="Search all clients"
              className="h-12 w-full rounded-[12px] border bg-white pl-11 pr-4 text-[15px] outline-none focus:border-[#202124] transition-colors" style={{ borderColor: '#dadce0' }} />
          </label>
          <button type="button" onClick={() => setCreating(true)} className="h-12 px-6 rounded-[12px] text-white text-[15px] font-medium border-0 cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90" style={{ background: INK }}>Add company</button>
          {sync !== 'idle' && <span role="status" className="text-[13px]" style={{ color: '#80868b' }}>{sync === 'syncing' ? 'Saving…' : sync === 'saved' ? 'Saved' : 'Not saved'}</span>}
        </div>

        {data && !needle && (
          <div className="mt-8 flex items-center justify-center gap-6" role="tablist" aria-label="Pinned or unassigned">
            {([['pinned', 'Pinned', pinnedCount], ['unassigned', 'Unassigned', unassignedCount]] as const).map(([k, label, n]) => {
              const on = view === k
              return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setView(k)} className={cn('relative pb-2 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')} style={{ color: on ? INK : MUTED }}>{label}<span className="ml-1.5 tabular-nums" style={{ color: '#80868b' }}>{n}</span><span className={cn('absolute left-0 right-0 bottom-0 h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden /></button>
            })}
          </div>
        )}

        {error && <p className="mt-10 text-[14px] text-center" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void reload()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>}

        <div className="mt-8">
          {!data && !error && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-[220px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />)}
            </div>
          )}

          {data && (
            <>
              <p className="m-0 mb-4 text-[13px] tabular-nums" style={{ color: '#80868b' }} aria-live="polite">
                {needle ? `${visible.length} of ${rows.length} companies match “${q.trim()}”` : view === 'unassigned' ? `${visible.length} ${visible.length === 1 ? 'company' : 'companies'} with no owner and open work, or a to-do nobody is on` : pinsAvailable ? `${visible.length} pinned ${visible.length === 1 ? 'company' : 'companies'}` : `${visible.length} companies with open to-dos · pinning starts once the board migration is applied`}
              </p>

              {visible.length === 0 ? (
                <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>
                  {needle ? <>No clients match. <button type="button" onClick={() => setQ('')} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Clear search</button></> : view === 'unassigned' ? 'Everything with open work has an owner.' : 'Nothing pinned. Search a company and pin it to work on it.'}
                </p>
              ) : (
                <ul className={cn('m-0 p-0 list-none grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3', selectedRow ? 'lg:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-4 xl:grid-cols-5')}>
                  {shown.map(r => <ClientCard key={r.company.id} r={r} today={today} staff={staff} selected={selected === r.company.id} onOpen={() => select(r.company.id)} highlight={needle} searching={!!needle} pinsAvailable={pinsAvailable} onPin={on => pin(r.company.id, on)} />)}
                </ul>
              )}

              {visible.length > limit && (
                <div className="mt-10 text-center">
                  <button type="button" onClick={() => setLimit(n => n + PAGE)} className="h-11 px-6 rounded-[12px] border bg-white text-[15px] font-medium cursor-pointer hover:bg-[#f8f9fa]" style={{ borderColor: '#dadce0', color: INK }}>Show {Math.min(PAGE, visible.length - limit)} more</button>
                </div>
              )}
            </>
          )}
        </div>

        <NewCompanyDialog open={creating} onClose={() => setCreating(false)} />
      </div>

      {selectedRow && (
        <CompanyDrawer row={selectedRow} today={today} staff={staff} staffList={staffList} workloads={workloads} actions={actions} me={me}
          onClose={close} onPatchCompany={patchCompany} onCompanyUpdated={(c: Company) => { void patchCompany(c.id, { name: c.name }) }} />
      )}
    </div>
  )
}

function ClientCard({ r, today, staff, selected, onOpen, highlight, searching, pinsAvailable, onPin }: {
  r: Row; today: string; staff: Map<string, StaffMember>; selected: boolean; onOpen: () => void; highlight: string; searching: boolean; pinsAvailable: boolean; onPin: (on: boolean) => void
}) {
  const c = r.company
  const open = sortTasks(c.tasks.filter(isOpen), today)
  const pinned = isPinned(r)
  const mark = (text: string) => {
    const i = highlight ? text.toLowerCase().indexOf(highlight) : -1
    if (i < 0) return text
    return <>{text.slice(0, i)}<mark style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline', textDecorationColor: '#9aa0a6', textUnderlineOffset: 3 }}>{text.slice(i, i + highlight.length)}</mark>{text.slice(i + highlight.length)}</>
  }
  return (
    <li>
      <article className={cn('group relative h-[220px] rounded-[16px] px-4 pt-4 pb-3 flex flex-col cursor-pointer transition-[background-color,transform] motion-safe:hover:-translate-y-0.5 hover:bg-[#e8eaed] focus-within:ring-2 focus-within:ring-[#202124]', selected && 'ring-2 ring-[#202124]')}
        style={{ background: FIELD, color: INK }} onClick={onOpen}>
        <h3 className="m-0 text-[14px] font-medium leading-[1.3] line-clamp-2" title={c.name}>{mark(c.name)}</h3>

        {/* To-dos: white labels, square corners, black text; the list scrolls inside the card */}
        <ul className="m-0 mt-3 p-0 list-none flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5" aria-label={`To-dos for ${c.name}`}>
          {open.map(t => (
            <li key={t.id} className="bg-white px-2.5 py-1.5 text-[12.5px] leading-snug" style={{ color: INK }}>
              <span className="block">{t.title}</span>
              {(t.due_on || (t.primary_assignee && t.primary_assignee !== c.owner_email)) && (
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
                  {t.due_on && <span>{dueLabel(t.due_on, today)}</span>}
                  {t.primary_assignee && t.primary_assignee !== c.owner_email && <PersonTag email={t.primary_assignee} staff={staff} />}
                </span>
              )}
            </li>
          ))}
          {open.length === 0 && <li className="text-[12.5px]" style={{ color: MUTED }}>{c.needsReply > 0 ? `${c.needsReply} email${c.needsReply === 1 ? '' : 's'} waiting for a reply` : 'No to-dos yet'}</li>}
        </ul>

        {/* Foot: the owner's badge, and a way to pin or unpin */}
        <div className="mt-2 pt-2.5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {c.owner_email ? <PersonTag email={c.owner_email} staff={staff} size="md" /> : <span className="text-[11.5px]" style={{ color: MUTED }}>No owner</span>}
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: MUTED }}>
            <span className="tabular-nums">{open.length} to-do{open.length === 1 ? '' : 's'}</span>
            {pinsAvailable && (searching || pinned) && (
              <button type="button" onClick={e => { e.stopPropagation(); onPin(!pinned) }} aria-pressed={pinned} className={cn('inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-4', pinned ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : '')} style={{ color: INK }}>
                <Pin size={12} /> {pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
          </span>
        </div>
      </article>
    </li>
  )
}
