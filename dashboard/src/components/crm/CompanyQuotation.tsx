'use client'

import Link from 'next/link'
import { FilePlus } from 'lucide-react'
import { SectionCard, Chip, Empty, LinkBtn } from './primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate } from '@/lib/crm/format'
import type { QuoteRow, QuoteKind } from '@/lib/crm/types'

const INK = '#202124'
const MUTED = '#5f6368'
const KIND_LABEL: Record<QuoteKind, string> = { pricing_matrix: 'Pricing matrix' }

/**
 * Quotations prepared for this client.
 *
 * Requests to insurers ("Start RFQ", the per-insurer dispatch list, quotes read from insurer
 * replies) were retired on 2 Oct 2026 along with the rest of the RFQ workflow. What remains is
 * what the firm prepares: Pricing Matrix quotations.
 */
export function CompanyQuotation({ companyId, companyName, quotes }: {
  companyId: string
  companyName: string
  quotes: QuoteRow[]
}) {
  return (
    <SectionCard
      title="Quotes"
      actions={
        <LinkBtn size="xs" level="secondary" href={`/pricing-matrix?tab=quote&company=${encodeURIComponent(companyName)}`}>
          <FilePlus size={12} /> New quotation
        </LinkBtn>
      }
    >
      {quotes.length === 0 && <Empty compact>No quotations yet.</Empty>}
      {quotes.length > 0 && (
        <Register label="Quotes" minWidth={720}>
          <RegisterHead>
            <RegisterTh first>Quote</RegisterTh>
            <RegisterTh>Kind</RegisterTh>
            <RegisterTh>Status</RegisterTh>
            <RegisterTh align="right">Members</RegisterTh>
            <RegisterTh last />
          </RegisterHead>
          <tbody>
            {quotes.map(q => (
              <RegisterRow key={`${q.kind}-${q.id}`}>
                <RegisterCell first>
                  <Link href={q.href} className="block text-[15px] font-medium leading-tight truncate no-underline hover:underline" style={{ color: INK }}>{q.title}</Link>
                  <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>
                    {fmtDate(q.created_at)}
                    {q.effective_date && ` · effective ${fmtDate(q.effective_date)}`}
                    {q.productLine && ` · ${q.productLine}`}
                  </span>
                </RegisterCell>
                <RegisterCell><Chip>{KIND_LABEL[q.kind]}</Chip></RegisterCell>
                <RegisterCell><span className="text-[13.5px]" style={{ color: '#3c4043' }}>{q.status}</span></RegisterCell>
                <RegisterCell align="right" primary={q.memberCount ?? <span style={{ color: '#9aa0a6' }}>—</span>} />
                <RegisterCell last align="right">
                  <LinkBtn size="xs" level="secondary" href={q.href}>Open</LinkBtn>
                </RegisterCell>
              </RegisterRow>
            ))}
          </tbody>
        </Register>
      )}
    </SectionCard>
  )
}
