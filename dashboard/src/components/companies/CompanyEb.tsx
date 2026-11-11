'use client'

/**
 * The company's EB tab: its quotations with the analysis one click away, its employee-benefits
 * policies, and + New EB for this company. Back from the report returns here.
 */
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Empty, Spinner } from '@/components/crm/primitives'
import type { QuoteRow } from '@/lib/crm/types'
import type { PolicyView } from '@/components/policies/types'
import { fmtDate } from '@/lib/format'

const MUTED = '#4a5550', INK = '#0f1412'
const BTN1 = 'inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#132c1c] text-white hover:opacity-90 no-underline border-0 cursor-pointer'

export function CompanyEb({ companyId, companyName, quotes, policies }: { companyId: string; companyName: string; quotes: QuoteRow[] | null; policies: PolicyView[] | null }) {
  const eb = (policies ?? []).filter(p => p.is_eb || /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b/i.test(`${p.class_of_insurance ?? ''} ${p.label ?? ''}`))
  const newHref = `/pricing-matrix?tab=quote&company=${encodeURIComponent(companyName)}&companyId=${companyId}`
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="m-0 text-[16px] font-medium">EB quotations</h2>
          <Link href={newHref} className={BTN1}>+ New EB</Link>
        </div>
        {!quotes ? <Spinner label="Loading…" /> : (
          <Register label="EB quotations" minWidth={640}>
            <RegisterHead>
              <RegisterTh>Quotation</RegisterTh>
              <RegisterTh>Start</RegisterTh>
              <RegisterTh align="right">Lives</RegisterTh>
              <RegisterTh>Prepared</RegisterTh>
              <RegisterTh></RegisterTh>
            </RegisterHead>
            {quotes.length === 0 && <RegisterEmpty colSpan={5}>No quotation yet. + New EB takes a census file.</RegisterEmpty>}
            {quotes.map(q => (
              <RegisterRow key={q.id}>
                <RegisterCell><Link href={`${q.href}/analysis`} className="no-underline hover:underline" style={{ color: INK }}>Analysis</Link> <Link href={q.href} className="text-[12px] no-underline hover:underline" style={{ color: MUTED }}>quotation</Link></RegisterCell>
                <RegisterCell>{q.effective_date ? fmtDate(q.effective_date) : '—'}</RegisterCell>
                <RegisterCell align="right" className="tabular-nums">{q.memberCount ?? '—'}</RegisterCell>
                <RegisterCell>{fmtDate(q.created_at)}</RegisterCell>
                <RegisterCell>{q.isOpen ? 'Open' : ''}</RegisterCell>
              </RegisterRow>
            ))}
          </Register>
        )}
      </section>
      <section>
        <h2 className="m-0 mb-3 text-[16px] font-medium">EB policies</h2>
        {!policies ? <Spinner label="Loading…" /> : eb.length === 0 ? <Empty compact>No employee-benefits policy on file.</Empty> : (
          <Register label="EB policies" minWidth={640}>
            <RegisterHead>
              <RegisterTh>Policy</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh>Ends</RegisterTh>
              <RegisterTh>State</RegisterTh>
            </RegisterHead>
            {eb.map(p => (
              <RegisterRow key={p.id}>
                <RegisterCell><Link href={`/policies/${p.id}`} className="no-underline hover:underline" style={{ color: INK }}>{p.label ?? p.class_of_insurance ?? 'Policy'}</Link>{p.policy_number ? <span style={{ color: MUTED }}> · {p.policy_number}</span> : null}</RegisterCell>
                <RegisterCell>{p.insurer ?? '—'}</RegisterCell>
                <RegisterCell>{p.end_date ? fmtDate(p.end_date) : '—'}</RegisterCell>
                <RegisterCell>{p.lifecycle}</RegisterCell>
              </RegisterRow>
            ))}
          </Register>
        )}
      </section>
    </div>
  )
}
