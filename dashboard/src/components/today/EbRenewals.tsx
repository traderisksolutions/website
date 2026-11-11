'use client'

/**
 * EB renewals: every employee-benefits policy ending in the next 120 days (and the last 30), one
 * row each, with one button. Analyse prices the client's last census through the one run and
 * opens the report; with no census on file, + New EB opens with the company filled in.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Btn, Spinner } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/format'
import type { EbRenewalRow } from '@/app/api/today/eb-renewals/route'

const MUTED = '#4a5550', INK = '#0f1412'

export function EbRenewals() {
  const router = useRouter()
  const [rows, setRows] = useState<EbRenewalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/today/eb-renewals', { cache: 'no-store' })
      const d = await res.json().catch(() => ({})) as { rows?: EbRenewalRow[]; error?: string }
      if (!res.ok || !Array.isArray(d.rows)) { setError(d.error ?? `Could not load (${res.status}).`); setRows([]); return }
      setRows(d.rows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); setRows([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function analyse(r: EbRenewalRow) {
    if (!r.quotation_id) return
    setBusy(r.policy_id); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${r.quotation_id}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run: true, current_insurer: r.insurer }) })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setError(d.error ?? `The analysis did not run (${res.status}).`); return }
      router.push(`/pricing-matrix/quote/${r.quotation_id}/analysis`)
    } finally { setBusy(null) }
  }

  if (!rows) return <Spinner label="Loading EB renewals…" />
  return (
    <section className="mb-8">
      <h2 className="m-0 mb-1 text-[16px] font-medium">EB renewals</h2>
      <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>Employee-benefits policies ending in the next 120 days. Analyse prices the last census on file at every insurer; with none, + New EB takes a file.</p>
      {error && <p className="m-0 mb-2 text-[13px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      <Register label="EB renewals" minWidth={760}>
        <RegisterHead>
          <RegisterTh>Client</RegisterTh>
          <RegisterTh>Policy</RegisterTh>
          <RegisterTh>Insurer</RegisterTh>
          <RegisterTh>Ends</RegisterTh>
          <RegisterTh align="right">Days</RegisterTh>
          <RegisterTh align="right">Census</RegisterTh>
          <RegisterTh></RegisterTh>
        </RegisterHead>
        {rows.length === 0 && <RegisterEmpty colSpan={7}>No employee-benefits policy ends in the next 120 days.</RegisterEmpty>}
        {rows.map(r => (
          <RegisterRow key={r.policy_id}>
            <RegisterCell>{r.company_id ? <Link href={`/companies/${r.company_id}?tab=eb`} className="no-underline hover:underline" style={{ color: INK }}>{r.company}</Link> : r.company}</RegisterCell>
            <RegisterCell>{r.policy}{r.policy_number ? <span style={{ color: MUTED }}> · {r.policy_number}</span> : null}</RegisterCell>
            <RegisterCell>{r.insurer ?? '—'}</RegisterCell>
            <RegisterCell>{fmtDate(r.end_date)}</RegisterCell>
            <RegisterCell align="right" className="tabular-nums"><span style={{ color: r.days < 0 ? '#a1242f' : undefined }}>{r.days}</span></RegisterCell>
            <RegisterCell align="right" className="tabular-nums">{r.members ?? <span style={{ color: MUTED }}>none</span>}</RegisterCell>
            <RegisterCell>
              {r.quotation_id
                ? r.analysed
                  ? <Link href={`/pricing-matrix/quote/${r.quotation_id}/analysis`} className="no-underline hover:underline text-[13px]" style={{ color: INK }}>Open analysis</Link>
                  : <Btn size="xs" level="primary" onClick={() => analyse(r)} loading={busy === r.policy_id}>Analyse</Btn>
                : <Link href={`/pricing-matrix?tab=quote&company=${encodeURIComponent(r.company)}${r.company_id ? `&companyId=${r.company_id}` : ''}`} className="no-underline hover:underline text-[13px]" style={{ color: INK }}>+ New EB</Link>}
            </RegisterCell>
          </RegisterRow>
        ))}
      </Register>
    </section>
  )
}
