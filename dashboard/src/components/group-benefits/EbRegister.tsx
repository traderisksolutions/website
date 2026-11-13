'use client'

/**
 * The EB register: every saved quotation, one row each, newest first. The price shown is the
 * analysis's suggested package at its best insurer; a quotation without an analysis shows the
 * lowest total its engine run gave, marked. A row opens the analysis. + New EB takes a census
 * file. With `company` set, only that company's rows (the company page's EB tab).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Segmented } from '@/components/crm/primitives'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { companyKey, fmtDate, money, timeAgo } from '@/lib/format'

type Result = { insurer_name: string; total: number; missing?: number; subtotal?: number }
export type QuotationRow = {
  id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number | null
  source: string | null; created_at: string; updated_at?: string | null; results: Result[] | null
  requirement?: { categories?: { name: string }[] } | null
  analysis?: { suggested: string; package: string; best_insurer: string | null; best_net: number | null; at: string } | null
}

type Filter = 'all' | 'soon' | 'renewal' | 'new'
const MUTED = '#4a5550'

/** The lowest net total of the engine run, and whether every line was priced. */
export function lowestOf(results: Result[] | null | undefined): { insurer: string; net: number; complete: boolean } | null {
  const rs = (results ?? []).filter(r => typeof r.total === 'number').slice().sort((a, b) => (a.subtotal ?? a.total) - (b.subtotal ?? b.total))
  const r = rs[0]
  return r ? { insurer: r.insurer_name, net: r.subtotal ?? r.total, complete: !(r.missing && r.missing > 0) } : null
}

const SOURCE_WORD: Record<string, string> = { email: 'Email', csv: 'File', hr_link: 'HR link', manual: 'By hand', wizard: 'By hand' }

export function EbRegister({ onNew, company, newHref }: { onNew?: () => void; company?: string | null; newHref?: string }) {
  const [rows, setRows] = useState<QuotationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/quote', { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(d)) { setError((d && d.error) || `Could not load the register (${res.status}).`); setRows([]); return }
      const all = d as QuotationRow[]
      const key = company ? companyKey(company) : ''
      setRows(key ? all.filter(r => companyKey(r.company_name) === key) : all)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the register.') }
    finally { setLoading(false) }
  }, [company])
  useEffect(() => { void load() }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const in90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
  const match = (r: QuotationRow, f: Filter) =>
    f === 'all' ? true
    : f === 'soon' ? !!r.effective_date && r.effective_date >= today && r.effective_date <= in90
    : f === 'renewal' ? r.basis === 'renewal'
    : r.basis !== 'renewal'
  const count = (f: Filter) => rows.filter(r => match(r, f)).length
  const shown = rows.filter(r => match(r, filter))
  const cols = company ? 8 : 9

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {company ? <h2 className="m-0 text-[16px] font-medium">Quotations</h2> : (
          <Segmented value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'soon', label: 'Starting within 90 days', count: count('soon') },
            { value: 'renewal', label: 'Renewals', count: count('renewal') },
            { value: 'new', label: 'New business', count: count('new') },
          ]} />
        )}
        {newHref
          ? <Link href={newHref} data-same-tab className="h-9 px-4 rounded-[7px] text-white text-[14px] font-medium inline-flex items-center gap-2 no-underline hover:opacity-90" style={{ background: '#132c1c' }}>+ New quotation</Link>
          : <button type="button" onClick={onNew} className="h-9 px-4 rounded-[7px] border-0 text-white text-[14px] font-medium inline-flex items-center gap-2 cursor-pointer hover:opacity-90" style={{ background: '#132c1c' }}>+ New quotation</button>}
      </div>
      {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      <Register label="Employment benefits quotations" minWidth={company ? 760 : 880}>
        <RegisterHead>
          {!company && <RegisterTh>Company</RegisterTh>}
          <RegisterTh align="right">Lives</RegisterTh>
          <RegisterTh>Start</RegisterTh>
          <RegisterTh>Basis</RegisterTh>
          <RegisterTh align="right">Premium, net</RegisterTh>
          <RegisterTh>Package · insurer</RegisterTh>
          <RegisterTh align="right">Categories</RegisterTh>
          <RegisterTh>Source</RegisterTh>
          <RegisterTh>Last change</RegisterTh>
        </RegisterHead>
        {loading && <RegisterEmpty colSpan={cols}>Loading…</RegisterEmpty>}
        {!loading && shown.length === 0 && <RegisterEmpty colSpan={cols}>{rows.length === 0 ? 'No quotation yet. + New quotation takes a census file.' : 'Nothing in this filter.'}</RegisterEmpty>}
        {!loading && shown.map(r => {
          const a = r.analysis && r.analysis.best_net != null ? r.analysis : null
          const low = a ? null : lowestOf(r.results)
          const cats = r.requirement?.categories?.length ?? 0
          const open = `/pricing-matrix/quote/${r.id}/compare`
          return (
            <RegisterRow key={r.id}>
              {!company && <RegisterCell><Link href={open} className="no-underline hover:underline" style={{ color: '#0f1412' }}>{r.company_name || 'Untitled'}</Link></RegisterCell>}
              <RegisterCell align="right" className="tabular-nums">{company ? <Link href={open} className="no-underline hover:underline" style={{ color: '#0f1412' }}>{r.member_count ?? 0}</Link> : r.member_count ?? 0}</RegisterCell>
              <RegisterCell>{r.effective_date ? fmtDate(r.effective_date) : '—'}</RegisterCell>
              <RegisterCell>{r.basis === 'renewal' ? 'Renewal' : r.basis ? 'New business' : '—'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">
                {a ? <Link href={open} className="no-underline hover:underline" style={{ color: '#0f1412' }}>{money(a.best_net!, { dp: 0 })}</Link>
                  : low ? <>{money(low.net, { dp: 0 })}{!low.complete ? <span title="Not every line was priced; no analysis yet" style={{ color: MUTED }}> *</span> : null}</> : '—'}
              </RegisterCell>
              <RegisterCell>{a ? `${a.package} · ${shortInsurer(a.best_insurer ?? '')}` : low ? <span style={{ color: MUTED }}>{shortInsurer(low.insurer)} · no analysis yet</span> : <span style={{ color: MUTED }}>Not priced</span>}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{cats || '—'}</RegisterCell>
              <RegisterCell>{SOURCE_WORD[r.source ?? ''] ?? (r.source ? r.source : '—')}</RegisterCell>
              <RegisterCell><span title={r.updated_at ?? r.created_at}>{timeAgo(r.updated_at ?? r.created_at)}</span></RegisterCell>
            </RegisterRow>
          )
        })}
      </Register>
      <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>Premium: the suggested package of the analysis at its best insurer, net of GST. * the lowest total of the engine run where no analysis has been run yet.</p>
    </div>
  )
}
