'use client'

// Recipient typeahead (#2). Type a name or email → pick an address from Active Contacts
// (clients + employees). Shared by the To field and the CC/BCC chip inputs.

import { useEffect, useRef, useState } from 'react'
import type { ContactSuggestion } from '@/app/api/contacts/search/route'

// Contact list is prefetched once and cached in-module so suggestions filter locally —
// instant from the very first character, no per-keystroke network round-trip.
let CACHE: { at: number; rows: ContactSuggestion[] } | null = null
let INFLIGHT: Promise<ContactSuggestion[]> | null = null
const CACHE_TTL = 5 * 60_000

function loadAllContacts(): Promise<ContactSuggestion[]> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL) return Promise.resolve(CACHE.rows)
  if (!INFLIGHT) {
    INFLIGHT = fetch('/api/contacts/search?all=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: ContactSuggestion[]) => {
        const list = Array.isArray(rows) ? rows : []
        CACHE = { at: Date.now(), rows: list }
        return list
      })
      .catch(() => [] as ContactSuggestion[])
      .finally(() => { INFLIGHT = null })
  }
  return INFLIGHT
}

function filterLocal(rows: ContactSuggestion[], query: string): ContactSuggestion[] {
  const t = query.trim().toLowerCase()
  if (!t) return []
  const matches = rows.filter(c => c.name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t))
  matches.sort((a, b) => {
    const aStart = a.name.toLowerCase().startsWith(t) || a.email.toLowerCase().startsWith(t)
    const bStart = b.name.toLowerCase().startsWith(t) || b.email.toLowerCase().startsWith(t)
    if (aStart !== bStart) return aStart ? -1 : 1
    if (a.is_employee !== b.is_employee) return a.is_employee ? -1 : 1
    return 0
  })
  return matches.slice(0, 8)
}

// Suggestions for the given query. Filters the prefetched cache locally (instant); if the
// cache hasn't loaded yet, does a one-off server query as a fallback for that keystroke.
export function useContactSearch(query: string): ContactSuggestion[] {
  const [rows, setRows]       = useState<ContactSuggestion[]>(CACHE?.rows ?? [])
  const [results, setResults] = useState<ContactSuggestion[]>([])

  // Warm the cache once on mount so the list is ready before the user types.
  useEffect(() => {
    let alive = true
    loadAllContacts().then(r => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) { setResults([]); return }
    let alive = true
    if (rows.length) {
      const local = filterLocal(rows, q)
      setResults(local)
      // Nothing matched locally — the contact may be beyond the prefetch cap; back it up
      // with a server query so large contact sets still resolve.
      if (local.length === 0 && q.length >= 2) {
        fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : []))
          .then((x: ContactSuggestion[]) => { if (alive && Array.isArray(x) && x.length) setResults(x) })
          .catch(() => {})
      }
      return () => { alive = false }
    }
    // Cache still loading — fall back to a server query for this keystroke.
    fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((x: ContactSuggestion[]) => { if (alive) setResults(Array.isArray(x) ? x : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [query, rows])

  return results
}

// Presentational dropdown of suggestions with keyboard highlight. 14px rows, hover #f8f9fa,
// keyboard highlight #f1f3f4, one grey "Team" chip for employees.
export function SuggestionList({
  items, highlight, onPick,
}: {
  items:     ContactSuggestion[]
  highlight: number
  onPick:    (c: ContactSuggestion) => void
}) {
  if (items.length === 0) return null
  return (
    <div role="listbox" aria-label="Suggested recipients" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-[10px] border border-[#e8eaed] bg-white p-1 shadow-[0_8px_24px_rgba(32,33,36,0.12)]">
      {items.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={i === highlight}
          // onMouseDown (not onClick) so the pick fires before the input's blur.
          onMouseDown={e => { e.preventDefault(); onPick(c) }}
          className={`flex w-full items-center justify-between gap-3 px-2.5 py-1.5 rounded-[6px] text-left border-0 cursor-pointer transition-colors ${
            i === highlight ? 'bg-[#f1f3f4]' : 'bg-transparent hover:bg-[#f8f9fa]'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-medium" style={{ color: '#202124' }}>{c.name}</span>
              {c.is_employee && (
                <span className="flex-shrink-0 rounded-[6px] bg-[#f1f3f4] px-1.5 py-px text-[11.5px] font-medium" style={{ color: '#3c4043' }}>Team</span>
              )}
            </span>
            <span className="block truncate text-[12.5px]" style={{ color: '#5f6368' }}>{c.email}</span>
          </span>
          {c.company && <span className="flex-shrink-0 truncate text-[12.5px] max-w-[140px]" style={{ color: '#80868b' }}>{c.company}</span>}
        </button>
      ))}
    </div>
  )
}

// Keyboard/selection state machine shared by both inputs. Returns handlers + the
// currently-highlighted index so callers can render <SuggestionList>.
export function useAutocomplete(query: string, onPick: (c: ContactSuggestion) => void) {
  const items = useContactSearch(query)
  const [open, setOpen]           = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setHighlight(0) }, [query])
  // NOTE: opening is driven explicitly by the caller (reopen() on type/focus), NOT by
  // query changes — otherwise picking a suggestion (which sets the value) would reopen
  // the dropdown and re-search the full address.

  const visible = open && items.length > 0

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!visible) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, items.length - 1)); return true }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return true }
    if (e.key === 'Enter')     { e.preventDefault(); onPick(items[highlight]); setOpen(false); return true }
    if (e.key === 'Escape')    { e.preventDefault(); setOpen(false); return true }
    return false
  }

  return {
    boxRef,
    items,
    highlight,
    visible,
    onKeyDown,
    close:  () => setOpen(false),
    reopen: () => setOpen(true),
  }
}
