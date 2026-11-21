'use client'

/**
 * The Quotation register (Jarod, 20 Nov 2026): every Employment Benefits quotation kept from /eb
 * (eb_quotations), newest first, one row each, searchable by company and filtered by status (All,
 * Draft, Sent). A row opens its proposal (/eb/proposal/<id>). With `companyId`, that company's
 * quotations only (the company page's Employment Benefits tab).
 * The older quotations (gb_quotations) stay reachable by their own addresses. No model is called.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { inputCls, Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { fmtDate, fmtDay, timeAgo } from '@/lib/format'
import { ebFetch } from '@/lib/gb/fetch'

export type EbRegisterItem = {
  id: string; company_id: string | null; company_name: string; effective_date: string | null; basis: string | null
  products: string[]; version: number; sent_at: string | null; created_at: string; updated_at: string | null
}

/** "Draft", or "Proposal sent 20 Nov" once the email has gone. */
const statusOf = (r: Pick<EbRegisterItem, 'sent_at'>): string => (r.sent_at ? `Proposal sent ${fmtDay(r.sent_at)}` : 'Draft')
const basisWord = (b: string | null): string => (b === 'renewal' ? 'Renewal' : b === 'new_business' ? 'New business' : '—')

export function EbQuotationRegister({ companyId }: { companyId?: string }) {
  const [rows, setRows] = useState<EbRegisterItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'draft' | 'sent'>('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await ebFetch(companyId ? `/api/eb/quotations?company=${encodeURIComponent(companyId)}` : '/api/eb/quotations', { cache: 'no-store' })
      const d = await res.json().catch(() => null) as { quotations?: EbRegisterItem[]; error?: string } | null
      if (!res.ok || !Array.isArray(d?.quotations)) { setError(d?.error ?? `The register could not be loaded (${res.status}).`); setRows([]); return }
      setRows(d.quotations)
    } catch (e) { setError(e instanceof Error ? e.message : 'The register could not be loaded.'); setRows([]) }
  }, [companyId])
  useEffect(() => { void load() }, [load])

  const cols = companyId ? 6 : 7
  const open = (id: string) => `/eb/proposal/${id}`
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter(r => (status === 'all' || (status === 'sent') === !!r.sent_at) && (!q || r.company_name.toLowerCase().includes(q)))
  }, [rows, search, status])
  const count = (k: 'all' | 'draft' | 'sent') => (rows ?? []).filter(r => k === 'all' || (k === 'sent') === !!r.sent_at).length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {!companyId && <input type="search" aria-label="Search by company" placeholder="Search by company" value={search} onChange={e => setSearch(e.target.value)} className={`${inputCls} max-w-[320px]`} />}
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All', count: count('all') }, { value: 'draft', label: 'Draft', count: count('draft') }, { value: 'sent', label: 'Sent', count: count('sent') }]} />
      </div>
      {error && <p className="m-0 text-body text-trs-neg" role="alert">{error}</p>}
      <Register label="Quotation register" minWidth={companyId ? 720 : 900}>
        <RegisterHead>
          {!companyId && <RegisterTh first>Company</RegisterTh>}
          <RegisterTh>Effective date</RegisterTh>
          <RegisterTh>Basis</RegisterTh>
          <RegisterTh>Insurers</RegisterTh>
          <RegisterTh>Version</RegisterTh>
          <RegisterTh>Status</RegisterTh>
          <RegisterTh last>Updated</RegisterTh>
        </RegisterHead>
        <tbody>
          {rows === null && <RegisterEmpty colSpan={cols}>Loading the quotations…</RegisterEmpty>}
          {rows?.length === 0 && !error && <RegisterEmpty colSpan={cols}>No quotation yet. New quotation takes a census.</RegisterEmpty>}
          {!!rows?.length && !shown.length && <RegisterEmpty colSpan={cols}>No quotation matches.</RegisterEmpty>}
          {rows && shown.map(r => {
            const updated = r.updated_at ?? r.created_at
            return (
              <RegisterRow key={r.id}>
                {!companyId && <RegisterCell first><Link href={open(r.id)} className="no-underline hover:underline text-trs-ink">{r.company_name || 'Untitled'}</Link></RegisterCell>}
                <RegisterCell>{companyId ? <Link href={open(r.id)} className="no-underline hover:underline text-trs-ink">{fmtDate(r.effective_date)}</Link> : fmtDate(r.effective_date)}</RegisterCell>
                <RegisterCell>{basisWord(r.basis)}</RegisterCell>
                <RegisterCell title={r.products.join(', ')} className="tabular-nums">{r.products.length}</RegisterCell>
                <RegisterCell className="tabular-nums">V{r.version}</RegisterCell>
                <RegisterCell>{statusOf(r)}</RegisterCell>
                <RegisterCell last><span title={fmtDate(updated)}>{timeAgo(updated)}</span></RegisterCell>
              </RegisterRow>
            )
          })}
        </tbody>
      </Register>
    </div>
  )
}
