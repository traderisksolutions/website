'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffMember } from '@/lib/crm/staff'
import { useBoardData, type Row } from '@/components/board/useBoardData'
import { isOpen, sortTasks } from '@/components/board/model'
import { PersonTag, dueLabel } from '@/components/board/TodoEditor'

/**
 * Home: the companies pinned to work on, managed by the team. A card is the company, its open
 * to-dos as white labels in a list that scrolls inside the card, and the owner's badge at the
 * foot. Opening a card goes to the company page. Search reaches every
 * client, and a result can be pinned from there. Companies are added on the Companies page.
 */

const FIELD = '#f1f2ee'
const INK = '#0f1412'
const MUTED = '#4a5550'
const PAGE = 30

function longDate(d: Date): string {
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const isPinned = (r: Row) => !!r.company.home_pinned_at
function nextDue(r: Row): string | null {
  const dated = r.company.tasks.filter(t => isOpen(t) && t.due_on).map(t => t.due_on!).sort()
  return dated[0] ?? null
}

export function Catalogue() {
  const router = useRouter()
  const { data, rows, error, sync, patchCompany, staff, today, reload } = useBoardData()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => { setLimit(PAGE) }, [q])

  // Until the pin column exists, fall back to companies with open to-dos, and say so.
  const pinsAvailable = rows.length === 0 || rows[0].company.home_pinned_at !== undefined
  const needle = q.trim().toLowerCase()

  const visible = useMemo(() => rows
    .filter(r => needle
      ? [r.company.name, ...r.company.domains, ...r.company.tasks.map(t => t.title)].join(' ').toLowerCase().includes(needle)
      : pinsAvailable ? isPinned(r) : r.d.openCount > 0)
    .sort((a, b) => (nextDue(a) ?? '9999').localeCompare(nextDue(b) ?? '9999') || a.company.name.localeCompare(b.company.name)), [rows, needle, pinsAvailable])
  const shown = visible.slice(0, limit)

  const select = (id: string) => router.push(`/companies/${id}`)
  const pin = (id: string, on: boolean) => void patchCompany(id, { pinned: on })

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto max-w-[1280px] px-6 sm:px-12 lg:px-16 pt-14 pb-20">

        <header className="text-center max-w-[720px] mx-auto">
          <h1 className="m-0 text-[36px] sm:text-[44px] font-medium tracking-[-0.03em] leading-[1.08]" style={{ textWrap: 'balance' }}>Companies to work on</h1>
          <p className="m-0 mt-3 text-[14px]" style={{ color: '#6f7a74' }}>{longDate(new Date())}</p>
        </header>

        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <label className="relative w-full max-w-[520px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6f7a74' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all companies" aria-label="Search all clients"
              className="h-12 w-full rounded-[12px] border bg-white pl-11 pr-4 text-[15px] outline-none focus:border-[#0f1412] transition-colors" style={{ borderColor: '#d5d9d4' }} />
          </label>
          {sync !== 'idle' && <span role="status" className="text-[13px]" style={{ color: '#6f7a74' }}>{sync === 'syncing' ? 'Saving…' : sync === 'saved' ? 'Saved' : 'Not saved'}</span>}
        </div>

        {error && <p className="mt-10 text-[14px] text-center" style={{ color: MUTED }}>{error} <button type="button" onClick={() => void reload()} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Retry</button></p>}

        <div className="mt-12">
          {!data && !error && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-[220px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />)}
            </div>
          )}

          {data && (
            <>
              <p className="m-0 mb-4 text-[13px] tabular-nums" style={{ color: '#6f7a74' }} aria-live="polite">
                {needle ? `${visible.length} of ${rows.length} companies match “${q.trim()}”` : pinsAvailable ? `${visible.length} pinned ${visible.length === 1 ? 'company' : 'companies'}` : `${visible.length} companies with open to-dos · pinning starts once the board migration is applied`}
              </p>

              {visible.length === 0 ? (
                <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>
                  {needle ? <>No clients match. <button type="button" onClick={() => setQ('')} className="underline bg-transparent border-0 cursor-pointer" style={{ color: INK }}>Clear search</button></> : 'Nothing pinned. Search a company and pin it to work on it.'}
                </p>
              ) : (
                <ul className="m-0 p-0 list-none grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {shown.map(r => <ClientCard key={r.company.id} r={r} today={today} staff={staff} onOpen={() => select(r.company.id)} highlight={needle} searching={!!needle} pinsAvailable={pinsAvailable} onPin={on => pin(r.company.id, on)} />)}
                </ul>
              )}

              {visible.length > limit && (
                <div className="mt-10 text-center">
                  <button type="button" onClick={() => setLimit(n => n + PAGE)} className="h-11 px-6 rounded-[12px] border bg-white text-[15px] font-medium cursor-pointer hover:bg-[#faf9f6]" style={{ borderColor: '#d5d9d4', color: INK }}>Show {Math.min(PAGE, visible.length - limit)} more</button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function ClientCard({ r, today, staff, onOpen, highlight, searching, pinsAvailable, onPin }: {
  r: Row; today: string; staff: Map<string, StaffMember>; onOpen: () => void; highlight: string; searching: boolean; pinsAvailable: boolean; onPin: (on: boolean) => void
}) {
  const c = r.company
  const open = sortTasks(c.tasks.filter(isOpen), today)
  const pinned = isPinned(r)
  const mark = (text: string) => {
    const i = highlight ? text.toLowerCase().indexOf(highlight) : -1
    if (i < 0) return text
    return <>{text.slice(0, i)}<mark style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline', textDecorationColor: '#8c958f', textUnderlineOffset: 3 }}>{text.slice(i, i + highlight.length)}</mark>{text.slice(i + highlight.length)}</>
  }
  return (
    <li>
      <article className="group relative h-[220px] rounded-[16px] px-4 pt-4 pb-3 flex flex-col cursor-pointer transition-[background-color,transform] motion-safe:hover:-translate-y-0.5 hover:bg-[#e6e8e4] focus-within:ring-2 focus-within:ring-[#0f1412]"
        style={{ background: FIELD, color: INK }} onClick={onOpen}>
        <h3 className="m-0 text-[14px] font-medium leading-[1.3] line-clamp-2" title={c.name}>{mark(c.name)}</h3>

        {/* To-dos: white labels, square corners, black text; the list scrolls inside the card */}
        <ul className="m-0 mt-3 p-0 list-none flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 pr-0.5" aria-label={`To-dos for ${c.name}`}>
          {open.map(t => (
            <li key={t.id} className="bg-white px-2.5 py-1.5 text-[12.5px] leading-snug" style={{ color: INK }}>
              <span className="block">{t.title}</span>
              {(t.due_on || (t.primary_assignee && !c.owner_emails.includes(t.primary_assignee))) && (
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
                  {t.due_on && <span>{dueLabel(t.due_on, today)}</span>}
                  {t.primary_assignee && !c.owner_emails.includes(t.primary_assignee) && <PersonTag email={t.primary_assignee} staff={staff} />}
                </span>
              )}
            </li>
          ))}
          {open.length === 0 && <li className="text-[12.5px]" style={{ color: MUTED }}>{c.needsReply > 0 ? `${c.needsReply} email${c.needsReply === 1 ? '' : 's'} waiting for a reply` : 'No to-dos yet'}</li>}
        </ul>

        {/* Foot: the owner's badge, and a way to pin or unpin */}
        <div className="mt-2 pt-2.5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <span className="flex items-center gap-1 flex-wrap min-w-0">{c.owner_emails.length ? c.owner_emails.map(o => <PersonTag key={o} email={o} staff={staff} size="md" />) : <span className="text-[11.5px]" style={{ color: MUTED }}>No owner</span>}</span>
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
