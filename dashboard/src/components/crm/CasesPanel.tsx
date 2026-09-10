'use client'

import Link from 'next/link'
import { Plus, ExternalLink } from 'lucide-react'
import { SectionCard, Chip, Empty, Btn } from './primitives'
import { fmtRelative } from '@/lib/crm/format'
import type { CaseRow } from '@/lib/crm/types'

export function CasesPanel({ cases, onNew, compact }: { cases: CaseRow[]; onNew: () => void; compact?: boolean }) {
  const rows = compact ? cases.filter(c => c.status === 'open').slice(0, 4) : cases
  return (
    <SectionCard title="Nexus cases" description={compact ? undefined : 'Groups of threads analysed together: claims, disputes, multi-insurer RFQs.'} actions={<Btn size="xs" level="secondary" onClick={onNew}><Plus size={12} /> New case</Btn>} padded={false}>
      {rows.length === 0 && <Empty compact>{cases.length === 0 ? 'No cases for this company.' : 'No open cases.'}</Empty>}
      <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
        {rows.map(c => (
          <li key={c.id}>
            <Link href={`/nexus?case=${c.id}`} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap"><span className="truncate">{c.name}</span><Chip tone={c.status === 'open' ? 'green' : 'neutral'} className="capitalize">{c.status}</Chip></p>
                {c.description && <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 line-clamp-1">{c.description}</p>}
                <p className="text-[11px] text-muted-foreground/80 m-0 mt-0.5">{c.thread_count} thread{c.thread_count === 1 ? '' : 's'} · activity {fmtRelative(c.last_activity ?? c.updated_at)}</p>
              </div>
              <ExternalLink size={12} className="text-muted-foreground/50 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
