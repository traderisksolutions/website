'use client'

/**
 * New quote, the short way: a census file, the covers wanted, one button.
 *
 * The census needs a name and a date of birth per person; any other column is used when found.
 * Plans are chosen at every insurer by rule from what is set here (src/lib/gb/plan-rules.ts) —
 * no model, no credits. The result opens as a saved quotation with its comparison and value
 * score; the report is one click from there.
 */

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { describeSpec, withDefaults, type CoverSpec, type Hospital, type Tier } from '@/lib/gb/plan-rules'
import { parseBirthDate } from '@/lib/dates/dob'

type Member = { name: string; category: string; relationship: string; dob?: string | null; age?: number | null; occupation_class?: string | null }
type Read = { members: Member[]; unread: string[]; found: Record<string, string>; sheet: string | null; filename: string }

const COVERS: { code: string; kind: 'hospital' | 'sum' | 'tier' }[] = [
  { code: 'GHS', kind: 'hospital' }, { code: 'GTL', kind: 'sum' }, { code: 'GCI', kind: 'sum' },
  { code: 'GPA', kind: 'sum' }, { code: 'GOPC', kind: 'tier' }, { code: 'GOSC', kind: 'tier' },
  { code: 'GD', kind: 'tier' }, { code: 'GHS_FW', kind: 'hospital' },
]

const SUMS = [25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 500_000]

function nextMonthFirst(): string {
  const t = new Date(Date.now() + 8 * 3600_000)
  const y = t.getUTCMonth() === 11 ? t.getUTCFullYear() + 1 : t.getUTCFullYear()
  const m = (t.getUTCMonth() + 1) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

const fmtDob = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

export function QuickQuote({ initialCompany, onUseWizard }: { initialCompany?: string; onUseWizard: () => void }) {
  const router = useRouter()
  const [read, setRead] = useState<Read | null>(null)
  const [reading, setReading] = useState(false)
  const [company, setCompany] = useState(initialCompany ?? '')
  const [effDate, setEffDate] = useState(nextMonthFirst())
  const [basis, setBasis] = useState<'new_business' | 'renewal'>('new_business')
  const [specs, setSpecs] = useState<Record<string, CoverSpec>>({ GHS: withDefaults({ code: 'GHS' }) })
  const [pricing, setPricing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const members = read?.members ?? []
  const employees = members.filter(m => m.relationship === 'self').length
  const categories = useMemo(() => Array.from(new Set(members.map(m => m.category))), [members])

  async function upload(file: File) {
    setReading(true); setError(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/group-benefits/census/parse', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setRead(null); setError(d.error ?? 'Could not read that file'); return }
      setRead(d as Read)
    } finally { setReading(false) }
  }

  /** A date typed over an unread one, read day first like the file. */
  function fixDob(i: number, raw: string) {
    const d = parseBirthDate(raw)
    setRead(r => r && ({ ...r, members: r.members.map((m, j) => j !== i ? m
      : { ...m, dob: d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null }) }))
  }
  const unreadNow = members.filter(m => !m.dob && m.age == null).length

  const toggle = (code: string) => setSpecs(s => {
    const n = { ...s }
    if (n[code]) delete n[code]; else n[code] = withDefaults({ code })
    return n
  })
  const patch = (code: string, p: Partial<CoverSpec>) => setSpecs(s => ({ ...s, [code]: { ...s[code], ...p } }))

  async function price() {
    setPricing(true); setError(null)
    try {
      const res = await fetch('/api/group-benefits/quick-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ census: members, covers: Object.values(specs), company_name: company, effective_date: effDate, basis }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.quotation_id) { setError(d.error ?? 'Pricing failed'); return }
      router.push(`/pricing-matrix/quote/${d.quotation_id}`)
    } finally { setPricing(false) }
  }

  const label = 'text-[11px] font-semibold uppercase tracking-wide'
  const inp = 'w-full text-[13px] border border-[#dadce0] rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#202124]/15'
  const sel = 'text-[12.5px] border border-[#dadce0] rounded-md px-2 py-1 bg-white'
  const ready = members.length > 0 && Object.keys(specs).length > 0 && !!effDate

  return (
    <div className="flex flex-col gap-6 max-w-[880px]" style={{ color: '#202124' }}>
      {/* ── Census ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-[15px] font-medium inline-flex items-center">
            Census <Tip text="CSV or Excel. A name and a date of birth per person is enough; dates are read day first (05/07/1987 is 5 July). Relationship, category, work pass and occupation class are used when their columns are found. Dependants take the category of the employee above them." />
          </h3>
          <button onClick={onUseWizard} className="text-[12.5px] bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#5f6368' }}>
            Map plans by hand
          </button>
        </div>
        <label htmlFor="qq-file" className={cn('flex items-center justify-center gap-2 border border-dashed rounded-lg py-6 cursor-pointer text-[13px]',
          reading ? 'border-[#9aa0a6]' : 'border-[#dadce0] hover:border-[#9aa0a6]')} style={{ color: '#5f6368' }}>
          {reading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {reading ? 'Reading…' : read ? `${read.filename} · upload another` : 'Upload census (.csv, .xlsx)'}
          <input id="qq-file" type="file" accept=".csv,.txt,.xlsx,.xls,.xlsm,text/csv" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
        </label>
        {read && (
          <div className="border border-[#e8eaed] rounded-lg overflow-hidden">
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-b border-[#e8eaed] bg-[#f8f9fa] text-[12px] tabular-nums" style={{ color: '#5f6368' }}>
              <span>{members.length} members · {employees} employees · {members.length - employees} dependants</span>
              <span>{categories.length} categor{categories.length === 1 ? 'y' : 'ies'}: {categories.join(', ')}</span>
              <span>Read from: {Object.entries(read.found).map(([k, v]) => `${k} = "${v}"`).join(', ')}{read.sheet ? ` · sheet ${read.sheet}` : ''}</span>
            </div>
            {unreadNow > 0 && (
              <div className="px-3 py-2 border-b border-[#e8eaed] text-[12px]" style={{ color: '#b06000' }}>
                {unreadNow} {unreadNow === 1 ? 'person has' : 'people have'} no readable date of birth or age and will not be priced. Type the date in the row (DD/MM/YYYY). As read: {read.unread.slice(0, 5).join('; ')}{read.unread.length > 5 ? '…' : ''}
              </div>
            )}
            <div className="relative overflow-x-auto max-h-[260px] overflow-y-auto">
              <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: 520 }}>
                <thead className="sticky top-0 bg-white">
                  <tr style={{ color: '#5f6368' }}>
                    {['Name', 'Relationship', 'Category', 'Date of birth', 'Age'].map(h =>
                      <th key={h} className={cn(label, 'text-left px-3 py-1.5 border-b border-[#e8eaed]')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={i} className="border-b border-[#f1f3f4]">
                      <td className="px-3 py-1.5">{m.name}</td>
                      <td className="px-3 py-1.5 capitalize" style={{ color: '#3c4043' }}>{m.relationship}</td>
                      <td className="px-3 py-1.5" style={{ color: '#3c4043' }}>{m.category}</td>
                      <td className="px-3 py-1 tabular-nums" style={{ color: '#3c4043' }}>
                        {m.dob || m.age != null ? fmtDob(m.dob) : (
                          <input aria-label={`Date of birth for ${m.name}`} placeholder="DD/MM/YYYY" onBlur={e => fixDob(i, e.target.value)}
                                 onKeyDown={e => { if (e.key === 'Enter') fixDob(i, (e.target as HTMLInputElement).value) }}
                                 className="w-[110px] px-1.5 py-0.5 text-[12.5px] border border-[#b06000] rounded" />
                        )}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums" style={{ color: '#3c4043' }}>{m.age ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Covers ── */}
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[15px] font-medium inline-flex items-center">
          Covers <Tip text="Each insurer is priced on its tier matching these facts. Where several tiers match, the lowest-cost one is used. Where none matches exactly, the closest is used and the quotation's notes say so." />
        </h3>
        <div className="border border-[#e8eaed] rounded-lg divide-y divide-[#f1f3f4]">
          {COVERS.map(c => {
            const on = !!specs[c.code]
            const s = specs[c.code]
            return (
              <div key={c.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                <label htmlFor={`cv-${c.code}`} className="flex items-center gap-2 min-w-[220px] text-[13px] cursor-pointer">
                  <input id={`cv-${c.code}`} type="checkbox" checked={on} onChange={() => toggle(c.code)} className="accent-[#202124]" />
                  <span className={on ? 'font-medium' : ''}>{PRODUCT_BY_CODE[c.code].name}</span>
                </label>
                {on && c.kind === 'hospital' && c.code !== 'GHS_FW' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Hospital type" className={sel} value={s.hospital ?? ''} onChange={e => patch(c.code, { hospital: (e.target.value || null) as Hospital | null })}>
                      <option value="private">Private hospital</option>
                      <option value="government">Government restructured</option>
                    </select>
                    <select aria-label="Ward" className={sel} value={s.ward ?? ''} onChange={e => patch(c.code, { ward: Number(e.target.value) || null })}>
                      <option value="1">1-bed ward</option><option value="2">2-bed ward</option><option value="4">4-bed ward</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#3c4043' }}>
                      <input type="checkbox" checked={!!s.coPay} onChange={e => patch(c.code, { coPay: e.target.checked })} className="accent-[#202124]" /> Co-payment
                    </label>
                  </div>
                )}
                {on && c.code === 'GHS_FW' && (
                  <span className="text-[12.5px]" style={{ color: '#5f6368' }}>
                    {categories.some(x => /work\s*permit|\bwp\b|s[\s-]*pass|foreign|\bfw\b/i.test(x))
                      ? 'Priced for the work-permit and S Pass categories; GHS for everyone else.'
                      : 'No work-permit or S Pass category in the census; will not be priced.'}
                  </span>
                )}
                {on && c.kind === 'sum' && (
                  <select aria-label="Sum assured" className={sel} value={s.sumAssured ?? ''}
                          onChange={e => patch(c.code, e.target.value ? { sumAssured: Number(e.target.value), tier: null } : { sumAssured: null, tier: 'entry' })}>
                    <option value="">Lowest offered</option>
                    {SUMS.map(n => <option key={n} value={n}>S${n.toLocaleString('en-SG')}</option>)}
                  </select>
                )}
                {on && c.kind === 'tier' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Tier" className={sel} value={s.tier ?? 'entry'} onChange={e => patch(c.code, { tier: e.target.value as Tier })}>
                      <option value="entry">Entry tier</option><option value="top">Top tier</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-[12.5px]" style={{ color: '#3c4043' }}>
                      <input type="checkbox" checked={!!s.coPay} onChange={e => patch(c.code, { coPay: e.target.checked })} className="accent-[#202124]" /> Co-payment
                    </label>
                  </div>
                )}
                {on && <span className="text-[12px] ml-auto" style={{ color: '#9aa0a6' }}>{describeSpec(withDefaults(s))}</span>}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Policy ── */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <label htmlFor="qq-company" className="flex flex-col gap-1 text-[12px]" style={{ color: '#5f6368' }}>
          Company
          <input id="qq-company" value={company} onChange={e => setCompany(e.target.value)} className={inp} placeholder="Acme Pte Ltd" />
        </label>
        <label htmlFor="qq-eff" className="flex flex-col gap-1 text-[12px]" style={{ color: '#5f6368' }}>
          Policy start
          <input id="qq-eff" type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className={inp} />
        </label>
        <div className="flex flex-col gap-1 text-[12px]" style={{ color: '#5f6368' }}>
          Basis
          <div role="radiogroup" aria-label="Basis" className="inline-flex rounded-md border border-[#dadce0] overflow-hidden w-fit">
            {(['new_business', 'renewal'] as const).map(b => (
              <button key={b} role="radio" aria-checked={basis === b} onClick={() => setBasis(b)}
                      className={cn('px-3 py-1.5 text-[12.5px] font-medium', basis === b ? 'bg-[#202124] text-white' : 'text-[#5f6368] hover:bg-[#f8f9fa]')}>
                {b === 'new_business' ? 'New business' : 'Renewal'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={price} disabled={!ready || pricing}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-[#202124] text-white hover:opacity-90 disabled:opacity-40">
          {pricing && <Loader2 size={14} className="animate-spin" />}
          {pricing ? 'Pricing…' : 'Price at every insurer'}
        </button>
        {!members.length && <span className="text-[12.5px]" style={{ color: '#9aa0a6' }}>Upload a census first</span>}
        {error && <span className="text-[12.5px]" style={{ color: '#c5221f' }}>{error}</span>}
      </div>
    </div>
  )
}
