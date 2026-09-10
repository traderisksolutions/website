'use client'

import Link from 'next/link'
import { ExternalLink, FilePlus, Send } from 'lucide-react'
import { SectionCard, Chip, Empty, LinkBtn } from './primitives'
import { fmtDate } from '@/lib/crm/format'
import type { QuoteRow, QuoteKind } from '@/lib/crm/types'

const KIND_LABEL: Record<QuoteKind, string> = { rfq: 'RFQ', pricing_matrix: 'Group benefits', group_benefits: 'Group benefits' }

export function QuotesPanel({ companyId, quotes, compact }: { companyId: string; quotes: QuoteRow[]; compact?: boolean }) {
  const rows = compact ? quotes.filter(q => q.isOpen).slice(0, 5) : quotes
  const actions = (
    <>
      <LinkBtn size="xs" level="secondary" href={`/nexus?newCase=1&companyId=${companyId}`}><Send size={12} /> Start RFQ</LinkBtn>
      <LinkBtn size="xs" level="tertiary" href="/pricing-matrix/quote/new"><FilePlus size={12} /> Group benefits quote</LinkBtn>
    </>
  )
  return (
    <SectionCard title="Quotes" description={compact ? undefined : 'RFQs sent to insurers and group benefits quotations prepared for this company.'} actions={actions} padded={false}>
      {rows.length === 0 && <Empty compact>{quotes.length === 0 ? 'No quotes yet.' : 'No open quotes.'}</Empty>}
      {rows.length > 0 && (
        <ul className="m-0 p-0 list-none divide-y divide-[--border-subtle]">
          {rows.map(q => (
            <li key={`${q.kind}-${q.id}`}>
              <Link href={q.href} className="flex items-center gap-3 px-4 py-2.5 no-underline text-foreground hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                    {q.title}
                    <Chip tone={q.kind === 'rfq' ? 'blue' : 'neutral'}>{KIND_LABEL[q.kind]}</Chip>
                    <Chip tone={q.isOpen ? 'amber' : 'neutral'}>{q.status}</Chip>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5">
                    {fmtDate(q.created_at)}
                    {q.quotesReceived != null && ` · ${q.quotesReceived} insurer quote${q.quotesReceived === 1 ? '' : 's'} received`}
                    {q.memberCount != null && ` · ${q.memberCount} members`}
                    {q.effective_date && ` · effective ${fmtDate(q.effective_date)}`}
                  </p>
                </div>
                <ExternalLink size={12} className="text-muted-foreground/50 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
