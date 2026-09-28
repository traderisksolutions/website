'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Send, FilePlus, X, ChevronRight, ChevronDown } from 'lucide-react'
import { SectionCard, Chip, Empty, Btn, LinkBtn } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import ThreadRfqWorkflow from '@/components/engagement/ThreadRfqWorkflow'
import { fmtDate, fmtRelative } from '@/lib/crm/format'
import type { CompanyThread, QuoteRow, QuoteKind } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const HAIR = '#e8eaed'
const KIND_LABEL: Record<QuoteKind, string> = { rfq: 'RFQ', pricing_matrix: 'Pricing matrix', group_benefits: 'Legacy' }
const QUOTE_COLS = 5

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
        actions={
          <>
            <Btn size="xs" level="secondary" onClick={() => setPicking(true)}><Send size={12} /> Start RFQ</Btn>
            <LinkBtn size="xs" level="tertiary" href={`/pricing-matrix/quote/new?company_id=${companyId}&company=${encodeURIComponent(companyName)}`}><FilePlus size={12} /> New quotation</LinkBtn>
          </>
        }
      >
        {quotes.length === 0 && <Empty compact>No quotes yet. Start an RFQ from the client&apos;s request, or prepare a group benefits quotation.</Empty>}
        {quotes.length > 0 && (
          <Register label="Quotes" minWidth={820}>
            <RegisterHead>
              <RegisterTh first>Quote</RegisterTh>
              <RegisterTh>Kind</RegisterTh>
              <RegisterTh>Status</RegisterTh>
              <RegisterTh align="right">Received</RegisterTh>
              <RegisterTh last />
            </RegisterHead>
            <tbody>
              {quotes.map(q => <QuoteRowItem key={`${q.kind}-${q.id}`} q={q} open={openQuote === q.id} onToggle={() => setOpenQuote(v => v === q.id ? null : q.id)} />)}
            </tbody>
          </Register>
        )}
      </SectionCard>

      {rfqThread && (
        <SectionCard
          title="Request for quotation"
          actions={<Btn size="xs" level="tertiary" onClick={() => setRfqThread(null)}><X size={12} /> Close</Btn>}
        >
          <ThreadRfqWorkflow threadId={rfqThread.id} messageId={rfqThread.lastInboundMessageId} defaultInsured={companyName} />
        </SectionCard>
      )}

      {/* Which conversation carries the request */}
      <Dialog open={picking} onOpenChange={o => { if (!o) setPicking(false) }}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Choose the request email</DialogTitle>
            <DialogDescription>
              The agent reads that thread, works out what cover is being asked for, and drafts a request to each insurer you choose.
            </DialogDescription>
          </DialogHeader>
          {candidates.length === 0 && <Empty compact>No threads are filed under this company yet.</Empty>}
          {candidates.length > 0 && (
            <Register label="Threads filed under this company" minWidth={520} maxHeight="50vh">
              <RegisterHead>
                <RegisterTh first>Thread</RegisterTh>
                <RegisterTh>Category</RegisterTh>
                <RegisterTh last align="right">Last message</RegisterTh>
              </RegisterHead>
              <tbody>
                {candidates.map(t => (
                  <RegisterRow key={t.id} onClick={() => { setRfqThread(t); setPicking(false) }}>
                    <RegisterCell first className="max-w-none"
                      primary={t.subject ?? '(no subject)'}
                      secondary={`${t.contact?.name ?? t.contact?.email ?? 'Unknown'} · ${t.message_count} message${t.message_count === 1 ? '' : 's'}`} />
                    <RegisterCell>
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {t.category === 'rfq' && <Chip>RFQ</Chip>}
                        {t.needsReply && <Chip>Awaiting reply</Chip>}
                        {t.category !== 'rfq' && !t.needsReply && <span style={{ color: '#9aa0a6' }}>—</span>}
                      </span>
                    </RegisterCell>
                    <RegisterCell last align="right" primary={fmtRelative(t.last_message_at)} />
                  </RegisterRow>
                ))}
              </tbody>
            </Register>
          )}
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

  const received = q.quotesReceived != null
    ? { n: q.quotesReceived, what: `insurer quote${q.quotesReceived === 1 ? '' : 's'}` }
    : q.memberCount != null
      ? { n: q.memberCount, what: 'members' }
      : null

  return (
    <>
      <RegisterRow onClick={expandable ? onToggle : undefined} selected={open}>
        <RegisterCell first selected={open}>
          <span className="flex items-center gap-2 min-w-0">
            {expandable
              ? (open ? <ChevronDown size={14} className="flex-shrink-0" style={{ color: MUTED }} aria-hidden /> : <ChevronRight size={14} className="flex-shrink-0" style={{ color: MUTED }} aria-hidden />)
              : <span className="w-[14px] flex-shrink-0" aria-hidden />}
            <span className="min-w-0">
              {expandable
                ? <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{q.title}</span>
                : <Link href={q.href} className="block text-[15px] font-medium leading-tight truncate no-underline hover:underline" style={{ color: INK }}>{q.title}</Link>}
              <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                {fmtDate(q.created_at)}
                {q.effective_date && ` · effective ${fmtDate(q.effective_date)}`}
                {q.productLine && ` · ${q.productLine}`}
              </span>
            </span>
          </span>
        </RegisterCell>
        <RegisterCell><Chip>{KIND_LABEL[q.kind]}</Chip></RegisterCell>
        <RegisterCell><span className="text-[13.5px]" style={{ color: '#3c4043' }}>{q.status}</span></RegisterCell>
        <RegisterCell align="right" primary={received ? received.n : <span style={{ color: '#9aa0a6' }}>—</span>} secondary={received?.what} />
        <RegisterCell last align="right">
          <LinkBtn size="xs" level="secondary" href={q.href}>Open</LinkBtn>
        </RegisterCell>
      </RegisterRow>

      {open && expandable && (
        <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
          <td colSpan={QUOTE_COLS} className="px-6 pt-1 pb-5">
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] m-0" style={{ color: MUTED }}>
                Sent to {dispatches.length} insurer{dispatches.length === 1 ? '' : 's'}
                {replied.length > 0 && ` · ${replied.length} replied`}
                {waiting.length > 0 && ` · ${waiting.length} awaiting response`}
              </p>

              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {dispatches.map(d => (
                  <li key={d.id} className="rounded-[16px] bg-white px-5 py-4" style={{ border: `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-medium" style={{ color: INK }}>{d.insurerName}</span>
                      {d.status === 'replied'
                        ? <Chip>Replied</Chip>
                        : <Chip>Awaiting response · {d.daysWaiting}d</Chip>}
                      {d.threadId && (
                        <Link href={`/engagement?lead=${d.threadId}`} className="text-[13px] no-underline hover:underline ml-auto" style={{ color: INK }}>
                          Open the conversation
                        </Link>
                      )}
                    </div>
                    <p className="text-[12.5px] m-0 mt-0.5" style={{ color: MUTED }}>
                      {d.toEmail ?? 'no address recorded'} · sent {fmtRelative(d.sentAt)}
                    </p>

                    {d.quote && (
                      <div className="mt-2.5 pt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]" style={{ color: INK, borderTop: `1px solid ${HAIR}` }}>
                        {d.quote.premium && <span><span style={{ color: MUTED }}>Premium </span><span className="font-medium">{d.quote.premium}</span></span>}
                        {d.quote.excess && <span><span style={{ color: MUTED }}>Excess </span><span className="font-medium">{d.quote.excess}</span></span>}
                        {d.quote.limitIndemnity && <span><span style={{ color: MUTED }}>Limit </span><span className="font-medium">{d.quote.limitIndemnity}</span></span>}
                        {d.quote.validity && <span><span style={{ color: MUTED }}>Valid </span><span className="font-medium">{d.quote.validity}</span></span>}
                        {d.quote.sourceLabel && (
                          <span className="w-full text-[12.5px]" style={{ color: MUTED }}>Read from {d.quote.sourceLabel}</span>
                        )}
                      </div>
                    )}

                    {d.status === 'replied' && !d.quote && (
                      <p className="text-[13px] m-0 mt-2" style={{ color: MUTED }}>
                        Replied, but no figures could be read out of it yet. Open the conversation to check.
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {q.caseId && (
                <Link href={q.href} className="text-[13px] no-underline hover:underline self-start" style={{ color: INK }}>
                  Compare and recommend in Nexus →
                </Link>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
