'use client'

/**
 * The company's policies with their renewal figures: net premium, claims paid, loss ratio and the
 * projected range, soonest expiry first. Each row opens the policy's ledger and pack.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Empty, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtAmount } from '@/components/policies/types'
import { fmtDate } from '@/lib/crm/format'
import { callApi, errText } from '@/components/placement/shared'
import type { CompanyRenewalRow } from '@/lib/policies/ledger'

const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)

export function CompanyRenewals({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<CompanyRenewalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    callApi<{ rows: CompanyRenewalRow[] }>(`/api/policies/ledger?company_id=${companyId}`).then(d => { if (live) setRows(d.rows) }).catch(e => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [companyId])
  if (error) return <Empty>{error}</Empty>
  if (!rows) return <Spinner label="Drawing the renewal figures…" />
  if (rows.length === 0) return <Empty>No bound or live policies on this company.</Empty>
  return (
    <Register label="Renewals" minWidth={980}>
      <RegisterHead>
        <RegisterTh first>Policy</RegisterTh>
        <RegisterTh>Insurer</RegisterTh>
        <RegisterTh>Expiry</RegisterTh>
        <RegisterTh align="right">Net premium</RegisterTh>
        <RegisterTh align="right">Endorsements</RegisterTh>
        <RegisterTh align="right">Claims paid</RegisterTh>
        <RegisterTh align="right">Loss ratio</RegisterTh>
        <RegisterTh align="right">Next, same rate</RegisterTh>
        <RegisterTh align="right">Range</RegisterTh>
        <RegisterTh align="right" last>Not on file</RegisterTh>
      </RegisterHead>
      <tbody>
        {rows.map(r => {
          const ccy = r.policy.currency
          return (
            <RegisterRow key={r.policy.id}>
              <RegisterCell first primary={<Link href={`/policies/${r.policy.id}?tab=renewal`} className="text-trs-ink no-underline hover:underline">{r.policy.class ?? r.policy.product_line ?? 'Policy'}</Link>} secondary={<span className="font-mono">{r.policy.policy_number ?? 'no number'}</span>} identityWidth={260} />
              <RegisterCell>{r.policy.insurer ?? '—'}</RegisterCell>
              <RegisterCell className="tabular-nums">{r.policy.end_date ? fmtDate(r.policy.end_date) : '—'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{fmtAmount(r.current.premium_net, ccy)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.current.endorsements_count} · {fmtAmount(r.current.endorsements_net, ccy)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.current.claims_count ? `${r.current.claims_count} · ${fmtAmount(r.current.claims_paid, ccy)}` : '0'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{pct(r.current.loss_ratio)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{fmtAmount(r.projection.same_rate, ccy)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.projection.low == null ? '—' : `${fmtAmount(r.projection.low, ccy)} – ${fmtAmount(r.projection.high, ccy)}`}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums" last>{r.missing}</RegisterCell>
            </RegisterRow>
          )
        })}
      </tbody>
    </Register>
  )
}
