'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Network, Reply, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Btn, Segmented } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { CompanyThread } from '@/lib/crm/types'

type Filter = 'all' | 'reply' | 'rfq' | 'claim' | 'renewal' | 'general'
const CAT_TONE: Record<string, 'blue' | 'red' | 'amber' | 'neutral'> = { rfq: 'blue', claim: 'red', renewal: 'amber', general: 'neutral', other: 'neutral' }

export function ThreadsPanel({ threads, onCombine, compact, title = 'Email threads', onSeeAll }: {
  threads: CompanyThread[]
  onCombine?: (ids: string[]) => void
  compact?: boolean
  title?: string
  onSeeAll?: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const counts = useMemo(() => ({
    all: threads.length,
    reply: threads.filter(t => t.needsReply).length,
    rfq: threads.filter(t => t.category === 'rfq').length,
    claim: threads.filter(t => t.category === 'claim').length,
    renewal: threads.filter(t => t.category === 'renewal').length,
    general: threads.filter(t => !t.category || t.category === 'general' || t.category === 'other').length,
  }), [threads])

  const rows = useMemo(() => {
    if (compact) return threads
    return filter === 'all' ? threads
      : filter === 'reply' ? threads.filter(t => t.needsReply)
      : filter === 'general' ? threads.filter(t => !t.category || t.category === 'general' || t.category === 'other')
      : threads.filter(t => t.category === filter)
  }, [threads, filter, compact])

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <SectionCard
      title={title}
      actions={
        <>
          {onCombine && selected.size > 0 && <Btn size="xs" level="primary" onClick={() => { onCombine(Array.from(selected)); setSelected(new Set()) }}><Network size={12} /> Combine {selected.size} into a case</Btn>}
          {onSeeAll && <button onClick={onSeeAll} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">All threads <ArrowRight size={11} /></button>}
        </>
      }
    >
      {!compact && (
        <div className="mb-2">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'reply', label: 'Awaiting reply', count: counts.reply },
            { value: 'rfq', label: 'RFQ', count: counts.rfq }, { value: 'claim', label: 'Claims', count: counts.claim },
            { value: 'renewal', label: 'Renewals', count: counts.renewal }, { value: 'general', label: 'General', count: counts.general },
          ]} />
        </div>
      )}

      {rows.length === 0 && <Empty compact>{threads.length === 0 ? 'No threads linked to this company yet.' : 'Nothing matches this filter.'}</Empty>}

      <ul className="m-0 p-0 list-none flex flex-col">
        {rows.map(t => (
          <li key={t.id} className={cn('flex items-start gap-2.5 py-2 border-b border-[--border-subtle] last:border-b-0', selected.has(t.id) && 'bg-[--selected-row-bg]')}>
            {onCombine && !compact && <input type="checkbox" className="mt-1.5" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label="Select thread" />}
            <Link href={`/engagement?lead=${t.id}`} className="min-w-0 flex-1 no-underline text-foreground">
              <p className="text-[13px] m-0 flex items-center gap-1.5 flex-wrap">
                <span className="truncate max-w-full font-medium">{t.subject ?? '(no subject)'}</span>
                {t.category && <Chip tone={CAT_TONE[t.category] ?? 'neutral'} className="capitalize">{t.category}</Chip>}
                {t.needsReply && <Chip tone="amber"><Reply size={10} /> Awaiting reply</Chip>}
                {t.caseIds.length > 0 && <Chip tone="blue" title="In a Nexus case"><Network size={10} /> Case</Chip>}
              </p>
              {t.summary && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 line-clamp-1">{t.summary}</p>}
              <p className="text-[11px] text-muted-foreground/80 m-0 mt-0.5">{t.contact?.name ?? t.contact?.email ?? 'Unknown contact'} · {t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
