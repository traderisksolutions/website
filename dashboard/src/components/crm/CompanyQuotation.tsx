'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Send, FilePlus, ExternalLink, X, ChevronRight, ChevronDown, MailCheck, Clock, Paperclip } from 'lucide-react'
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
  const [openQuote, setOpenQuote] = useState<string | null>(null)

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
          {quotes.map(q => <QuoteRowItem key={`${q.kind}-${q.id}`} q={q} open={openQuote === q.id} onToggle={() => setOpenQuote(v => v === q.id ? null : q.id)} />)}
        </ul>
      </SectionCard>

      {rfqThread && (
        <SectionCard
          title="Request for quotation"
          description={`From “${rfqThread.subject ?? 'the selected thread'}”. Pick the insurers for each line, review the wording, then send.`}
          actions={<Btn size="xs" level="tertiary" onClick={() => setRfqThread(null)}><X size={12} /> Close</Btn>}
        >
          <ThreadRfqWorkflow threadId={rfqThread.id} messageId={rfqThread.lastInboundMessageId} defaultInsured={companyName} />
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

/**
 * One quote, expandable. For an RFQ that means the per-insurer picture: who it went to, who
 * has answered, how long the rest have been sitting, and the figures we read out of each
 * reply — the questions a broker actually asks about a quote in flight.
 */
function QuoteRowItem({ q, open, onToggle }: { q: QuoteRow; open: boolean; onToggle: () => void }) {
  const dispatches = q.dispatches ?? []
  const expandable = q.kind === 'rfq' && dispatches.length > 0
  const replied = dispatches.filter(d => d.status === 'replied')
  const waiting = dispatches.filter(d => d.status !== 'replied')

  return (
    <li className="border-b border-[--border-subtle] last:border-b-0">
      <div className="flex items-center gap-2 py-2">
        {expandable ? (
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-2 min-w-0 flex-1 bg-transparent border-0 p-0 text-left cursor-pointer text-foreground hover:text-primary"
          >
            {open ? <ChevronDown size={13} className="flex-shrink-0 text-muted-foreground" /> : <ChevronRight size={13} className="flex-shrink-0 text-muted-foreground" />}
            <QuoteLabel q={q} />
          </button>
        ) : (
          <Link href={q.href} className="flex items-center gap-2 min-w-0 flex-1 no-underline text-foreground hover:text-primary">
            <span className="w-[13px] flex-shrink-0" />
            <QuoteLabel q={q} />
          </Link>
        )}
        <Link href={q.href} className="flex-shrink-0 text-muted-foreground/40 hover:text-primary" title="Open the full file">
          <ExternalLink size={12} />
        </Link>
      </div>

      {open && expandable && (
        <div className="pb-3 pl-[21px] flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold m-0">
            Sent to {dispatches.length} insurer{dispatches.length === 1 ? '' : 's'}
            {replied.length > 0 && ` · ${replied.length} replied`}
            {waiting.length > 0 && ` · ${waiting.length} awaiting response`}
          </p>

          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {dispatches.map(d => (
              <li key={d.id} className="rounded-md border border-[--border-subtle] px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-medium">{d.insurerName}</span>
                  {d.status === 'replied'
                    ? <Chip tone="green"><MailCheck size={10} /> Replied</Chip>
                    : <Chip tone={d.daysWaiting >= 3 ? 'amber' : 'neutral'}><Clock size={10} /> Awaiting response · {d.daysWaiting}d</Chip>}
                  {d.threadId && (
                    <Link href={`/engagement?lead=${d.threadId}`} className="text-[11.5px] font-semibold text-primary no-underline hover:underline ml-auto">
                      Open the conversation
                    </Link>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground m-0 mt-0.5">
                  {d.toEmail ?? 'no address recorded'} · sent {fmtRelative(d.sentAt)}
                </p>

                {d.quote && (
                  <div className="mt-2 pt-2 border-t border-[--border-subtle] flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
                    {d.quote.premium && <span><span className="text-muted-foreground">Premium </span><strong>{d.quote.premium}</strong></span>}
                    {d.quote.excess && <span><span className="text-muted-foreground">Excess </span><strong>{d.quote.excess}</strong></span>}
                    {d.quote.limitIndemnity && <span><span className="text-muted-foreground">Limit </span><strong>{d.quote.limitIndemnity}</strong></span>}
                    {d.quote.validity && <span><span className="text-muted-foreground">Valid </span><strong>{d.quote.validity}</strong></span>}
                    {d.quote.sourceLabel && (
                      <span className="text-muted-foreground inline-flex items-center gap-1 w-full">
                        <Paperclip size={10} /> read from {d.quote.sourceLabel}
                      </span>
                    )}
                  </div>
                )}

                {d.status === 'replied' && !d.quote && (
                  <p className="text-[11.5px] text-muted-foreground m-0 mt-1.5">
                    Replied, but no figures could be read out of it yet. Open the conversation to check.
                  </p>
                )}
              </li>
            ))}
          </ul>

          {q.caseId && (
            <Link href={q.href} className="text-[12px] font-semibold text-primary no-underline hover:underline self-start">
              Compare and recommend in Nexus →
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

function QuoteLabel({ q }: { q: QuoteRow }) {
  return (
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
  )
}
