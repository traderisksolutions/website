'use client'

import { useEffect, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useEngagementNav } from '@/providers/engagement-nav-provider'

type CompanySuggestion = { id: string; name: string; domain: string | null }

/** Inline "Link to company" affordance shown on Unlinked-tab rows (ConversationRow) — a debounced
 *  typeahead over GET /api/companies?search=, same pattern CompanyContactPicker already uses.
 *  On selection, calls the onLinkCompany callback registered by engagement/page.tsx (which owns
 *  the real `leads` state) via EngagementNavProvider, so the row updates without a full refetch. */
export function LinkCompanyPopover({ threadId }: { threadId: string }) {
  const { onLinkCompany } = useEngagementNav()
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<CompanySuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking]   = useState(false)

  useEffect(() => {
    if (!open) return
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/companies?search=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((rows: CompanySuggestion[]) => setResults(Array.isArray(rows) ? rows : []))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  function select(c: CompanySuggestion) {
    setLinking(true)
    onLinkCompany?.(threadId, c.id, c.name)
    setLinking(false)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          title="Link to company"
          className="flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[6px] bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <Link2 size={9} /> Link company
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search companies…"
          className="w-full text-[12px] border border-border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 mb-1.5"
        />
        {(searching || linking) && (
          <div className="px-1.5 py-2 text-[11.5px] text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" /> {linking ? 'Linking…' : 'Searching…'}
          </div>
        )}
        {!searching && !linking && results.length === 0 && (
          <div className="px-1.5 py-2 text-[11.5px] text-muted-foreground">
            {query.trim() ? 'No matches.' : 'Start typing to search companies…'}
          </div>
        )}
        {!searching && !linking && results.map(c => (
          <button
            key={c.id}
            onClick={() => select(c)}
            className="w-full text-left px-1.5 py-1.5 rounded text-[12px] hover:bg-accent transition-colors"
          >
            {c.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
