'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Network, Reply, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Btn, Segmented, LinkBtn } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { CompanyThread } from '@/lib/crm/types'

type Filter = 'all' | 'reply' | 'rfq' | 'claim' | 'renewal' | 'general'
const CAT_TONE: Record<string, 'blue' | 'red' | 'amber' | 'neutral'> = { rfq: 'blue', claim: 'red', renewal: 'amber', general: 'neutral', other: 'neutral' }

export function ThreadsPanel({ threads, onCombine, compact }: { threads: CompanyThread[]; onCombine?: (ids: string[]) => void; compact?: boolean }) {
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
    const f = filter === 'all' ? threads
      : filter === 'reply' ? threads.filter(t => t.needsReply)
      : filter === 'general' ? threads.filter(t => !t.category || t.category === 'general' || t.category === 'other')
      : threads.filter(t => t.category === filter)
    return compact ? f.slice(0, 6) : f
  }, [threads, filter, compact])

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const actions = (
    <>
      {onCombine && selected.size > 0 && <Btn size="xs" level="primary" onClick={() => { onCombine(Array.from(selected)); setSelected(new Set()) }}><Network size={12} /> Combine {selected.size} into a case</Btn>}
      <LinkBtn size="xs" level="tertiary" href="/engagement"><ExternalLink size={12} /> Open inbox</LinkBtn>
    </>
  )

  return (
    <SectionCard title="Email threads" description={compact ? undefined : 'Every conversation with this company. Tick threads to combine them into a Nexus case.'} actions={actions} padded={false}>
      {!compact && (
        <div className="px-4 py-2.5 border-b border-[--border-subtle]">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: counts.all }, { value: 'reply', label: 'Awaiting reply', count: counts.reply },
            { value: 'rfq', label: 'RFQ', count: counts.rfq }, { value: 'claim', label: 'Claims', count: counts.claim },
            { value: 'renewal', label: 'Renewals', count: counts.renewal }, { value: 'general', label: 'General', count: counts.general },
          ]} />
        </div>
      )}
      {rows.length === 0 && <Empty compact>{threads.length === 0 ? 'No threads linked to this company yet.' : 'Nothing matches this filter.'}</Empty>}
      <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
        {rows.map(t => (
          <li key={t.id} className={cn('flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40', selected.has(t.id) && 'bg-[--selected-row-bg]')}>
            {onCombine && !compact && <input type="checkbox" className="mt-1" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label="Select thread" />}
            <Link href={`/engagement?lead=${t.id}`} className="min-w-0 flex-1 no-underline text-foreground">
              <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                <span className="truncate max-w-full">{t.subject ?? '(no subject)'}</span>
                {t.category && <Chip tone={CAT_TONE[t.category] ?? 'neutral'} className="capitalize">{t.category}</Chip>}
                {t.needsReply && <Chip tone="amber"><Reply size={10} /> Awaiting reply</Chip>}
                {t.caseIds.map(c => <Chip key={c} tone="blue" title="In a Nexus case"><Network size={10} /> Case</Chip>)}
              </p>
              <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 line-clamp-1">{t.summary ?? t.snippet ?? ''}</p>
              <p className="text-[11px] text-muted-foreground/80 m-0 mt-0.5">{t.contact?.name ?? t.contact?.email ?? 'Unknown contact'} · {t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
