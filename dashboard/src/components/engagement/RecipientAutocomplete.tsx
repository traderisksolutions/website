'use client'

// Recipient typeahead (#2). Type a name or email → pick an address from Active Contacts
// (clients + employees). Shared by the To field and the CC/BCC chip inputs.

import { useEffect, useRef, useState } from 'react'
import type { ContactSuggestion } from '@/app/api/contacts/search/route'

// Debounced fetch of contact suggestions for the given query.
export function useContactSearch(query: string): ContactSuggestion[] {
  const [results, setResults] = useState<ContactSuggestion[]>([])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) { setResults([]); return }
    let alive = true
    const t = setTimeout(() => {
      fetch(`/api/contacts/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: ContactSuggestion[]) => { if (alive) setResults(Array.isArray(rows) ? rows : []) })
        .catch(() => { if (alive) setResults([]) })
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [query])
  return results
}

// Presentational dropdown of suggestions with keyboard highlight.
export function SuggestionList({
  items, highlight, onPick,
}: {
  items:     ContactSuggestion[]
  highlight: number
  onPick:    (c: ContactSuggestion) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="absolute left-0 right-2 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[--border-subtle] bg-popover shadow-lg">
      {items.map((c, i) => (
        <button
          key={c.id}
          type="button"
          // onMouseDown (not onClick) so the pick fires before the input's blur.
          onMouseDown={e => { e.preventDefault(); onPick(c) }}
          className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
            i === highlight ? 'bg-primary/10' : 'hover:bg-muted'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium text-foreground">{c.name}</span>
              {c.is_employee && (
                <span className="flex-shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-primary">Team</span>
              )}
            </span>
            <span className="block truncate text-[10.5px] text-muted-foreground/70">{c.email}</span>
          </span>
          {c.company && <span className="flex-shrink-0 truncate text-[10px] text-muted-foreground/50 max-w-[90px]">{c.company}</span>}
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
    if (e.key === 'Escape')    { setOpen(false); return true }
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
