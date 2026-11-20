'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AlignJustify, Clock, FileEdit, Inbox, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, PenLine, RefreshCw, Rows3, Search, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEngagementNav, type EngagementTab } from '@/providers/engagement-nav-provider'
import { Btn, Segmented } from '@/components/crm/primitives'
import { ConversationList } from './ConversationList'
import type { Density } from './ThreadRow'

/**
 * Unified Mail Navigator. Header (Inbox, the true total, Compose), the Mailbox pill and the mail
 * rule, one search field (the server searches every thread), the quick views, the rows (100 a
 * page, more on scroll or More), then a footer with the sort note, density, sync and collapse.
 * Fed by the context page.tsx mirrors into; rendered as the fixed left rail on desktop
 * (EngagementRail) and inline, full width, on narrow viewports.
 */

type Section = { key: EngagementTab; label: string; caption: string }
const SECTIONS: Section[] = [
  { key: 'all',             label: 'Inbox',           caption: 'Every conversation, newest activity first.' },
  { key: 'needs_reply',     label: 'Needs reply',     caption: 'Latest message is from the client and nobody has answered.' },
  { key: 'awaiting_client', label: 'Awaiting client', caption: 'We wrote last; waiting on the other side.' },
  { key: 'unlinked',        label: 'Unlinked',        caption: 'Not filed under a company yet.' },
  { key: 'unassigned',      label: 'Unassigned',      caption: 'Filed under a company that has no owner.' },
  { key: 'drafts',          label: 'Drafts',          caption: 'New emails saved before sending.' },
]

/** The DOM id of the navigator's search input — page.tsx focuses it on ⌘K / Ctrl+K / "/". */
export const SEARCH_INPUT_ID = 'engagement-search'

const KEY_DENSITY = 'engagement_density'
const DENSITIES: { key: Density; label: string; icon: typeof Menu }[] = [
  { key: 'comfortable', label: 'Comfortable rows', icon: Rows3 }, { key: 'standard', label: 'Standard rows', icon: Menu }, { key: 'compact', label: 'Compact rows', icon: AlignJustify },
]
const VIEW_ICON: Partial<Record<EngagementTab, typeof Menu>> = { all: Inbox, needs_reply: MessageSquare, awaiting_client: Clock, unlinked: Unlink, drafts: FileEdit }

/** A 36px icon button on Btn's tertiary level. */
const ICO_BTN = 'w-9 h-9 px-0 hover:bg-trs-field'

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
  const { activeTab, setActiveTab, search, setSearch, mailbox, setMailbox, counts, refreshing, onRefresh, leads, visible, threadMap, selectedId, loading, onSelect, onOpenDraft, setNavCollapsed,
    total, hasMore, loadingMore, onMore, loadError, mailboxes: personal, seed } = useEngagementNav()
  const { density, pick } = useDensity()
  const [staffNames, setStaffNames] = useState<Record<string, string>>({})
  const seedReady = seed !== undefined
  useEffect(() => {
    // The page brings the names with its first response when the list has a personal mailbox.
    if (!personal.length || !seedReady) return
    if (seed?.staffNames) { setStaffNames(seed.staffNames); return }
    fetch('/api/today/edit-options', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then((d: { staff?: { email: string; name: string }[] } | null) => { if (d?.staff) setStaffNames(Object.fromEntries(d.staff.map(s => [s.email.toLowerCase(), s.name]))) })
      .catch(() => {})
  }, [personal.length, seedReady, seed?.staffNames])
  const firstName = (email: string) => (staffNames[email] ?? email.split('@')[0]).split(/[\s.]+/)[0].replace(/^./, c => c.toUpperCase())
  const searchRef = useRef<HTMLInputElement>(null)
  const n = activeTab === 'drafts' ? counts.drafts : total

  const views = SECTIONS.filter(s => s.key !== 'all')

  const viewButton = (s: Section) => {
    const on = activeTab === s.key
    return (
      <Btn key={s.key} level="tertiary" size="xs" onClick={() => setActiveTab(s.key)} aria-pressed={on} title={s.caption}
        className={cn('relative justify-between px-2.5 border-0 text-left', on ? 'font-medium text-trs-ink' : 'font-normal text-trs-ink-2')}>
        {on && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded bg-trs-ink" />}
        <span className="truncate">{s.label}</span>
        <span className="text-small tabular-nums pl-2 flex-shrink-0 text-trs-subtle">{counts[s.key]}</span>
      </Btn>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white text-trs-ink">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2.5 flex-shrink-0">
        <div className="min-w-0">
          <button type="button" onClick={() => setActiveTab('all')} aria-pressed={activeTab === 'all'} title="Show every conversation"
            className="block m-0 p-0 bg-transparent border-0 cursor-pointer text-left text-heading font-semibold leading-[1.2] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-trs-ink text-trs-ink">
            Inbox
          </button>
          <div className="mt-0.5 text-small tabular-nums text-trs-muted">{loading && !counts.all ? 'Loading…' : `${counts.all.toLocaleString('en-SG')} conversation${counts.all === 1 ? '' : 's'}`}</div>
        </div>
        <Btn level="primary" size="xs" onClick={() => onOpenDraft?.({ toEmail: '', cc: '', subject: '', body: '' })} className="flex-shrink-0">
          <PenLine size={14} />Compose
        </Btn>
      </div>

      {/* Mailbox pill: the team's threads, or a person's own. The rule line is always there. */}
      <div className="mx-4 mb-2 flex-shrink-0">
        {personal.length > 0 && (
          <Segmented value={mailbox} onChange={setMailbox} label="Mailbox" options={[
            { value: 'all', label: 'All' }, { value: 'operations', label: 'Operations' },
            ...personal.map(m => ({ value: m, label: firstName(m) })),
          ]} />
        )}
        <p className={cn('m-0 text-small text-trs-subtle', personal.length > 0 && 'mt-1.5')}>Mail you see: own inbox and Operations, plus threads you are on.</p>
      </div>

      {/* Search */}
      <label role="search" className="relative flex items-center mx-4 mt-0.5 mb-2.5 h-8 rounded border bg-white px-2.5 gap-2 focus-within:border-trs-ink transition-colors flex-shrink-0 border-trs-line-2">
        <Search size={14} className="flex-shrink-0 text-trs-subtle" />
        <input ref={searchRef} id={SEARCH_INPUT_ID} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mail" aria-label="Search conversations"
          className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-body placeholder:text-trs-subtle text-trs-ink" />
        {search
          ? <Btn level="tertiary" size="xs" onClick={() => { setSearch(''); searchRef.current?.focus() }} aria-label="Clear search" title="Clear search" className="w-6 h-6 px-0 rounded-full border-0 hover:bg-trs-field flex-shrink-0"><X size={12} /></Btn>
          : <kbd aria-hidden className="text-small leading-none rounded border px-1.5 py-[3px] font-[inherit] flex-shrink-0 border-trs-line-2 text-trs-subtle">⌘K</kbd>}
      </label>

      {/* Quick views */}
      <div className="grid grid-cols-2 gap-x-2 px-2.5 pb-2 flex-shrink-0" role="group" aria-label="Quick views">
        {views.map(viewButton)}
      </div>

      {/* Rows */}
      <div className="flex-1 min-h-0 border-t border-trs-line" onKeyDown={moveRowFocus}>
        <ConversationList leads={leads} visible={visible} threadMap={threadMap} selectedId={selectedId} activeTab={activeTab} search={search}
          loading={loading} refreshing={refreshing} onSelect={id => onSelect?.(id)} onOpenDraft={d => onOpenDraft?.(d)} onRefresh={() => onRefresh?.()} hideHeader density={density}
          hasMore={hasMore} loadingMore={loadingMore} onMore={() => onMore?.()} loadError={loadError} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0 border-t border-trs-line">
        <span className="text-small truncate tabular-nums text-trs-subtle">
          {search && !loading ? `${n.toLocaleString('en-SG')} result${n === 1 ? '' : 's'} for “${search}”` : 'Newest activity first'}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div className="flex items-center gap-0.5 mr-1" role="group" aria-label="Row density">
            {DENSITIES.map(d => { const Icon = d.icon; return (
              <Btn key={d.key} level="tertiary" size="xs" onClick={() => pick(d.key)} aria-pressed={density === d.key} title={d.label} aria-label={d.label}
                className={cn('w-8 px-0 border-0', density === d.key ? 'bg-trs-field hover:bg-trs-field text-trs-ink' : 'text-trs-subtle')}><Icon size={14} /></Btn>
            ) })}
          </div>
          <Btn level="tertiary" size="xs" onClick={() => onRefresh?.()} disabled={!onRefresh || refreshing} title={refreshing ? 'Syncing…' : 'Sync mail'} aria-label="Sync mail" className={cn(ICO_BTN, 'text-trs-subtle')}>
            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
          </Btn>
          {collapsible && (
            <Btn level="tertiary" size="xs" onClick={() => setNavCollapsed(true)} title="Collapse navigator" aria-label="Collapse navigator" className={cn(ICO_BTN, 'text-trs-ink-2')}>
              <PanelLeftClose size={16} />
            </Btn>
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
  const views = SECTIONS

  return (
    <div className="flex flex-col items-center gap-1.5 h-full py-4 bg-white text-trs-ink">
      <Btn level="tertiary" size="xs" onClick={() => setNavCollapsed(false)} title="Expand navigator" aria-label="Expand navigator" className={cn(ICO_BTN, 'text-trs-ink-2')}>
        <PanelLeftOpen size={16} />
      </Btn>
      <Btn level="tertiary" size="xs" onClick={() => onOpenDraft?.({ toEmail: '', cc: '', subject: '', body: '' })} title="Compose" aria-label="Compose" className={cn(ICO_BTN, 'text-trs-ink-2')}>
        <PenLine size={16} />
      </Btn>
      <div className="w-6 my-1 border-t border-trs-line" aria-hidden />
      <div className="flex flex-col items-center gap-1.5" role="group" aria-label="Quick views">
        {views.map(s => {
          const Icon = VIEW_ICON[s.key] ?? Inbox
          const count = counts[s.key]
          const on = activeTab === s.key
          return (
            <Btn key={s.key} level="tertiary" size="xs" onClick={() => setActiveTab(s.key)} aria-pressed={on} title={`${s.label} · ${count}`} aria-label={`${s.label}, ${count}`}
              className={cn(ICO_BTN, 'relative', on ? 'bg-trs-field text-trs-ink' : 'text-trs-ink-2')}>
              <Icon size={16} />
              {count > 0 && s.key !== 'all' && (
                <i aria-hidden className="absolute top-0.5 right-0.5 not-italic text-small leading-[14px] rounded-full px-1 text-white tabular-nums bg-trs-green">{count > 99 ? '99+' : count}</i>
              )}
            </Btn>
          )
        })}
      </div>
      <Btn level="tertiary" size="xs" onClick={() => onRefresh?.()} disabled={!onRefresh || refreshing} title={refreshing ? 'Syncing…' : 'Sync mail'} aria-label="Sync mail" className={cn(ICO_BTN, 'mt-auto text-trs-subtle')}>
        <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
      </Btn>
    </div>
  )
}
