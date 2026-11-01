'use client'

/**
 * The group's renewals in expiry order with each policy's headline figures and whether its
 * report has been drafted or sent. Reads /api/policies/[companyId]/renewal/calendar.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Chip, Empty, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { fmtAmount } from '@/components/policies/types'
import { fmtDate } from '@/lib/crm/format'
import { callApi, errText } from '@/components/placement/shared'
import type { CompanyRenewalRow } from '@/lib/policies/ledger'

type Row = CompanyRenewalRow & { report: 'sent' | 'pending' | null; days_to_expiry: number | null }
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)

export function RenewalCalendar({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    callApi<{ rows: Row[] }>(`/api/policies/${companyId}/renewal/calendar`).then(d => { if (live) setRows(d.rows) }).catch(e => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [companyId])
  if (error) return <Empty>{error}</Empty>
  if (!rows) return <Spinner label="Drawing the renewal calendar…" />
  return (
    <Register label="Renewal calendar" minWidth={1040}>
      <RegisterHead>
        <RegisterTh first>Expiry</RegisterTh>
        <RegisterTh>Policy</RegisterTh>
        <RegisterTh>Insurer</RegisterTh>
        <RegisterTh align="right">Premium</RegisterTh>
        <RegisterTh align="right">Loss ratio</RegisterTh>
        <RegisterTh align="right" hint="Members now against members at inception">Lives</RegisterTh>
        <RegisterTh align="right">Next, same rate</RegisterTh>
        <RegisterTh last>Report</RegisterTh>
      </RegisterHead>
      <tbody>
        {rows.length === 0 && <RegisterEmpty colSpan={8}>No policies with an expiry date on this company</RegisterEmpty>}
        {rows.map(r => {
          const ccy = r.policy.currency
          const d = r.days_to_expiry
          const lives = r.current.members_now == null && r.current.members_inception == null ? '—' : `${r.current.members_now ?? '—'} / ${r.current.members_inception ?? '—'}`
          return (
            <RegisterRow key={r.policy.id}>
              <RegisterCell first className="tabular-nums" identityWidth={170}>
                {r.policy.end_date ? fmtDate(r.policy.end_date) : '—'}{d != null && <> <Chip tone={d < 0 ? 'red' : d <= 30 ? 'amber' : 'neutral'}>{d < 0 ? `${-d} d ago` : `${d} d`}</Chip></>}
              </RegisterCell>
              <RegisterCell primary={<Link href={`/policies/${r.policy.id}?tab=renewal`} className="text-trs-ink no-underline hover:underline">{r.policy.class ?? r.policy.product_line ?? 'Policy'}</Link>} secondary={<span className="font-mono">{r.policy.policy_number ?? 'no number'}</span>} identityWidth={240} />
              <RegisterCell>{r.policy.insurer ?? '—'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{fmtAmount(r.current.premium_net || r.current.premium_inception, ccy)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.current.claims_count && r.current.claims_paid === 0 ? '—' : pct(r.current.loss_ratio)}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.policy.is_eb ? lives : '—'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{fmtAmount(r.projection.same_rate, ccy)}</RegisterCell>
              <RegisterCell last>{r.report === 'sent' ? <Chip tone="green">Sent</Chip> : r.report === 'pending' ? <Chip tone="amber">Drafted</Chip> : <Chip tone="neutral">No</Chip>}</RegisterCell>
            </RegisterRow>
          )
        })}
      </tbody>
    </Register>
  )
}
