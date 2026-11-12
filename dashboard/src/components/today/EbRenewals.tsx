'use client'

/**
 * EB renewals: every employee-benefits policy ending in the next 120 days (and the last 30), one
 * row each, with one button. Analyse prices the client's last census through the one run and
 * opens the report; with no census on file, + New EB opens with the company filled in.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Spinner } from '@/components/crm/primitives'
import { fmtDate } from '@/lib/format'
import { shortInsurer } from '@/lib/gb/insurer-names'
import type { EbRenewalRow } from '@/app/api/today/eb-renewals/route'

const MUTED = '#4a5550', INK = '#0f1412'
/** The insurer as the house writes it, or its first two words. */
const insurerWord = (name: string) => { const s = shortInsurer(name); return s !== name ? s : name.split(/\s+/).slice(0, 2).join(' ') }

export function EbRenewals() {
  const [rows, setRows] = useState<EbRenewalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/today/eb-renewals', { cache: 'no-store' })
      const d = await res.json().catch(() => ({})) as { rows?: EbRenewalRow[]; error?: string }
      if (!res.ok || !Array.isArray(d.rows)) { setError(d.error ?? `Could not load (${res.status}).`); setRows([]); return }
      setRows(d.rows)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); setRows([]) }
  }, [])
  useEffect(() => { void load() }, [load])



  if (!rows) return <Spinner label="Loading employment benefits renewals…" />
  return (
    <section className="mb-8">
      <h2 className="m-0 mb-1 text-[16px] font-medium">Employment benefits renewals</h2>
      <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>Employee-benefits policies ending in the next 120 days. Open census lists the spreadsheets on file for the client and the current-cover schedule confirmed last time. Pick the file and tabs, confirm the cover, analyse.</p>
      {error && <p className="m-0 mb-2 text-[13px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      <Register label="Employment benefits renewals" minWidth={640}>
        <RegisterHead>
          <RegisterTh>Client</RegisterTh>
          <RegisterTh>Policy</RegisterTh>
          <RegisterTh>Ends</RegisterTh>
          <RegisterTh align="right">Census</RegisterTh>
          <RegisterTh></RegisterTh>
        </RegisterHead>
        {rows.length === 0 && <RegisterEmpty colSpan={5}>No employee-benefits policy ends in the next 120 days.</RegisterEmpty>}
        {rows.map(r => (
          <RegisterRow key={r.policy_id}>
            <RegisterCell><div className="max-w-[220px] truncate" title={r.company}>{r.company_id ? <Link href={`/companies/${r.company_id}?tab=eb`} className="no-underline hover:underline" style={{ color: INK }}>{r.company}</Link> : r.company}</div></RegisterCell>
            <RegisterCell><div className="max-w-[260px] truncate" title={`${r.policy}${r.policy_number ? ` · ${r.policy_number}` : ''}`}>{r.policy}</div><div className="text-[12px]" style={{ color: MUTED }}>{r.insurer ? insurerWord(r.insurer) : '—'}</div></RegisterCell>
            <RegisterCell><span className="whitespace-nowrap">{fmtDate(r.end_date)}</span><div className="text-[12px] tabular-nums" style={{ color: r.days < 0 ? '#a1242f' : MUTED }}>{r.days < 0 ? `${-r.days} days ago` : `in ${r.days} days`}</div></RegisterCell>
            <RegisterCell align="right" className="tabular-nums">{r.members ?? <span style={{ color: MUTED }}>none</span>}</RegisterCell>
            <RegisterCell>
              {r.analysed && r.quotation_id
                ? <Link href={`/pricing-matrix/quote/${r.quotation_id}/analysis`} className="no-underline hover:underline text-[13px] whitespace-nowrap" style={{ color: INK }}>Open analysis</Link>
                : <Link href={`/pricing-matrix/new?company=${encodeURIComponent(r.company)}${r.company_id ? `&companyId=${r.company_id}` : ''}`} className="inline-flex items-center h-[26px] px-2.5 rounded-[6px] text-white text-[12.5px] font-medium no-underline whitespace-nowrap" style={{ background: '#132c1c' }}>Open census</Link>}
            </RegisterCell>
          </RegisterRow>
        ))}
      </Register>
    </section>
  )
}
