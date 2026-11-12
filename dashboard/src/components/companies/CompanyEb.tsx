'use client'

/**
 * The company's EB tab: its quotations with the premium and the analysis one click away, its
 * employee-benefits policies, and + New EB for this company. Back from the report returns here.
 */
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { Empty, Spinner } from '@/components/crm/primitives'
import { EbRegister } from '@/components/group-benefits/EbRegister'
import type { PolicyView } from '@/components/policies/types'
import { fmtDate } from '@/lib/format'

const MUTED = '#4a5550', INK = '#0f1412'

export function CompanyEb({ companyId, companyName, policies }: { companyId: string; companyName: string; policies: PolicyView[] | null }) {
  const eb = (policies ?? []).filter(p => p.is_eb || /benefit|medical|hospital|\bghs\b|\bgtl\b|dental|\beb\b/i.test(`${p.class_of_insurance ?? ''} ${p.label ?? ''}`))
  const newHref = `/pricing-matrix?tab=quote&company=${encodeURIComponent(companyName)}&companyId=${companyId}`
  return (
    <div className="flex flex-col gap-8">
      <EbRegister company={companyName} newHref={newHref} />
      <section>
        <h2 className="m-0 mb-3 text-[16px] font-medium">Employment benefits policies</h2>
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
