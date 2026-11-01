'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Segmented } from '@/components/crm/primitives'

/** A Segmented filter and a search box that live in the URL, for server-rendered lists. */
export function UrlFilters<T extends string>({ param, value, options, query, placeholder = 'Search' }: {
  param: string; value: T; options: { value: T; label: string; count?: number }[]; query: string; placeholder?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(query)
  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    router.push(`${pathname}${next.size ? `?${next}` : ''}`)
  }
  return (
    <>
      <Segmented<T> value={value} onChange={v => go({ [param]: v })} options={options} label="Filter" />
      <form role="search" onSubmit={e => { e.preventDefault(); go({ q: q.trim() }) }} className="flex items-center gap-2 h-[30px] px-2.5 rounded-[7px] border border-trs-line-2 bg-white min-w-0 w-full sm:w-[260px]">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-trs-muted" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="flex-1 min-w-0 h-full border-0 outline-none bg-transparent text-[13px] text-trs-ink placeholder:text-trs-subtle" />
      </form>
    </>
  )
}
