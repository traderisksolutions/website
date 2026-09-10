'use client'

import Link from 'next/link'
import { MailOpen, Send, Receipt, BadgeDollarSign, FileText, Network, CheckCircle2, Milestone, StickyNote } from 'lucide-react'
import { SectionCard, Empty } from './primitives'
import { fmtDateTime } from '@/lib/crm/format'
import type { ActivityEvent, ActivityKind } from '@/lib/crm/types'

const ICON: Record<ActivityKind, React.ElementType> = {
  email_in: MailOpen, email_out: Send, debit_note: Receipt, payment: BadgeDollarSign, quote: FileText, case: Network, action_done: CheckCircle2, stage: Milestone, note: StickyNote,
}
const COLOR: Record<ActivityKind, string> = {
  email_in: 'var(--primary-hex)', email_out: 'var(--text-muted)', debit_note: 'var(--warning)', payment: 'var(--success)', quote: 'var(--primary-hex)', case: 'var(--primary-hex)', action_done: 'var(--success)', stage: 'var(--text-muted)', note: 'var(--text-muted)',
}

export function CompanyTimeline({ events, limit }: { events: ActivityEvent[]; limit?: number }) {
  const rows = limit ? events.slice(0, limit) : events
  return (
    <SectionCard title="Activity" description={limit ? undefined : 'Emails, money, quotes and cases in one timeline.'} padded={false}>
      {rows.length === 0 && <Empty compact>Nothing yet.</Empty>}
      <ol className="m-0 p-0 list-none">
        {rows.map(e => {
          const Icon = ICON[e.kind]
          const body = (
            <>
              <span className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-muted" style={{ color: COLOR[e.kind] }}><Icon size={12} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] leading-snug truncate">{e.title}</span>
                {e.detail && <span className="block text-[11.5px] text-muted-foreground leading-snug truncate">{e.detail}</span>}
              </span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">{fmtDateTime(e.at)}</span>
            </>
          )
          return (
            <li key={e.id} className="border-b border-[--border-subtle] last:border-b-0">
              {e.href
                ? <Link href={e.href} className="flex items-start gap-3 px-4 py-2 no-underline text-foreground hover:bg-muted/40">{body}</Link>
                : <div className="flex items-start gap-3 px-4 py-2">{body}</div>}
            </li>
          )
        })}
      </ol>
    </SectionCard>
  )
}
