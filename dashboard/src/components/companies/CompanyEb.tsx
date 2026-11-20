'use client'

/**
 * The company's Employment Benefits tab: its quotations kept from /eb (eb_quotations, each opening
 * its proposal), New quotation for this company (/eb?company=<id>), and its employee-benefits policies.
 */
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Empty, LinkBtn, Spinner } from '@/components/crm/primitives'
import { EbQuotationRegister } from '@/components/eb/EbQuotationRegister'
import type { PolicyView } from '@/components/policies/types'
import { fmtDate } from '@/lib/format'

export function CompanyEb({ companyId, policies }: { companyId: string; companyName?: string; policies: PolicyView[] | null }) {
  const eb = (policies ?? []).filter(p => p.is_eb || /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b/i.test(`${p.class_of_insurance ?? ''} ${p.label ?? ''}`))
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="m-0 text-heading font-medium">Quotations</h2>
          <span data-same-tab><LinkBtn level="primary" href={`/eb?company=${companyId}`}>New quotation</LinkBtn></span>
        </div>
        <EbQuotationRegister companyId={companyId} />
      </section>
      <section>
        <h2 className="m-0 mb-3 text-heading font-medium">Employment benefits policies</h2>
        {!policies ? <Spinner label="Loading…" /> : eb.length === 0 ? <Empty compact>No employee-benefits policy on file.</Empty> : (
          <Register label="Employment benefits policies" minWidth={640}>
            <RegisterHead>
              <RegisterTh>Policy</RegisterTh>
              <RegisterTh>Insurer</RegisterTh>
              <RegisterTh>Ends</RegisterTh>
              <RegisterTh>State</RegisterTh>
            </RegisterHead>
            {eb.map(p => (
              <RegisterRow key={p.id}>
                <RegisterCell><Link href={`/policies/${p.id}`} className="no-underline hover:underline text-trs-ink">{p.label ?? p.class_of_insurance ?? 'Policy'}</Link>{p.policy_number ? <span className="text-trs-muted"> · {p.policy_number}</span> : null}</RegisterCell>
                <RegisterCell align="left">{p.insurer ?? '—'}</RegisterCell>
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
