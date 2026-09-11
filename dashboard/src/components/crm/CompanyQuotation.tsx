'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Send, FilePlus, ExternalLink, X } from 'lucide-react'
import { SectionCard, Chip, Empty, Btn, LinkBtn } from './primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import ThreadRfqWorkflow from '@/components/engagement/ThreadRfqWorkflow'
import { fmtDate, fmtRelative } from '@/lib/crm/format'
import type { CompanyThread, QuoteRow, QuoteKind } from '@/lib/crm/types'

const KIND_LABEL: Record<QuoteKind, string> = { rfq: 'RFQ', pricing_matrix: 'Pricing Matrix', group_benefits: 'Legacy' }

/**
 * Quotes going out: requests to insurers and quotations prepared for the client.
 *
 * "Start RFQ" runs the established flow without leaving the company — pick the thread carrying
 * the request, the agent reads it and works out the product lines, then for each line you choose
 * the insurers, review the drafted email and send. One insurer or many.
 */
export function CompanyQuotation({ companyId, companyName, quotes, threads }: {
  companyId: string
  companyName: string
  quotes: QuoteRow[]
  threads: CompanyThread[]
}) {
  const [picking, setPicking] = useState(false)
  const [rfqThread, setRfqThread] = useState<CompanyThread | null>(null)

  // The request usually arrived recently and is often already tagged as an RFQ.
  const candidates = useMemo(() => {
    const score = (t: CompanyThread) => (t.category === 'rfq' ? 2 : 0) + (t.needsReply ? 1 : 0)
    return [...threads].sort((a, b) => score(b) - score(a) || (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
  }, [threads])

  return (
    <>
      <SectionCard
        title="Quotes"
        description="Requests out to insurers and quotations prepared for this client."
        actions={
          <>
            <Btn size="xs" level="primary" onClick={() => setPicking(true)}><Send size={12} /> Start RFQ</Btn>
            <LinkBtn size="xs" level="tertiary" href={`/pricing-matrix/quote/new?company_id=${companyId}&company=${encodeURIComponent(companyName)}`}><FilePlus size={12} /> New quotation</LinkBtn>
          </>
        }
      >
        {quotes.length === 0 && <Empty compact>No quotes yet. Start an RFQ from the client&apos;s request, or prepare a group benefits quotation.</Empty>}
        <ul className="m-0 p-0 list-none flex flex-col">
          {quotes.map(q => (
            <li key={`${q.kind}-${q.id}`} className="border-b border-[--border-subtle] last:border-b-0">
              <Link href={q.href} className="flex items-center gap-3 py-2 no-underline text-foreground hover:text-primary">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">
                    {q.title}
                    <Chip tone={q.kind === 'rfq' ? 'blue' : q.kind === 'group_benefits' ? 'neutral' : 'green'} className="ml-1.5">{KIND_LABEL[q.kind]}</Chip>
                    <Chip tone={q.isOpen ? 'amber' : 'neutral'} className="ml-1">{q.status}</Chip>
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                    {fmtDate(q.created_at)}
                    {q.quotesReceived != null && ` · ${q.quotesReceived} insurer quote${q.quotesReceived === 1 ? '' : 's'} received`}
                    {q.memberCount != null && ` · ${q.memberCount} members`}
                    {q.effective_date && ` · effective ${fmtDate(q.effective_date)}`}
                  </span>
                </span>
                <ExternalLink size={12} className="text-muted-foreground/40 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      {rfqThread && (
        <SectionCard
          title="Request for quotation"
          description={`From “${rfqThread.subject ?? 'the selected thread'}”. Pick the insurers for each line, review the wording, then send.`}
          actions={<Btn size="xs" level="tertiary" onClick={() => setRfqThread(null)}><X size={12} /> Close</Btn>}
        >
          <ThreadRfqWorkflow threadId={rfqThread.id} messageId={null} defaultInsured={companyName} />
        </SectionCard>
      )}

      {/* Which conversation carries the request */}
      <Dialog open={picking} onOpenChange={o => { if (!o) setPicking(false) }}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Which email is the request?</DialogTitle>
            <DialogDescription>
              The agent reads that thread, works out what cover is being asked for, and drafts a request to each insurer you choose.
            </DialogDescription>
          </DialogHeader>
          {candidates.length === 0 && <Empty compact>No threads are filed under this company yet.</Empty>}
          <ul className="m-0 p-0 list-none flex flex-col max-h-[50vh] overflow-y-auto">
            {candidates.map(t => (
              <li key={t.id} className="border-b border-[--border-subtle] last:border-b-0">
                <button
                  onClick={() => { setRfqThread(t); setPicking(false) }}
                  className="w-full text-left py-2.5 bg-transparent border-0 cursor-pointer hover:bg-muted/40"
                >
                  <p className="text-[12.5px] font-medium m-0 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{t.subject ?? '(no subject)'}</span>
                    {t.category === 'rfq' && <Chip tone="blue">RFQ</Chip>}
                    {t.needsReply && <Chip tone="amber">Awaiting reply</Chip>}
                  </p>
                  <p className="text-[11.5px] text-muted-foreground m-0 mt-0.5 truncate">
                    {t.contact?.name ?? t.contact?.email ?? 'Unknown'} · {t.message_count} message{t.message_count === 1 ? '' : 's'} · {fmtRelative(t.last_message_at)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {/* companyId is used by callers for deep links; referenced so the prop stays meaningful. */}
      <span hidden data-company={companyId} />
    </>
  )
}
