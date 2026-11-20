'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useEngagementNav } from '@/providers/engagement-nav-provider'
import { useConfirm } from '@/components/ui/confirm'
import { Btn, InlineSpinner, inputCls } from '@/components/crm/primitives'
import { decideDomainThreads } from '@/app/companies/triage/actions'
import { createCompany, searchCompanies } from '@/app/companies/actions'

type CompanySuggestion = { id: string; name: string; domain: string | null }
type Pick = { id: string | null; name: string }

const ROW = 'w-full text-left px-2 py-1.5 rounded text-body text-trs-ink bg-transparent border-0 cursor-pointer hover:bg-trs-tint'

/**
 * Filing a thread by hand (the filing agent is off, 20 Nov 2026). "Link company" on an unfiled
 * thread, "Change company" on a filed one. Search the companies on file (GET /api/companies),
 * or "+ Add as a new company" from what was typed (POST /api/companies, with the thread's outside
 * domain). On an unfiled thread with an outside domain, "File all from <domain>" shows how many
 * other unfiled threads share it and, after a confirm, files them all under the pick (decideDomainThreads). Every step is a person's click; nothing files on its own. The link
 * itself goes through the page's onLinkCompany (PATCH /api/engagement/thread/[id]/company); a
 * failure shows in red with Retry. On a thread filed under an insurer or partner the pick is the
 * client the thread is about, and the domain tools are off.
 */
export function LinkCompanyPopover({ threadId, change = false, forClient = false, className }: {
  threadId: string
  /** The thread is filed: the label reads Change company and the domain filing is not offered. */
  change?: boolean
  /** The thread is filed under an insurer or partner: the pick is the client it is about, so the
   *  thread's domain (the insurer's) is never given to the client or used to file others. */
  forClient?: boolean
  className?: string
}) {
  const { onLinkCompany, onRefresh } = useEngagementNav()
  const confirm = useConfirm()
  const [open, setOpen]           = useState(false)
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<CompanySuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy]           = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [retry, setRetry]         = useState<(() => void) | null>(null)
  const [domain, setDomain]       = useState<{ domain: string | null; unfiled: number } | null>(null)
  const [fileAll, setFileAll]     = useState(false)

  useEffect(() => {
    if (!open) return
    setSearching(true)
    const t = setTimeout(() => {
      searchCompanies(query.trim())
        .then(r => r.ok ? r.data : [])
        .then((rows: CompanySuggestion[]) => setResults(Array.isArray(rows) ? rows : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  // The thread's outside domain and the unfiled threads that share it: read when an unfiled thread's picker opens.
  useEffect(() => {
    if (!open || forClient || domain) return
    fetch(`/api/engagement/thread/${threadId}/company`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { domain: string | null; unfiled: number } | null) => setDomain(d ?? { domain: null, unfiled: 0 }))
      .catch(() => setDomain({ domain: null, unfiled: 0 }))
  }, [open, forClient, domain, threadId])

  async function file(pick: Pick) {
    setError(null); setRetry(null)
    const again = () => void file(pick)
    const many = !change && fileAll && domain?.domain && domain.unfiled > 0 ? domain : null
    if (many) {
      const ok = await confirm({
        title: `File ${many.unfiled + 1} threads under ${pick.name}?`,
        body: `This thread and ${many.unfiled} other unfiled thread${many.unfiled === 1 ? '' : 's'} from ${many.domain} go under ${pick.name}. ${many.domain} is added to ${pick.name}.`,
        action: 'File all',
      })
      setOpen(true)
      if (!ok) return
    }
    try {
      let target = pick
      if (!target.id) {
        setBusy('Adding…')
        const r = await createCompany({ name: target.name, domain: domain?.domain ?? null })
        if (!r.ok) throw new Error(`Not added: ${r.error}`)
        target = { id: r.data.id, name: r.data.name }
      }
      setBusy('Linking…')
      const r = await onLinkCompany?.(threadId, target.id, target.name)
      if (r && !r.ok) throw new Error(r.error)
      if (many) {
        setBusy('Filing…')
        const r = await decideDomainThreads({ domain: many.domain, decision: 'assign', companyId: target.id })
        if (!r.ok) throw new Error(`This thread is linked; the others are not: ${r.error}`)
        onRefresh?.()
      }
      setOpen(false); setQuery(''); setFileAll(false); setDomain(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not linked.')
      setRetry(() => again)
    } finally { setBusy(null) }
  }

  const typed = query.trim()
  const exact = results.some(c => c.name.toLowerCase() === typed.toLowerCase())
  const label = change ? 'Change company' : 'Link company'

  return (
    <Popover open={open} onOpenChange={o => { if (!busy) setOpen(o) }}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
          title={label}
          aria-label={label}
          className={cn('flex-shrink-0 inline-flex items-center text-[inherit] font-normal text-trs-ink underline underline-offset-[3px] decoration-trs-subtle cursor-pointer hover:decoration-trs-ink', className)}
        >
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 rounded border border-trs-line" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search companies"
          aria-label="Search companies"
          disabled={!!busy}
          className={cn(inputCls, 'h-9 mb-1.5 text-body')}
        />
        {!change && domain?.domain && domain.unfiled > 0 && (
          <label className="flex items-center gap-2 px-2 py-1.5 text-body text-trs-ink cursor-pointer">
            <input type="checkbox" checked={fileAll} onChange={e => setFileAll(e.target.checked)} disabled={!!busy} />
            File all from {domain.domain} <span className="tabular-nums text-trs-subtle">{domain.unfiled} more</span>
          </label>
        )}
        {(searching || busy) && <div className="px-2 py-2"><InlineSpinner label={busy ?? 'Searching…'} /></div>}
        {error && (
          <div className="px-2 py-2 text-small flex items-start justify-between gap-2" role="alert">
            <span className="text-trs-neg">{error}</span>
            {retry && <Btn size="xs" onClick={() => retry()}>Retry</Btn>}
          </div>
        )}
        {!searching && !busy && results.length === 0 && !typed && (
          <div className="px-2 py-2 text-small text-trs-muted">Type to search companies.</div>
        )}
        {!searching && !busy && (
          <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto" role="listbox" aria-label="Companies">
            {results.map(c => (
              <li key={c.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => void file({ id: c.id, name: c.name })} className={ROW}>
                  {c.name}{c.domain && <span className="ml-1.5 text-small text-trs-subtle">{c.domain}</span>}
                </button>
              </li>
            ))}
            {typed && !exact && (
              <li>
                <button type="button" onClick={() => void file({ id: null, name: typed })} className={cn(ROW, 'font-medium')}>
                  + Add “{typed}” as a new company{domain?.domain ? <span className="ml-1.5 font-normal text-small text-trs-subtle">{domain.domain}</span> : null}
                </button>
              </li>
            )}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
