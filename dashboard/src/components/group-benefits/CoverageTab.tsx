'use client'

/**
 * Coverage: every cover and benefit line, against every insurer.
 *
 * A tick where the insurer offers the cover (or prints the benefit line), with the insurer's own
 * wording beneath; a blank where it does not. The first column is the name TRS uses — editable,
 * so the client can settle one name for each cover and benefit line across the system. A blank
 * TRS name shows the canonical one.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { Segmented } from '@/components/crm/primitives'

type Insurer = { tableId: string; name: string | null; planYear: number | null; verification: 'calculator' | 'brochure' | 'unverified' }
type ProductRow = { code: string; canonName: string; abbrev: string; cells: Record<string, { labels: string[]; plans: number } | null> }
type BenefitRow = { code: string; productCode: string; canonName: string; headline: boolean; cells: Record<string, { printed: string[]; plans: number } | null> }
type Payload = { insurers: Insurer[]; products: ProductRow[]; benefits: BenefitRow[]; names: Record<string, string>; error?: string }

const INK = '#202124', MUTED = '#5f6368', FAINT = '#9aa0a6', RULE = '#e8eaed'

function Tick({ on }: { on: boolean }) {
  return (
    <span aria-label={on ? 'Offered' : 'Not offered'} role="img"
          className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] flex-shrink-0"
          style={on ? { background: INK, color: '#fff' } : { border: `1px solid #dadce0` }}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  )
}

export function CoverageTab() {
  const [d, setD] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<'covers' | 'lines'>('covers')
  const [product, setProduct] = useState<string>('GHS')
  const [gapsOnly, setGapsOnly] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/group-benefits/coverage', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: Payload) => { if (j.error) setErr(j.error); else { setD(j); setNames(j.names ?? {}); setSaved(j.names ?? {}) } })
      .catch(e => setErr(String(e)))
  }, [])

  const dirty = JSON.stringify(names) !== JSON.stringify(saved)
  async function save() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/group-benefits/coverage', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names }) })
      const j = await res.json()
      if (!res.ok) setErr(j.error ?? 'Not saved'); else { setNames(j.names); setSaved(j.names) }
    } finally { setSaving(false) }
  }

  const lines = useMemo(() => {
    if (!d) return []
    return d.benefits.filter(b => b.productCode === product)
      .filter(b => !gapsOnly || d.insurers.some(i => !b.cells[i.tableId]))
  }, [d, product, gapsOnly])

  if (err) return <p className="text-[13px]" style={{ color: '#c5221f' }}>{err}</p>
  if (!d) return <div className="py-10"><Loader2 className="animate-spin" size={18} style={{ color: MUTED }} /></div>

  const offered = (p: ProductRow) => d.insurers.filter(i => p.cells[i.tableId]).length
  const productsShown = d.products.filter(p => offered(p) > 0 || view === 'covers')
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap'
  const nameInput = (code: string, canon: string) => (
    <input aria-label={`TRS name for ${canon}`} value={names[code] ?? ''} placeholder={canon}
           onChange={e => setNames(n => ({ ...n, [code]: e.target.value }))}
           className="w-full min-w-[180px] px-2 py-1 text-[13px] border border-transparent hover:border-[#dadce0] focus:border-[#202124] rounded-md bg-transparent focus:outline-none placeholder:text-[#3c4043]" />
  )

  const everyLine = d.benefits.filter(b => b.productCode === product)
  const printedByAll = everyLine.filter(b => d.insurers.every(i => b.cells[i.tableId])).length

  return (
    <div className="flex flex-col gap-4" style={{ color: INK }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={view} onChange={v => setView(v)} options={[{ value: 'covers', label: 'Covers' }, { value: 'lines', label: 'Benefit lines' }]} />
          <Tip text="A tick means the insurer's current rate table prices the cover, or its schedule prints the benefit line. The wording under each tick is the insurer's own. Type TRS's name in the first column to standardise it; a blank keeps the canonical name." />
        </div>
        <button onClick={save} disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90 disabled:opacity-40">
          {saving && <Loader2 size={13} className="animate-spin" />}{saving ? 'Saving…' : dirty ? 'Save names' : 'Names saved'}
        </button>
      </div>

      {view === 'lines' && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="cov-product" className="text-[12.5px]" style={{ color: MUTED }}>Cover</label>
          <select id="cov-product" value={product} onChange={e => setProduct(e.target.value)}
                  className="text-[13px] border border-[#dadce0] rounded-md px-2 py-1 bg-white">
            {d.products.map(p => <option key={p.code} value={p.code}>{names[p.code] || p.canonName}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] cursor-pointer" style={{ color: MUTED }}>
            <input type="checkbox" checked={gapsOnly} onChange={e => setGapsOnly(e.target.checked)} className="accent-[#202124]" />
            Only lines missing at one or more insurers
          </label>
        </div>
      )}

      <div className="relative overflow-x-auto border rounded-lg" style={{ borderColor: RULE }}>
        <table className="w-full border-collapse" style={{ minWidth: 320 + d.insurers.length * 170 }}>
          <thead>
            <tr className="bg-[#f8f9fa]" style={{ color: MUTED }}>
              <th className={cn(th, 'sticky left-0 bg-[#f8f9fa] z-10 min-w-[240px]')}>{view === 'covers' ? 'Cover' : 'Benefit line'} · TRS name</th>
              {d.insurers.map(i => (
                <th key={i.tableId} className={cn(th, 'border-l')} style={{ borderColor: RULE }}>
                  <div className="normal-case tracking-normal text-[12.5px]" style={{ color: INK }}>{i.name}</div>
                  <div className="normal-case tracking-normal font-normal">{i.planYear ?? ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view === 'covers' && productsShown.map(p => (
              <tr key={p.code} className="border-t" style={{ borderColor: RULE }}>
                <td className="px-3 py-2 align-top sticky left-0 bg-white z-10">
                  <div className="text-[11px] font-semibold tracking-wide" style={{ color: FAINT }}>{p.abbrev}</div>
                  {nameInput(p.code, p.canonName)}
                </td>
                {d.insurers.map(i => {
                  const c = p.cells[i.tableId]
                  return (
                    <td key={i.tableId} className="px-3 py-2 align-top border-l" style={{ borderColor: RULE }}>
                      <div className="flex items-start gap-2">
                        <Tick on={!!c} />
                        {c && (
                          <div className="min-w-0">
                            <div className="text-[12.5px] break-words" style={{ color: '#3c4043' }}>{c.labels.join(' · ')}</div>
                            <div className="text-[11.5px] tabular-nums" style={{ color: FAINT }}>{c.plans} plan{c.plans === 1 ? '' : 's'}</div>
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {view === 'lines' && lines.map(b => (
              <tr key={b.code} className="border-t" style={{ borderColor: RULE }}>
                <td className="px-3 py-2 align-top sticky left-0 bg-white z-10">{nameInput(b.code, b.canonName)}</td>
                {d.insurers.map(i => {
                  const c = b.cells[i.tableId]
                  return (
                    <td key={i.tableId} className="px-3 py-2 align-top border-l" style={{ borderColor: RULE }}>
                      <div className="flex items-start gap-2">
                        <Tick on={!!c} />
                        {c && <div className="text-[12px] break-words min-w-0" style={{ color: '#3c4043' }} title={c.printed.join('\n')}>{c.printed[0]}{c.printed.length > 1 ? ` +${c.printed.length - 1}` : ''}</div>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-[12px] tabular-nums" style={{ color: MUTED }}>
        {view === 'covers'
          ? `${d.products.filter(p => offered(p) === d.insurers.length).length} of ${d.products.length} covers offered by all ${d.insurers.length} insurers`
          : `${printedByAll} of ${everyLine.length} lines printed by all ${d.insurers.length} insurers${gapsOnly ? ` · showing ${lines.length} with a gap` : ''}`}
      </p>
    </div>
  )
}
