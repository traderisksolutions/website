'use client'

import { useEffect, useMemo, useState } from 'react'
import { Network, Search, ArrowLeft, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Btn, Chip, Empty, Segmented, inputCls } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtRelative } from '@/lib/crm/format'
import type { CompanyThread } from '@/lib/crm/types'

/**
 * Pick the threads that belong to one matter, then generate the case.
 *
 * Opens on this client's own mail, which is nearly always the whole answer. The second page
 * searches every thread in the inbox, for the times a matter runs through an address that was
 * never filed under this client.
 */

const INK = '#202124'
const MUTED = '#5f6368'
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

/** One pickable thread: checkbox first, then subject over its summary, the category, and who/when. */
function ThreadRow({ id, checked, onToggle, subject, summary, category, meta, when }: {
  id: string; checked: boolean; onToggle: () => void
  subject: string | null; summary: string | null; category: string | null; meta: string; when: string | null
}) {
  return (
    <RegisterRow selected={checked} onClick={onToggle}>
      <RegisterCell first selected={checked} className="min-w-0 max-w-none">
        <span className="flex items-start gap-3 min-w-0">
          <input type="checkbox" className="mt-[3px] flex-shrink-0" checked={checked} onChange={onToggle} onClick={e => e.stopPropagation()} aria-label={`Select ${subject ?? 'thread'}`} data-thread={id} />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{subject ?? '(no subject)'}</span>
            <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{summary ?? meta}</span>
          </span>
        </span>
      </RegisterCell>
      <RegisterCell>{category ? <Chip className="capitalize">{category}</Chip> : <span style={{ color: '#9aa0a6' }}>—</span>}</RegisterCell>
      <RegisterCell last align="right" primary={fmtRelative(when)} secondary={summary ? meta : undefined} />
    </RegisterRow>
  )
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

  // Search every thread in the inbox, not only this client's, debounced.
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

  const head = (
    <RegisterHead>
      <RegisterTh first>Thread</RegisterTh>
      <RegisterTh>Category</RegisterTh>
      <RegisterTh last align="right">Last message</RegisterTh>
    </RegisterHead>
  )

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose() }}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {page === 'company' ? 'Emails in this matter' : 'Search every email'}
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

            {visible.length === 0 && (
              <Empty compact>{threads.length === 0 ? 'No threads filed under this client yet.' : 'Nothing matches this filter.'}</Empty>
            )}
            {visible.length > 0 && (
              <Register label="Threads filed under this client" minWidth={560} maxHeight="42vh">
                {head}
                <tbody>
                  {visible.map(t => (
                    <ThreadRow key={t.id} id={t.id} checked={selected.has(t.id)} onToggle={() => toggle(t.id)}
                      subject={t.subject} summary={t.summary ?? null} category={t.category ?? null}
                      meta={`${t.contact?.name ?? t.contact?.email ?? 'Unknown'} · ${t.message_count} message${t.message_count === 1 ? '' : 's'}`}
                      when={t.last_message_at} />
                  ))}
                </tbody>
              </Register>
            )}

            <button
              onClick={() => setPage('everything')}
              className="self-start inline-flex items-center gap-1.5 text-[13px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4"
              style={{ color: INK }}
            >
              <Inbox size={12} /> Search all emails
            </button>
          </>
        ) : (
          <>
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} />
              <input
                className={cn(inputCls, 'pl-9')}
                placeholder="Search subject or sender across every thread"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </label>

            {query.trim().length < 2 && <Empty compact>Type at least two characters.</Empty>}
            {query.trim().length >= 2 && searching && <Empty compact>Searching…</Empty>}
            {query.trim().length >= 2 && !searching && hits?.length === 0 && <Empty compact>Nothing matches that.</Empty>}
            {(hits?.length ?? 0) > 0 && (
              <Register label="Search results" minWidth={560} maxHeight="42vh">
                {head}
                <tbody>
                  {(hits ?? []).map(h => (
                    <ThreadRow key={h.id} id={h.id} checked={selected.has(h.id)} onToggle={() => toggle(h.id, h)}
                      subject={h.subject} summary={h.snippet} category={h.category}
                      meta={h.companyName ?? 'Not filed to a client'} when={h.last_message_at} />
                  ))}
                </tbody>
              </Register>
            )}

            <button
              onClick={() => setPage('company')}
              className="self-start inline-flex items-center gap-1.5 text-[13px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-4"
              style={{ color: INK }}
            >
              <ArrowLeft size={12} /> Back to {companyName}&apos;s emails
            </button>
          </>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Case name</span>
          <input
            className={inputCls}
            placeholder="Left blank, it is named from what you picked"
            value={caseName}
            onChange={e => setCaseName(e.target.value)}
          />
        </label>

        {error && <p className="text-[13px] m-0" style={{ color: '#c5221f' }}>{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[13px] m-0" style={{ color: MUTED }}>
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
