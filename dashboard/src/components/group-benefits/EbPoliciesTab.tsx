'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { Btn, Field, inputCls, Segmented } from '@/components/crm/primitives'
import { HrModal } from '@/components/group-benefits/hr/HrModal'
import { shortInsurer } from '@/lib/gb/insurer-names'
import type { PolicyLifecycle } from '@/lib/policies/types'
import type { EbPolicyRow } from '@/app/api/eb/policies/route'

const MUTED = '#4a5550'
const fmtDay = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const money = (n: number, ccy: string) => n.toLocaleString('en-SG', { style: 'currency', currency: ccy || 'SGD', maximumFractionDigits: 0 })

type Filter = 'all' | 'quoting' | 'bound' | 'ended'
const FILTER_OF: Record<PolicyLifecycle, Filter> = {
  quoting: 'quoting', presented: 'quoting', bound: 'bound', live: 'bound', renewal_due: 'bound', lapsed: 'ended', declined: 'ended', closed: 'ended',
}

/**
 * The Quotes tab on Employment Benefits: every EB policy across companies, from first ask to
 * live. A row opens the company's Members tab, where the list is uploaded or requested and
 * the prices sit. "New quotation" opens a placement for a company; "By hand" is the old wizard.
 */
export function EbPoliciesTab({ onByHand }: { onByHand: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<EbPolicyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [dialog, setDialog] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/eb/policies', { cache: 'no-store' })
      const d = await res.json().catch(() => ({})) as { policies?: EbPolicyRow[]; error?: string }
      if (!res.ok) { setError(d.error ?? `Could not load policies (${res.status}).`); setRows([]); return }
      setRows(Array.isArray(d.policies) ? d.policies : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load policies.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const count = (f: Filter) => rows.filter(r => f === 'all' || FILTER_OF[r.lifecycle] === f).length
  const shown = rows.filter(r => filter === 'all' || FILTER_OF[r.lifecycle] === filter)
  const href = (r: EbPolicyRow) => r.company_id ? `/companies/${r.company_id}?tab=members` : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: rows.length },
          { value: 'quoting', label: 'Quoting', count: count('quoting') },
          { value: 'bound', label: 'Bound and live', count: count('bound') },
          { value: 'ended', label: 'Ended', count: count('ended') },
        ]} />
        <div className="flex items-center gap-2">
          <Btn level="tertiary" onClick={onByHand}>By hand</Btn>
          <Btn level="primary" onClick={() => setDialog(true)}>New quotation</Btn>
        </div>
      </div>
      {error && <p className="m-0 text-[13.5px]" style={{ color: '#a1242f' }}>{error}</p>}
      {loading ? <p className="m-0 py-10 text-center text-[15px]" style={{ color: MUTED }}>Loading…</p> : (
        <Register label="Employment benefits policies" minWidth={960}>
          <RegisterHead>
            <RegisterTh first width={260}>Company</RegisterTh>
            <RegisterTh>Line</RegisterTh>
            <RegisterTh>Status</RegisterTh>
            <RegisterTh>Insurer</RegisterTh>
            <RegisterTh align="right">Premium</RegisterTh>
            <RegisterTh align="right">Members</RegisterTh>
            <RegisterTh last align="right">Updated</RegisterTh>
          </RegisterHead>
          <tbody>
            {shown.length === 0 && <RegisterEmpty colSpan={7}>{rows.length === 0 ? 'No employment benefits policies yet.' : 'None.'}</RegisterEmpty>}
            {shown.map(r => {
              const h = href(r)
              return (
                <RegisterRow key={r.id} onClick={h ? () => router.push(h) : undefined}>
                  <RegisterCell first identityWidth={240} primary={h
                    ? <Link href={h} onClick={e => e.stopPropagation()} className="no-underline hover:underline" style={{ color: '#0f1412' }}>{r.company_name}</Link>
                    : r.company_name} secondary={r.start_date ? `starts ${fmtDay(r.start_date)}` : undefined} />
                  <RegisterCell><span className="text-[14px]" style={{ color: '#0f1412' }}>{r.label}</span></RegisterCell>
                  <RegisterCell><span className="text-[14px]" style={{ color: '#2a332f' }}>{r.lifecycle_label}</span></RegisterCell>
                  <RegisterCell><span className="text-[14px]" style={{ color: r.insurer ? '#0f1412' : '#8c958f' }}>{r.insurer ? shortInsurer(r.insurer) : '—'}</span></RegisterCell>
                  <RegisterCell align="right">
                    {r.premium != null
                      ? <span className="text-[14px] tabular-nums" style={{ color: '#0f1412' }}>{money(r.premium, r.currency)}</span>
                      : <span className="text-[13px] tabular-nums" style={{ color: r.engine_quotes + r.insurer_quotes ? '#2a332f' : '#8c958f' }}>{r.engine_quotes + r.insurer_quotes ? `${r.engine_quotes + r.insurer_quotes} priced` : '—'}</span>}
                  </RegisterCell>
                  <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: r.members_active != null ? '#0f1412' : '#8c958f' }}>{r.members_active ?? '—'}</span></RegisterCell>
                  <RegisterCell last align="right"><span className="text-[14px] tabular-nums" style={{ color: MUTED }}>{fmtDay(r.updated_at)}</span></RegisterCell>
                </RegisterRow>
              )
            })}
          </tbody>
        </Register>
      )}
      <NewQuotationDialog open={dialog} onClose={() => setDialog(false)} />
    </div>
  )
}

type CompanyHit = { id: string; name: string; domain?: string | null }

/** Pick the company; a placement with one employment-benefits line opens and the Members tab follows. */
function NewQuotationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [company, setCompany] = useState<CompanyHit | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CompanyHit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (open) { setCompany(null); setQuery(''); setHits([]); setBusy(false); setError(null) } }, [open])

  function search(q: string) {
    setQuery(q); setCompany(null)
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (!term) { setHits([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies?search=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const rows = res.ok ? await res.json() as CompanyHit[] : []
        setHits(Array.isArray(rows) ? rows.slice(0, 8) : [])
      } catch { setHits([]) }
    }, 180)
  }

  async function create() {
    if (!company) { setError('Pick a company.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/placements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id, lines: [{ product_line: 'employee_benefits', label: 'Employment benefits' }], dispatch: false }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setError(d.error ?? `Could not open the quotation (${res.status}).`); return }
      onClose()
      router.push(`/companies/${company.id}?tab=members`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the quotation.')
    } finally { setBusy(false) }
  }

  return (
    <HrModal open={open} onClose={onClose} title="New quotation" width={520}>
      <div className="flex flex-col gap-4">
        <Field label="Company" hint={company ? 'Matched to a company record.' : undefined}>
          <span className="relative block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#6f7a74' }} />
            <input value={company ? company.name : query} onChange={e => search(e.target.value)} className={`${inputCls} pl-9`} placeholder="Company name" autoComplete="off" aria-label="Company" />
          </span>
          {!company && hits.length > 0 && (
            <ul className="m-0 mt-1 list-none p-1 rounded-[10px] border border-[#d5d9d4] bg-white max-h-56 overflow-y-auto">
              {hits.map(h => (
                <li key={h.id}>
                  <button type="button" onClick={() => { setCompany(h); setHits([]) }} className="w-full text-left bg-transparent border-0 px-3 py-2 rounded-[8px] cursor-pointer hover:bg-[#f1f2ee] text-[14px]" style={{ color: '#0f1412' }}>
                    {h.name}{h.domain ? <span className="ml-2 text-[12.5px]" style={{ color: MUTED }}>{h.domain}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>One line, Employment benefits. Employee list and pricing follow on the company's Members tab.</p>
        {error && <p className="m-0 text-[12.5px]" style={{ color: '#a1242f' }}>{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Btn type="button" level="tertiary" onClick={onClose}>Cancel</Btn>
          <Btn type="button" level="primary" onClick={create} loading={busy} disabled={!company}>Open quotation</Btn>
        </div>
      </div>
    </HrModal>
  )
}
