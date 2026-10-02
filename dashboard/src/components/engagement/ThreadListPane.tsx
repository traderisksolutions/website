'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AlignJustify, Clock, FileEdit, Inbox, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, PenLine, RefreshCw, Rows3, Search, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEngagementNav, type EngagementTab } from '@/providers/engagement-nav-provider'
import { ConversationList } from './ConversationList'
import type { Density } from './ThreadRow'

/**
 * Unified Mail Navigator. Header (title, count, Compose), one search field, the quick views in
 * two columns (work on the left, categories on the right), the rows, then a footer with the sort
 * note, density, sync and collapse. Fed by the context page.tsx mirrors into; rendered as the
 * fixed left rail on desktop (EngagementRail) and inline, full width, on narrow viewports.
 */

export type SectionGroup = 'work' | 'category'
export type Section = { key: EngagementTab; label: string; caption: string; group: SectionGroup }
export const SECTIONS: Section[] = [
  { key: 'all',             label: 'All inbox',       caption: 'Every conversation, newest activity first.',                          group: 'work' },
  { key: 'needs_reply',     label: 'Needs reply',     caption: 'Latest message is from the client and nobody has answered.',        group: 'work' },
  { key: 'awaiting_client', label: 'Awaiting client', caption: 'We wrote last; waiting on the other side.',                          group: 'work' },
  { key: 'unlinked',        label: 'Unlinked',        caption: 'Not filed under a company yet.',                                     group: 'work' },
  { key: 'unassigned',      label: 'Unassigned',      caption: 'Filed under a company that has no owner; someone needs to pick it up.', group: 'work' },
  { key: 'drafts',          label: 'Drafts',          caption: 'New emails saved before sending.',                                   group: 'work' },
  { key: 'renewals',        label: 'Renewals',        caption: 'Threads the triage read as a renewal.',                              group: 'category' },
  { key: 'claims',          label: 'Claims',          caption: 'Threads the triage read as a claim.',                                group: 'category' },
  { key: 'clients',         label: 'Clients',         caption: 'Conversations with existing clients.',                               group: 'category' },
  { key: 'prospects',       label: 'Prospects',       caption: 'Enquiries and outreach not yet a client.',                           group: 'category' },
]
export const sectionOf = (key: EngagementTab) => SECTIONS.find(s => s.key === key) ?? SECTIONS[0]

/** The DOM id of the navigator's search input — page.tsx focuses it on ⌘K / Ctrl+K / "/". */
export const SEARCH_INPUT_ID = 'engagement-search'

const KEY_DENSITY = 'engagement_density'
const DENSITIES: { key: Density; label: string; icon: typeof Menu }[] = [
  { key: 'comfortable', label: 'Comfortable rows', icon: Rows3 }, { key: 'standard', label: 'Standard rows', icon: Menu }, { key: 'compact', label: 'Compact rows', icon: AlignJustify },
]
const VIEW_ICON: Partial<Record<EngagementTab, typeof Menu>> = { all: Inbox, needs_reply: MessageSquare, awaiting_client: Clock, unlinked: Unlink, drafts: FileEdit }

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIRLINE = '#e8eaed'
const CTRL = '#dadce0'

const ICO_BTN = 'w-9 h-9 inline-flex items-center justify-center rounded-[10px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]'

function useDensity() {
  const [density, setDensity] = useState<Density>('standard')
  useEffect(() => { try { const v = localStorage.getItem(KEY_DENSITY) as Density | null; if (v && DENSITIES.some(d => d.key === v)) setDensity(v) } catch {} }, [])
  const pick = (d: Density) => { setDensity(d); try { localStorage.setItem(KEY_DENSITY, d) } catch {} }
  return { density, pick }
}

/** ArrowDown / ArrowUp move focus between rows inside the list. Enter/Space on a row is the
 *  button's own click. Only fires when a row already has focus, so typing in search is untouched. */
function moveRowFocus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="listitem"] > button'))
  const i = rows.findIndex(r => r === document.activeElement)
  if (i < 0) return
  e.preventDefault()
  const next = rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)]
  next?.focus()
  next?.scrollIntoView({ block: 'nearest' })
}

export function ThreadListPane({ collapsible = false }: { collapsible?: boolean }) {
  const { activeTab, setActiveTab, search, setSearch, counts, refreshing, onRefresh, leads, visible, threadMap, selectedId, loading, onSelect, onOpenDraft, setNavCollapsed } = useEngagementNav()
  const { density, pick } = useDensity()
  const searchRef = useRef<HTMLInputElement>(null)
  const n = activeTab === 'drafts' ? counts.drafts : visible.length

  const work = SECTIONS.filter(s => s.group === 'work' && s.key !== 'all')
  const categories = SECTIONS.filter(s => s.group === 'category')

  const viewButton = (s: Section) => {
    const on = activeTab === s.key
    return (
      <button key={s.key} type="button" onClick={() => setActiveTab(s.key)} aria-pressed={on} title={s.caption}
        className={cn('relative flex items-center justify-between h-8 px-2.5 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer text-left hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]', on && 'font-medium')}
        style={{ color: on ? INK : BODY }}>
        {on && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[2px] rounded-[2px]" style={{ background: INK }} />}
        <span className="truncate">{s.label}</span>
        <span className="text-[12px] tabular-nums pl-2 flex-shrink-0" style={{ color: FAINT }}>{counts[s.key]}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: INK }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
        <div className="min-w-0">
          <button type="button" onClick={() => setActiveTab('all')} aria-pressed={activeTab === 'all'} title="Show every conversation"
            className="block m-0 p-0 bg-transparent border-0 cursor-pointer text-left text-[22px] font-medium leading-[1.1] tracking-[-0.02em] rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#202124]" style={{ color: INK }}>
            All Inbox
          </button>
          <div className="mt-1 text-[13px] tabular-nums" style={{ color: MUTED }}>{counts.all} conversation{counts.all === 1 ? '' : 's'}</div>
        </div>
        <button type="button" onClick={() => onOpenDraft?.({ toEmail: '', cc: '', subject: '', body: '' })}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-[14px] font-medium text-white border-0 cursor-pointer hover:opacity-90 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#202124]" style={{ background: INK }}>
          <PenLine size={15} />Compose
        </button>
      </div>

      {/* Search */}
      <label role="search" className="relative flex items-center mx-5 mt-1 mb-3.5 h-11 rounded-[12px] border bg-white px-3.5 gap-2.5 focus-within:border-[#202124] transition-colors flex-shrink-0" style={{ borderColor: CTRL }}>
        <Search size={15} style={{ color: FAINT }} className="flex-shrink-0" />
        <input ref={searchRef} id={SEARCH_INPUT_ID} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages, people, companies or policies" aria-label="Search conversations"
          className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[14px] placeholder:text-[#80868b]" style={{ color: INK }} />
        {search
          ? <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus() }} aria-label="Clear search" title="Clear search" className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] flex-shrink-0" style={{ color: MUTED }}><X size={12} /></button>
          : <kbd aria-hidden className="text-[11px] leading-none rounded-[6px] border px-1.5 py-[3px] font-[inherit] flex-shrink-0" style={{ borderColor: CTRL, color: DOT }}>⌘K</kbd>}
      </label>

      {/* Quick views */}
      <div className="grid grid-cols-2 gap-x-2 px-3 pb-1.5 flex-shrink-0" role="group" aria-label="Quick views">
        <div className="flex flex-col" role="group" aria-label="Work">{work.map(viewButton)}</div>
        <div className="flex flex-col" role="group" aria-label="Categories">{categories.map(viewButton)}</div>
      </div>

      {/* Rows */}
      <div className="flex-1 min-h-0" style={{ borderTop: `1px solid ${HAIRLINE}` }} onKeyDown={moveRowFocus}>
        <ConversationList leads={leads} visible={visible} threadMap={threadMap} selectedId={selectedId} activeTab={activeTab} search={search}
          loading={loading} refreshing={refreshing} onSelect={id => onSelect?.(id)} onOpenDraft={d => onOpenDraft?.(d)} onRefresh={() => onRefresh?.()} hideHeader density={density} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <span className="text-[12px] truncate tabular-nums" style={{ color: FAINT }}>
          {search ? `${n} result${n === 1 ? '' : 's'} for “${search}”` : 'Newest activity first'}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-0.5 mr-1" role="group" aria-label="Row density">
            {DENSITIES.map(d => { const Icon = d.icon; return (
              <button key={d.key} type="button" onClick={() => pick(d.key)} aria-pressed={density === d.key} title={d.label} aria-label={d.label}
                className={cn('w-7 h-7 inline-flex items-center justify-center rounded-[6px] border-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]', density === d.key ? 'bg-[#f1f3f4]' : 'bg-transparent hover:bg-[#f8f9fa]')}
                style={{ color: density === d.key ? INK : DOT }}><Icon size={14} /></button>
            ) })}
          </div>
          <button type="button" onClick={() => onRefresh?.()} disabled={!onRefresh || refreshing} title={refreshing ? 'Syncing…' : 'Sync mail'} aria-label="Sync mail" className={ICO_BTN} style={{ color: FAINT }}>
            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
          </button>
          {collapsible && (
            <button type="button" onClick={() => setNavCollapsed(true)} title="Collapse navigator" aria-label="Collapse navigator" className={ICO_BTN} style={{ color: BODY }}>
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The navigator collapsed to a 64px icon rail: expand, Compose, then one icon button per work
 * view with its count as a small ink pill, and sync at the foot. Labels live in title/aria-label.
 */
export function CollapsedNavRail() {
  const { activeTab, setActiveTab, counts, refreshing, onRefresh, onOpenDraft, setNavCollapsed } = useEngagementNav()
  const views = SECTIONS.filter(s => s.group === 'work')

  return (
    <div className="flex flex-col items-center gap-1.5 h-full py-4 bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: INK }}>
      <button type="button" onClick={() => setNavCollapsed(false)} title="Expand navigator" aria-label="Expand navigator" className={ICO_BTN} style={{ color: BODY }}>
        <PanelLeftOpen size={16} />
      </button>
      <button type="button" onClick={() => onOpenDraft?.({ toEmail: '', cc: '', subject: '', body: '' })} title="Compose" aria-label="Compose" className={ICO_BTN} style={{ color: BODY }}>
        <PenLine size={16} />
      </button>
      <div className="w-6 my-1" style={{ borderTop: `1px solid ${HAIRLINE}` }} aria-hidden />
      <div className="flex flex-col items-center gap-1.5" role="group" aria-label="Quick views">
        {views.map(s => {
          const Icon = VIEW_ICON[s.key] ?? Inbox
          const count = counts[s.key]
          const on = activeTab === s.key
          return (
            <button key={s.key} type="button" onClick={() => setActiveTab(s.key)} aria-pressed={on} title={`${s.label} · ${count}`} aria-label={`${s.label}, ${count}`}
              className={cn(ICO_BTN, 'relative', on && 'bg-[#f1f3f4]')} style={{ color: on ? INK : BODY }}>
              <Icon size={16} />
              {count > 0 && s.key !== 'all' && (
                <i aria-hidden className="absolute top-0.5 right-0.5 not-italic text-[10px] leading-[14px] rounded-full px-1 text-white tabular-nums" style={{ background: INK }}>{count > 99 ? '99+' : count}</i>
              )}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={() => onRefresh?.()} disabled={!onRefresh || refreshing} title={refreshing ? 'Syncing…' : 'Sync mail'} aria-label="Sync mail" className={cn(ICO_BTN, 'mt-auto')} style={{ color: FAINT }}>
        <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
      </button>
    </div>
  )
}
