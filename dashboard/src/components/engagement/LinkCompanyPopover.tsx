'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useEngagementNav } from '@/providers/engagement-nav-provider'

type CompanySuggestion = { id: string; name: string; domain: string | null }

/** "Link company": a text link that opens a debounced typeahead over GET /api/companies?search=,
 *  the same pattern CompanyContactPicker uses. On selection it calls the onLinkCompany callback
 *  registered by engagement/page.tsx (which owns the real `leads` state) via EngagementNavProvider,
 *  so the row and header update without a full refetch. Used in the reader header, the context
 *  rail and the Unlinked list rows. */
export function LinkCompanyPopover({ threadId, className }: { threadId: string; className?: string }) {
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
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
          title="Link to company"
          aria-label="Link company"
          className={cn('flex-shrink-0 inline-flex items-center text-[inherit] font-normal underline underline-offset-[3px] decoration-[#9aa0a6] cursor-pointer hover:decoration-[#202124]', className)}
          style={{ color: '#202124' }}
        >
          Link company
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 rounded-[12px]" style={{ border: '1px solid #e8eaed' }} onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search companies"
          aria-label="Search companies"
          className="w-full h-9 text-[13.5px] rounded-[8px] px-3 outline-none bg-white mb-1.5 focus:border-[#202124]"
          style={{ border: '1px solid #dadce0', color: '#202124' }}
        />
        {(searching || linking) && (
          <div className="px-2 py-2 text-[12.5px] flex items-center gap-1.5" style={{ color: '#5f6368' }}>
            <Loader2 size={11} className="animate-spin" /> {linking ? 'Linking…' : 'Searching…'}
          </div>
        )}
        {!searching && !linking && results.length === 0 && (
          <div className="px-2 py-2 text-[12.5px]" style={{ color: '#5f6368' }}>
            {query.trim() ? 'No matches.' : 'Type to search companies.'}
          </div>
        )}
        {!searching && !linking && (
          <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto" role="listbox" aria-label="Companies">
            {results.map(c => (
              <li key={c.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => select(c)}
                  className="w-full text-left px-2 py-1.5 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]"
                  style={{ color: '#202124' }}
                >
                  {c.name}{c.domain && <span className="ml-1.5 text-[12.5px]" style={{ color: '#80868b' }}>{c.domain}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
