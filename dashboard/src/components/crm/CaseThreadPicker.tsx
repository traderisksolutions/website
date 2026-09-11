'use client'

import { useEffect, useMemo, useState } from 'react'
import { Network, Search, ArrowLeft, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Chip, Empty, Segmented, inputCls } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { CompanyThread } from '@/lib/crm/types'

/**
 * Pick the threads that belong to one matter, then generate the case.
 *
 * Opens on this client's own mail, which is nearly always the whole answer. The second page
 * searches every thread in the inbox, for the times a matter runs through an address that was
 * never filed under this client.
 */

const CAT_TONE: Record<string, 'blue' | 'red' | 'amber' | 'neutral'> = { rfq: 'blue', claim: 'red', renewal: 'amber', general: 'neutral', other: 'neutral' }
type Filter = 'all' | 'rfq' | 'claim' | 'renewal' | 'general'
type Page = 'company' | 'everything'

type SearchHit = {
  id: string
  subject: string | null
  snippet: string | null
  category: string | null
  last_message_at: string | null
  companyName: string | null
}

export function CaseThreadPicker({ open, onClose, threads, companyName, busy, error, onGenerate }: {
  open: boolean
  onClose: () => void
  threads: CompanyThread[]
  companyName: string
  busy: boolean
  error: string | null
  onGenerate: (threadIds: string[], caseName: string) => void
}) {
  const [page, setPage] = useState<Page>('company')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [caseName, setCaseName] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  // Threads picked from the second page, kept so the count and the summary stay honest.
  const [extra, setExtra] = useState<Map<string, SearchHit>>(new Map())

  useEffect(() => {
    if (!open) return
    setPage('company'); setFilter('all'); setSelected(new Set())
    setCaseName(''); setQuery(''); setHits(null); setExtra(new Map())
  }, [open])

  // Search every thread, not just this client's, debounced.
  useEffect(() => {
    if (page !== 'everything') return
    const q = query.trim()
    if (q.length < 2) { setHits(null); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/companies/threads/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { threads: [] })
        .then(d => setHits(Array.isArray(d.threads) ? d.threads : []))
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query, page])

  const counts = useMemo(() => ({
    all: threads.length,
    rfq: threads.filter(t => t.category === 'rfq').length,
    claim: threads.filter(t => t.category === 'claim').length,
    renewal: threads.filter(t => t.category === 'renewal').length,
    general: threads.filter(t => !t.category || t.category === 'general' || t.category === 'other').length,
  }), [threads])

  const visible = useMemo(() => (
    filter === 'all' ? threads
      : filter === 'general' ? threads.filter(t => !t.category || t.category === 'general' || t.category === 'other')
      : threads.filter(t => t.category === filter)
  ), [threads, filter])

  const ownIds = useMemo(() => new Set(threads.map(t => t.id)), [threads])

  function toggle(id: string, hit?: SearchHit) {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    if (hit && !ownIds.has(id)) {
      setExtra(m => { const n = new Map(m); if (n.has(id)) n.delete(id); else n.set(id, hit); return n })
    }
  }

  const chosenFromElsewhere = Array.from(selected).filter(id => !ownIds.has(id)).length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose() }}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {page === 'company' ? 'Which emails belong to this matter?' : 'Search every email'}
          </DialogTitle>
          <DialogDescription>
            {page === 'company'
              ? `Tick the threads that are part of one matter. The agent reads them together and produces the case analysis.`
              : `Add a thread that was never filed under ${companyName}.`}
          </DialogDescription>
        </DialogHeader>

        {page === 'company' ? (
          <>
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'rfq', label: 'RFQ', count: counts.rfq },
              { value: 'claim', label: 'Claims', count: counts.claim },
              { value: 'renewal', label: 'Renewals', count: counts.renewal },
              { value: 'general', label: 'General', count: counts.general },
            ]} />

            <div className="max-h-[42vh] overflow-y-auto -mx-1 px-1">
              {visible.length === 0 && (
                <Empty compact>{threads.length === 0 ? 'No threads filed under this client yet.' : 'Nothing matches this filter.'}</Empty>
              )}
              <ul className="m-0 p-0 list-none">
                {visible.map(t => (
                  <li key={t.id} className="border-b border-[--border-subtle] last:border-b-0">
                    <label className="flex items-start gap-2.5 py-2 cursor-pointer">
                      <input type="checkbox" className="mt-1 flex-shrink-0" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium truncate">{t.subject ?? '(no subject)'}</span>
                        {t.summary && <span className="block text-[11.5px] text-muted-foreground line-clamp-2">{t.summary}</span>}
                        <span className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                          {t.category && <Chip tone={CAT_TONE[t.category] ?? 'neutral'} className="capitalize">{t.category}</Chip>}
                          {t.contact?.name ?? t.contact?.email ?? 'Unknown'} · {t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setPage('everything')}
              className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <Inbox size={12} /> This matter runs through another mailbox — search all emails
            </button>
          </>
        ) : (
          <>
            <label className="relative block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className={cn(inputCls, 'pl-8')}
                placeholder="Search subject or sender across every thread"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </label>

            <div className="max-h-[42vh] overflow-y-auto -mx-1 px-1">
              {query.trim().length < 2 && <Empty compact>Type at least two characters.</Empty>}
              {query.trim().length >= 2 && searching && <Empty compact>Searching…</Empty>}
              {query.trim().length >= 2 && !searching && hits?.length === 0 && <Empty compact>Nothing matches that.</Empty>}
              <ul className="m-0 p-0 list-none">
                {(hits ?? []).map(h => (
                  <li key={h.id} className="border-b border-[--border-subtle] last:border-b-0">
                    <label className="flex items-start gap-2.5 py-2 cursor-pointer">
                      <input type="checkbox" className="mt-1 flex-shrink-0" checked={selected.has(h.id)} onChange={() => toggle(h.id, h)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium truncate">{h.subject ?? '(no subject)'}</span>
                        {h.snippet && <span className="block text-[11.5px] text-muted-foreground line-clamp-1">{h.snippet}</span>}
                        <span className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                          {h.category && <Chip tone={CAT_TONE[h.category] ?? 'neutral'} className="capitalize">{h.category}</Chip>}
                          {h.companyName ?? 'Not filed to a client'} · {fmtRelative(h.last_message_at)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setPage('company')}
              className="self-start inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline"
            >
              <ArrowLeft size={12} /> Back to {companyName}&apos;s emails
            </button>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-semibold">Name this case</span>
          <input
            className={inputCls}
            placeholder="Left blank, it is named from what you picked"
            value={caseName}
            onChange={e => setCaseName(e.target.value)}
          />
        </label>

        {error && <p className="text-[12px] text-destructive m-0">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[12px] text-muted-foreground m-0">
            {selected.size === 0
              ? 'Nothing picked yet.'
              : <>{selected.size} thread{selected.size === 1 ? '' : 's'} picked{chosenFromElsewhere > 0 && `, ${chosenFromElsewhere} from elsewhere`}.</>}
          </p>
          <div className="flex items-center gap-2">
            <Btn level="tertiary" onClick={onClose} disabled={busy}>Cancel</Btn>
            <Btn
              level="primary"
              onClick={() => onGenerate(Array.from(selected), caseName.trim())}
              loading={busy}
              disabled={selected.size === 0}
            >
              <Network size={12} /> Generate analysis
            </Btn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
