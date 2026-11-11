'use client'

/**
 * The EB register: every saved quotation, one row each, newest first. The page a broker opens to
 * see what has been priced and to start a new one (+ New EB takes a census file). A row opens the
 * quotation. Filters: all, starting within 90 days, sent to client (a client draft exists is not
 * known here; "with options" means the pricing estimate was run).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Segmented } from '@/components/crm/primitives'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { fmtDate, money, timeAgo } from '@/lib/format'

type Result = { insurer_name: string; total: number; missing?: number; subtotal?: number }
export type QuotationRow = {
  id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number | null
  source: string | null; created_at: string; updated_at?: string | null; results: Result[] | null
  requirement?: { categories?: { name: string }[] } | null
}

type Filter = 'all' | 'soon' | 'renewal' | 'new'
const MUTED = '#4a5550'

/** The lowest complete total; failing that the lowest total, marked. */
export function bestOf(results: Result[] | null | undefined): { insurer: string; total: number; complete: boolean } | null {
  const rs = (results ?? []).filter(r => typeof r.total === 'number')
  if (!rs.length) return null
  const complete = rs.filter(r => !(r.missing && r.missing > 0)).sort((a, b) => a.total - b.total)[0]
  const any = rs.slice().sort((a, b) => a.total - b.total)[0]
  const pick = complete ?? any
  return { insurer: pick.insurer_name, total: pick.subtotal ?? pick.total, complete: !!complete }
}

const SOURCE_WORD: Record<string, string> = { email: 'Email', csv: 'File', hr_link: 'HR link', manual: 'By hand', wizard: 'By hand' }

export function EbRegister({ onNew }: { onNew: () => void }) {
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
      setRows(d as QuotationRow[])
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the register.') }
    finally { setLoading(false) }
  }, [])
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: rows.length },
          { value: 'soon', label: 'Starting within 90 days', count: count('soon') },
          { value: 'renewal', label: 'Renewals', count: count('renewal') },
          { value: 'new', label: 'New business', count: count('new') },
        ]} />
        <button type="button" onClick={onNew} className="h-9 px-4 rounded-[7px] border-0 text-white text-[14px] font-medium inline-flex items-center gap-2 cursor-pointer hover:opacity-90" style={{ background: '#132c1c' }}>+ New EB</button>
      </div>
      {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }} role="alert">{error}</p>}
      <Register label="EB quotations" minWidth={880}>
        <RegisterHead>
          <RegisterTh>Company</RegisterTh>
          <RegisterTh align="right">Lives</RegisterTh>
          <RegisterTh>Start</RegisterTh>
          <RegisterTh>Basis</RegisterTh>
          <RegisterTh align="right">Best price, net</RegisterTh>
          <RegisterTh>Insurer</RegisterTh>
          <RegisterTh align="right">Categories</RegisterTh>
          <RegisterTh>Source</RegisterTh>
          <RegisterTh>Last change</RegisterTh>
        </RegisterHead>
        {loading && <RegisterEmpty colSpan={9}>Loading…</RegisterEmpty>}
        {!loading && shown.length === 0 && <RegisterEmpty colSpan={9}>{rows.length === 0 ? 'No quotation yet. + New EB takes a census file.' : 'Nothing in this filter.'}</RegisterEmpty>}
        {!loading && shown.map(r => {
          const best = bestOf(r.results)
          const cats = r.requirement?.categories?.length ?? 0
          return (
            <RegisterRow key={r.id}>
              <RegisterCell><Link href={`/pricing-matrix/quote/${r.id}`} className="no-underline hover:underline" style={{ color: '#0f1412' }}>{r.company_name || 'Untitled'}</Link></RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{r.member_count ?? 0}</RegisterCell>
              <RegisterCell>{r.effective_date ? fmtDate(r.effective_date) : '—'}</RegisterCell>
              <RegisterCell>{r.basis === 'renewal' ? 'Renewal' : r.basis ? 'New business' : '—'}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{best ? money(best.total, { dp: 0 }) : '—'}{best && !best.complete ? <span title="No insurer priced every line; the lowest total shown" style={{ color: MUTED }}> *</span> : null}</RegisterCell>
              <RegisterCell>{best ? shortInsurer(best.insurer) : <span style={{ color: MUTED }}>Not priced</span>}</RegisterCell>
              <RegisterCell align="right" className="tabular-nums">{cats || '—'}</RegisterCell>
              <RegisterCell>{SOURCE_WORD[r.source ?? ''] ?? (r.source ? r.source : '—')}</RegisterCell>
              <RegisterCell><span title={r.updated_at ?? r.created_at}>{timeAgo(r.updated_at ?? r.created_at)}</span></RegisterCell>
            </RegisterRow>
          )
        })}
      </Register>
      <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>* the lowest total where no insurer priced every line.</p>
    </div>
  )
}
