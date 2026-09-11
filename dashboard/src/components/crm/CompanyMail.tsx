'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Network, Reply, ExternalLink, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Btn, Chip, Empty, Segmented, Spinner } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import { EngagementMessageCard } from '@/components/engagement-agent/engagement-message-card'
import { EngagementComposePanel } from '@/components/engagement-agent/engagement-compose-panel'
import { extractEmail } from '@/components/engagement/helpers'
import type { Lead, RealMsg } from '@/components/engagement/types'
import type { CompanyThread } from '@/lib/crm/types'

/**
 * Reading and answering this company's mail without leaving its page.
 *
 * The same message cards and composer the Inbox uses, but the list is only ever this company's
 * threads — no global inbox to get lost in. Wide screens show the list beside the conversation;
 * a phone shows one at a time with a way back.
 */

type Filter = 'all' | 'reply' | 'rfq' | 'claim' | 'renewal' | 'general'
const CAT_TONE: Record<string, 'blue' | 'red' | 'amber' | 'neutral'> = { rfq: 'blue', claim: 'red', renewal: 'amber', general: 'neutral', other: 'neutral' }

type ThreadRow = { id: string; subject: string | null; status: string; last_message_at: string | null; contact_id: string | null }

export function CompanyMail({ threads, companyId, companyName, onCombine, onRefresh, fullHeight }: {
  threads: CompanyThread[]
  companyId: string
  companyName: string
  onCombine?: (ids: string[]) => void
  onRefresh?: () => void
  /** Fill the viewport instead of sitting inside the page column — the Threads tab. */
  fullHeight?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [thread, setThread] = useState<ThreadRow | null>(null)
  const [messages, setMessages] = useState<RealMsg[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Composer state, owned here so the panel behaves exactly as it does in the Inbox.
  const [toAddress, setToAddress] = useState('')
  const [ccList, setCcList] = useState<string[]>([])
  const [bccList, setBccList] = useState<string[]>([])
  const [customSubject, setCustomSubject] = useState('')
  const [replyAll, setReplyAll] = useState(false)
  const [composing, setComposing] = useState(false)
  const readerRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => ({
    all: threads.length,
    reply: threads.filter(t => t.needsReply).length,
    rfq: threads.filter(t => t.category === 'rfq').length,
    claim: threads.filter(t => t.category === 'claim').length,
    renewal: threads.filter(t => t.category === 'renewal').length,
    general: threads.filter(t => !t.category || t.category === 'general' || t.category === 'other').length,
  }), [threads])

  const visible = useMemo(() => (
    filter === 'all' ? threads
      : filter === 'reply' ? threads.filter(t => t.needsReply)
      : filter === 'general' ? threads.filter(t => !t.category || t.category === 'general' || t.category === 'other')
      : threads.filter(t => t.category === filter)
  ), [threads, filter])

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id); setLoading(true); setError(null); setComposing(false)
    try {
      const res = await fetch(`/api/engagement/thread?thread_id=${id}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not open this conversation.')
      setThread(d.thread ?? null)
      const msgs: RealMsg[] = Array.isArray(d.messages) ? d.messages : []
      setMessages(msgs)

      // Reply to whoever wrote last from outside, as the Inbox does.
      const lastInbound = [...msgs].reverse().find(m => m.direction === 'inbound')
      setToAddress(extractEmail(lastInbound?.from_address ?? '') || '')
      setCcList([]); setBccList([]); setCustomSubject('')
      readerRef.current?.scrollTo({ top: 0 })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setMessages([]) }
    finally { setLoading(false) }
  }, [])

  // Open the first thread on a wide screen so the pane is never empty for no reason.
  useEffect(() => {
    if (selectedId || visible.length === 0) return
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) void openThread(visible[0].id)
  }, [visible, selectedId, openThread])

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const current = threads.find(t => t.id === selectedId) ?? null

  // The composer speaks the Inbox's Lead shape; build one from what the company page already has.
  const lead: Lead | null = current ? {
    id: current.contact?.id ?? current.id,
    created_at: current.last_message_at ?? new Date().toISOString(),
    source: 'email',
    first_name: current.contact?.name?.split(' ')[0] ?? null,
    last_name: current.contact?.name?.split(' ').slice(1).join(' ') || null,
    email: current.contact?.email ?? null,
    phone: null, company: companyName, department: null, contact_type: null,
    topic: current.category ?? null, details: null, message: null, page_url: null,
    status: current.status, subject: current.subject, thread_id: current.id,
    category: current.category, companyId, companyName,
  } : null

  return (
    <div className={cn(fullHeight ? 'h-full flex flex-col px-4 pt-2' : 'mt-3')}>
      <div className={cn('mb-2 flex items-center gap-2 flex-wrap', fullHeight && 'flex-shrink-0')}>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all }, { value: 'reply', label: 'Awaiting reply', count: counts.reply },
          { value: 'rfq', label: 'RFQ', count: counts.rfq }, { value: 'claim', label: 'Claims', count: counts.claim },
          { value: 'renewal', label: 'Renewals', count: counts.renewal }, { value: 'general', label: 'General', count: counts.general },
        ]} />
        <span className="ml-auto flex items-center gap-1.5">
          {onCombine && selected.size > 0 && (
            <Btn size="xs" level="primary" onClick={() => { onCombine(Array.from(selected)); setSelected(new Set()) }}>
              <Network size={12} /> Combine {selected.size} into a case
            </Btn>
          )}
          {onRefresh && <Btn size="xs" level="tertiary" onClick={onRefresh}><RefreshCw size={12} /> Refresh</Btn>}
        </span>
      </div>

      {threads.length === 0 && <Empty>No threads are filed under this company yet.</Empty>}

      {threads.length > 0 && (
        <div className={cn('flex gap-4 border-t border-[--border-subtle]',
          fullHeight ? 'flex-1 min-h-0 items-stretch' : 'items-start')}>
          {/* List */}
          <div className={cn('min-w-0 md:w-[320px] md:flex-shrink-0 md:border-r md:border-[--border-subtle] md:pr-3',
            fullHeight && 'flex flex-col min-h-0',
            selectedId ? 'hidden md:block' : 'w-full')}>
            {visible.length === 0 && <Empty compact>Nothing matches this filter.</Empty>}
            <ul className={cn('m-0 p-0 list-none flex flex-col overflow-y-auto', fullHeight ? 'flex-1 min-h-0' : 'max-h-[70vh]')}>
              {visible.map(t => (
                <li key={t.id} className={cn('border-b border-[--border-subtle] last:border-b-0', selectedId === t.id && 'bg-[--selected-row-bg]')}>
                  <div className="flex items-start gap-2 py-2 pr-1">
                    {onCombine && <input type="checkbox" className="mt-1.5 flex-shrink-0" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.subject ?? 'thread'}`} />}
                    <button onClick={() => openThread(t.id)} className="min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer">
                      <p className={cn('text-[12.5px] m-0 line-clamp-2', selectedId === t.id ? 'font-semibold' : 'font-medium')}>{t.subject ?? '(no subject)'}</p>
                      <p className="text-[11px] text-muted-foreground m-0 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {t.needsReply && <Chip tone="amber"><Reply size={9} /> Reply</Chip>}
                        {t.category && <Chip tone={CAT_TONE[t.category] ?? 'neutral'} className="capitalize">{t.category}</Chip>}
                        <span className="truncate">{t.contact?.name ?? t.contact?.email ?? 'Unknown'}</span>
                      </p>
                      <p className="text-[10.5px] text-muted-foreground/70 m-0 mt-0.5">{t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}</p>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Conversation */}
          <div ref={readerRef} className={cn('min-w-0 flex-1 overflow-y-auto', fullHeight ? 'min-h-0' : 'max-h-[70vh]', selectedId ? 'block' : 'hidden md:block')}>
            {!selectedId && <Empty compact>Choose a conversation.</Empty>}
            {selectedId && loading && <Spinner label="Opening…" />}
            {selectedId && error && <p className="text-[12.5px] text-destructive py-4">{error}</p>}

            {selectedId && !loading && !error && current && (
              <>
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-[--border-subtle] sticky top-0 bg-background z-10">
                  <div className="min-w-0">
                    <button onClick={() => setSelectedId(null)} className="md:hidden inline-flex items-center gap-1 text-[12px] text-muted-foreground bg-transparent border-0 p-0 mb-1 cursor-pointer">
                      <ArrowLeft size={12} /> All threads
                    </button>
                    <p className="text-[13.5px] font-semibold m-0 leading-snug">{current.subject ?? '(no subject)'}</p>
                    <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">
                      {current.contact?.name ?? current.contact?.email ?? 'Unknown contact'} · {messages?.length ?? 0} message{(messages?.length ?? 0) === 1 ? '' : 's'}
                      {current.caseIds.length > 0 && <> · <Link href={`/nexus?case=${current.caseIds[0]}`} className="text-primary no-underline hover:underline">in a case</Link></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!composing && <Btn size="xs" level="primary" onClick={() => setComposing(true)}><Reply size={12} /> Reply</Btn>}
                    <Link href={`/engagement?lead=${current.id}`} title="Open in the full Inbox" className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary no-underline"><ExternalLink size={12} /></Link>
                  </div>
                </div>

                {composing && lead && (
                  <div className="py-3 border-b border-[--border-subtle]">
                    <EngagementComposePanel
                      lead={lead}
                      thread={thread ? { id: thread.id, subject: thread.subject, status: thread.status, last_message_at: thread.last_message_at, message_count: messages?.length ?? 0 } : null}
                      messages={messages ?? []}
                      toAddress={toAddress}
                      ccList={ccList}
                      bccList={bccList}
                      customSubject={customSubject}
                      setToAddress={setToAddress}
                      setCcList={setCcList}
                      setBccList={setBccList}
                      setCustomSubject={setCustomSubject}
                      replyAll={replyAll}
                      onToggleReplyAll={() => setReplyAll(v => !v)}
                      onThreadRefresh={() => { void openThread(current.id); onRefresh?.() }}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 py-3">
                  {(messages ?? []).length === 0 && <Empty compact>No messages stored for this thread.</Empty>}
                  {[...(messages ?? [])].reverse().map((m, i) => (
                    <EngagementMessageCard key={m.id} msg={m} defaultOpen={i === 0} isLatest={i === 0} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
