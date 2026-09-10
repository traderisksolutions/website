'use client'

import { useState } from 'react'
import { Star, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, Chip, Empty, Avatar, Btn } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { Person, PersonParty } from '@/lib/crm/types'

const PARTY_LABEL: Record<PersonParty, string> = { client: 'Client', insurer: 'Insurer', trs: 'TRS', other: 'Other' }
const PARTY_TONE: Record<PersonParty, 'green' | 'blue' | 'neutral' | 'amber'> = { client: 'green', insurer: 'blue', trs: 'neutral', other: 'amber' }

export function PeoplePanel({ people, observedDomains, knownDomains, onAddDomain, limit }: {
  people: Person[]
  observedDomains?: { domain: string; count: number }[]
  knownDomains?: string[]
  onAddDomain?: (d: string) => Promise<void>
  limit?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const clientSide = people.filter(p => p.party === 'client' || p.party === 'other')
  const others = people.filter(p => p.party === 'insurer' || p.party === 'trs')
  const shown = limit && !showAll ? clientSide.slice(0, limit) : clientSide
  const maxScore = Math.max(1, ...clientSide.map(p => p.score))
  const newDomains = (observedDomains ?? []).filter(d => !(knownDomains ?? []).includes(d.domain))

  return (
    <SectionCard title="People" description="Ranked by how much they correspond with us. The top client contact is the point person.">
      {clientSide.length === 0 && <Empty compact>No client correspondents yet. Link a thread to this company first.</Empty>}
      <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[--border-subtle]">
        {shown.map(p => (
          <li key={p.email} className="py-2.5 flex items-center gap-3">
            <Avatar name={p.name ?? p.email} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{p.name ?? p.email}</span>
                {p.isPrimary && <Chip tone="green" title="Most active client contact"><Star size={10} /> Point person</Chip>}
                {p.party === 'other' && <Chip tone="amber" title="Domain is not one of the company's domains">{PARTY_LABEL.other}</Chip>}
              </p>
              <p className="text-[11.5px] text-muted-foreground m-0 truncate"><a href={`mailto:${p.email}`} className="text-muted-foreground no-underline hover:underline">{p.email}</a></p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 rounded-full bg-muted flex-1 max-w-[160px] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (p.score / maxScore) * 100)}%`, background: 'var(--primary-hex)', opacity: 0.55 }} /></div>
                <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">wrote {p.sent} · sent to {p.received} · copied {p.cc}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0 hidden sm:block">
              <p className="text-[11px] text-muted-foreground m-0">{p.threads} thread{p.threads === 1 ? '' : 's'}</p>
              <p className="text-[11px] text-muted-foreground m-0">last {fmtRelative(p.lastSeen)}</p>
              {p.topics[0] && <p className="text-[10.5px] text-muted-foreground/80 m-0 capitalize">{p.topics.slice(0, 2).map(t => t.category).join(', ')}</p>}
            </div>
          </li>
        ))}
      </ul>
      {limit && clientSide.length > limit && (
        <button onClick={() => setShowAll(s => !s)} className="mt-2 text-[12px] font-semibold text-primary bg-transparent border-0 p-0 cursor-pointer hover:underline">
          {showAll ? 'Show fewer' : `Show all ${clientSide.length}`}
        </button>
      )}

      {others.length > 0 && !limit && (
        <div className="mt-3 pt-3 border-t border-[--border-subtle]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5 m-0">Also on these threads</p>
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
            {others.map(p => (
              <li key={p.email} className={cn('inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 bg-muted text-[11.5px]')} title={p.email}>
                <Chip tone={PARTY_TONE[p.party]}>{PARTY_LABEL[p.party]}</Chip>
                <span className="truncate max-w-[180px]">{p.name ?? p.email}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAddDomain && newDomains.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[--border-subtle]">
          <p className="text-[11.5px] text-muted-foreground m-0 mb-1.5">Seen on client emails but not yet in this company&apos;s domain list:</p>
          <div className="flex flex-wrap gap-1.5">
            {newDomains.map(d => (
              <Btn key={d.domain} size="xs" level="secondary" loading={adding === d.domain} onClick={async () => { setAdding(d.domain); try { await onAddDomain(d.domain) } finally { setAdding(null) } }}>
                <Plus size={11} /> {d.domain} <span className="text-muted-foreground font-normal">({d.count})</span>
              </Btn>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
