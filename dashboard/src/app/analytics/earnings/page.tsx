'use client'

/**
 * Earnings — what TRS earns, from whom, and through which insurer.
 *
 * The figure is in the header line, not in tiles. Every chart is drawn from the debit-note
 * register through src/lib/analytics/earnings.ts; the rules (credit notes, lifetime value, VIP)
 * are stated there and behind the (?) on this page. Data gaps are counted in the footer.
 */

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { Segmented, SectionCard, Spinner } from '@/components/crm/primitives'
import { Tip } from '@/components/Tip'
import {
  applyFilter, totals, monthly, clients, groupBy, renewalsDue, VIP_SHARE, type Note, type Basis, type ClientRow,
} from '@/lib/analytics/earnings'
import { displayName } from '@/lib/insurers'

const INK = '#202124', MUTED = '#5f6368', FAINT = '#80868b', RULE = '#e8eaed', LIGHT = '#bdc1c6'

type Range = '12m' | 'ytd' | 'all' | 'custom'
type SortKey = 'lifetimeValue' | 'periodValue' | 'lifetimeCommission' | 'lifetimePremium' | 'tenureMonths' | 'lastIssue' | 'name'

const money = (n: number) => `S$${Math.round(n).toLocaleString('en-SG')}`
const short = (n: number) => Math.abs(n) >= 1e6 ? `S$${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e3 ? `S$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `S$${Math.round(n)}`
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-SG', { month: 'short', year: '2-digit' })
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`

function todayIso() { return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10) }
function rangeDates(r: Range, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const t = todayIso()
  if (r === 'all') return { from: null, to: null }
  if (r === 'ytd') return { from: `${t.slice(0, 4)}-01-01`, to: t }
  if (r === '12m') { const d = new Date(`${t}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 11); return { from: `${d.toISOString().slice(0, 7)}-01`, to: t } }
  return { from: custom.from || null, to: custom.to || null }
}

const SELECT = 'h-10 rounded-[12px] border-0 px-3.5 pr-8 text-[13.5px] max-w-[240px] cursor-pointer bg-[#f1f3f4] text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#202124]/15'
const tooltipStyle = { fontSize: 12, borderRadius: 10, border: '1px solid #dadce0', boxShadow: 'none', color: INK }
const th = 'text-left text-[11px] uppercase tracking-[0.04em] font-medium pb-2 pr-3 whitespace-nowrap'
const td = 'py-2.5 pr-3 text-[13px] align-top'
const num = 'py-2.5 pr-3 text-[13px] text-right tabular-nums align-top whitespace-nowrap'

export default function EarningsPage() {
  const [data, setData] = useState<{ notes: Note[]; undated: number; paidRecorded: number; companiesOnFile: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('12m')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [basis, setBasis] = useState<Basis>('commission')
  const [insurer, setInsurer] = useState('')
  const [who, setWho] = useState<'all' | 'vip'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lifetimeValue', desc: true })
  const [rSort, setRSort] = useState<{ key: 'client' | 'premium' | 'end' | 'daysLeft'; desc: boolean }>({ key: 'daysLeft', desc: false })

  useEffect(() => {
    fetch('/api/analytics/earnings', { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (j.error) setErr(j.error); else setData(j) })
      .catch(e => setErr(String(e)))
  }, [])

  const v = useMemo(() => {
    if (!data) return null
    const { from, to } = rangeDates(range, custom)
    const f = { from, to, insurer: insurer || null, className: null }
    const inPeriod = applyFilter(data.notes, f)
    const lifetime = applyFilter(data.notes, f, { ignoreDates: true })
    const t = totals(inPeriod)
    const rows = clients(inPeriod, lifetime, basis)
    const vip = rows.filter(r => r.vip)
    const dates = inPeriod.map(n => n.issueDate).sort()
    return {
      f, t, rows, vip,
      months: monthly(inPeriod, basis, from, to),
      renewals: renewalsDue(applyFilter(data.notes, { ...f, from: null, to: null }), todayIso()),
      byInsurer: groupBy(inPeriod, n => n.insurer),
      byClass: groupBy(inPeriod, n => n.className ?? 'Class not on file'),
      span: dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}` : 'no notes in range',
      insurers: Array.from(new Set(data.notes.map(n => n.insurer))).sort(),
      classes: Array.from(new Set(data.notes.map(n => n.className).filter((c): c is string => !!c))).sort(),
      foreign: data.notes.filter(n => n.currency !== 'SGD').length,
      noCommissionAll: data.notes.filter(n => n.commission == null && n.currency === 'SGD').length,
      clientsWithNotes: new Set(data.notes.map(n => n.companyId).filter(Boolean)).size,
    }
  }, [data, range, custom, basis, insurer])

  const table = useMemo(() => {
    if (!v) return []
    const needle = q.trim().toLowerCase()
    const xs = v.rows.filter(r => (who === 'all' || r.vip) && (!needle || r.name.toLowerCase().includes(needle)))
    const dir = sort.desc ? -1 : 1
    return [...xs].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key]
      return (typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)) * dir
    })
  }, [v, who, q, sort])

  const renewals = useMemo(() => {
    if (!v) return []
    const dir = rSort.desc ? -1 : 1
    return [...v.renewals].sort((a, b) => {
      const x = rSort.key === 'client' ? displayName(a.client).localeCompare(displayName(b.client)) : rSort.key === 'end' ? a.end.localeCompare(b.end) : (a[rSort.key] as number) - (b[rSort.key] as number)
      return x * dir
    })
  }, [v, rSort])
  const rTh = (key: 'client' | 'premium' | 'end' | 'daysLeft', label: string, right = true) => (
    <th className={`${th} ${right ? 'text-right' : ''}`} aria-sort={rSort.key === key ? (rSort.desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => setRSort(s => ({ key, desc: s.key === key ? !s.desc : key === 'premium' }))}
              className="bg-transparent border-0 p-0 cursor-pointer uppercase tracking-[0.04em] font-medium" style={{ color: rSort.key === key ? INK : FAINT }}>
        {label}{rSort.key === key ? (rSort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  const basisWord = basis === 'commission' ? 'commission' : 'premium'
  const sortTh = (key: SortKey, label: string, right = true) => (
    <th className={`${th} ${right ? 'text-right' : ''}`}>
      <button onClick={() => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))}
              className="bg-transparent border-0 p-0 cursor-pointer uppercase tracking-[0.04em] font-medium" style={{ color: sort.key === key ? INK : FAINT }}>
        {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 sm:py-10">

        <header className="flex flex-wrap items-end justify-between gap-4 pb-5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div className="min-w-0">
            <h1 className="text-[22px] font-medium tracking-[-0.01em] inline-flex items-center" style={{ color: INK }}>
              Earnings
              <Tip text={`Income is the commission on each debit note. A credit note (numbered CN, a negative premium, or a cancellation or refund) is subtracted. Premium is what clients paid insurers through TRS. Lifetime value is a client's total across every note on record, whatever the dates chosen. VIP clients are the fewest clients who together make up ${pct(VIP_SHARE)} of lifetime ${basisWord}.`} />
            </h1>
            <p className="mt-1.5 text-[14px] tabular-nums" style={{ color: MUTED }}>
              {!v ? 'Reading the register…' : (
                <>
                  <span className="font-medium" style={{ color: INK }}>{money(v.t.netCommission)}</span> net commission
                  <span className="mx-1.5">·</span>{money(v.t.netPremium)} premium
                  <span className="mx-1.5">·</span>{v.t.clients} clients
                  <span className="mx-1.5">·</span>{v.t.debitNotes} debit notes
                  <span className="mx-1.5">·</span>{v.t.creditNotes} credit notes
                  <span className="mx-1.5">·</span>{v.span}
                </>
              )}
            </p>
          </div>
        </header>

        {/* One row of controls, one height: the range, what is measured, and two filters. */}
        <div className="flex flex-wrap items-center gap-2 pt-5">
          <Segmented value={range} onChange={r => setRange(r)} options={[
            { value: '12m', label: '12 months' }, { value: 'ytd', label: 'This year' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom' }]} />
          <Segmented value={basis} onChange={b => setBasis(b)} options={[{ value: 'commission', label: 'Commission' }, { value: 'premium', label: 'Premium' }]} />
          <select aria-label="Insurer" value={insurer} onChange={e => setInsurer(e.target.value)} className={SELECT}>
            <option value="">All insurers</option>
            {v?.insurers.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input aria-label="From" type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className={SELECT} />
              <span className="text-[13px]" style={{ color: MUTED }}>to</span>
              <input aria-label="To" type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className={SELECT} />
            </div>
          )}
        </div>

        {err && <p className="mt-5 text-[13px]" style={{ color: '#c5221f' }}>{err}</p>}
        {!v && !err && <div className="py-16"><Spinner label="Loading earnings" /></div>}

        {v && (
          <div className="mt-6 space-y-6">
            <SectionCard title={`${basis === 'commission' ? 'Commission' : 'Premium'} by month`}
                         actions={<span className="text-[12px] tabular-nums" style={{ color: MUTED }}>Credit notes below the line</span>}>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={v.months} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} stackOffset="sign">
                    <CartesianGrid vertical={false} stroke={RULE} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: FAINT }} axisLine={{ stroke: RULE }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: FAINT }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={l => monthLabel(String(l))}
                             formatter={(val, name) => [money(Number(val) || 0), name === 'earned' ? 'Debit notes' : 'Credit notes']} />
                    <ReferenceLine y={0} stroke={LIGHT} />
                    <Bar dataKey="earned" stackId="s" fill={INK} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="credited" stackId="s" fill={LIGHT} radius={[0, 0, 2, 2]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <div className="grid gap-x-10 lg:grid-cols-2">
              {/* A ranked list, not a chart: client names are long and a bar axis cut them to
                  three wrapped lines each. */}
              <div className="min-w-0"><SectionCard title={`Top 10 clients by lifetime ${basisWord}`}
                           actions={<Link href="#clients" className="text-[13px] hover:underline" style={{ color: MUTED }}>All clients</Link>}>
                <ol className="m-0 p-0 list-none flex flex-col">
                  {v.rows.slice(0, 10).map(r => {
                    const max = Math.max(1, v.rows[0]?.lifetimeValue ?? 1)
                    return (
                      <li key={r.key} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 py-2" style={{ borderBottom: '1px solid #f1f3f4' }}>
                        <span className="text-[12px] tabular-nums text-right" style={{ color: FAINT }}>{r.rank}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.companyId
                              ? <Link href={`/companies/${r.companyId}`} className="truncate text-[13.5px] hover:underline" style={{ color: INK }} title={r.name}>{displayName(r.name)}</Link>
                              : <span className="truncate text-[13.5px]" title={r.name}>{displayName(r.name)}</span>}
                            {r.vip && <span className="flex-shrink-0 text-[10px] font-semibold tracking-wide px-1.5 rounded" style={{ border: `1px solid ${INK}`, color: INK }}>VIP</span>}
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full" style={{ background: '#f1f3f4' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (r.lifetimeValue / max) * 100)}%`, background: INK }} />
                          </div>
                        </div>
                        <span className="text-[13.5px] tabular-nums font-medium">{money(r.lifetimeValue)}</span>
                      </li>
                    )
                  })}
                </ol>
              </SectionCard></div>

              {/* What to act on: income that has to be renewed. Replaces a concentration curve
                  that restated the client table. */}
              <div className="min-w-0"><SectionCard title="Renewals due, next 90 days"
                           actions={<span className="text-[13px] tabular-nums" style={{ color: MUTED }}>{v.renewals.length} policies · {money(v.renewals.reduce((a, x) => a + x.premium, 0))} premium</span>}>
                {v.renewals.length === 0 ? (
                  <p className="m-0 py-6 text-[13.5px]" style={{ color: MUTED }}>No policy on file ends in the next 90 days.</p>
                ) : (
                  <div className="overflow-auto max-h-[480px]">
                    <table className="w-full min-w-[440px]">
                      <thead className="sticky top-0 bg-white">
                        <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                          {rTh('client', 'Company', false)}
                          {rTh('premium', 'Premium')}
                          {rTh('end', 'Ends')}
                          {rTh('daysLeft', 'Days left')}
                        </tr>
                      </thead>
                      <tbody>
                        {renewals.map(x => (
                          <tr key={x.policyId} style={{ borderBottom: '1px solid #f1f3f4' }}>
                            <td className={`${td} max-w-[260px]`}>
                              {x.companyId
                                ? <Link href={`/companies/${x.companyId}`} className="block truncate hover:underline" style={{ color: INK }} title={`${x.client} · ${x.className ?? ''} · ${x.insurer}`}>{displayName(x.client)}</Link>
                                : <span className="block truncate" title={x.client}>{displayName(x.client)}</span>}
                            </td>
                            <td className={num}>{money(x.premium)}</td>
                            <td className={num}>{dateLabel(x.end)}</td>
                            <td className={`${num} font-medium`} style={{ color: x.daysLeft < 0 ? INK : MUTED }}>{x.daysLeft}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard></div>
            </div>

            <div id="clients" />
            <SectionCard title="Clients" actions={
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label="Search clients" value={q} onChange={e => setQ(e.target.value)} placeholder="Search"
                       className={`${SELECT} w-[180px] cursor-text`} />
                <span className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{v.vip.length} VIP make {pct(v.vip.reduce((a, r) => a + r.share, 0))}</span>
                <Segmented value={who} onChange={w => setWho(w)} options={[{ value: 'all', label: 'All', count: v.rows.length }, { value: 'vip', label: 'VIP', count: v.vip.length }]} />
              </div>
            }>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                      <th className={th}>#</th>
                      {sortTh('name', 'Client', false)}
                      {sortTh('periodValue', `${basisWord} in range`)}
                      {sortTh('lifetimeCommission', 'Lifetime commission')}
                      {sortTh('lifetimePremium', 'Lifetime premium')}
                      <th className={`${th} text-right`}>Share</th>
                      {sortTh('tenureMonths', 'Months')}
                      {sortTh('lastIssue', 'Last note')}
                      <th className={th}>Insurers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r: ClientRow) => (
                      <tr key={r.key} style={{ borderBottom: `1px solid #f1f3f4` }}>
                        <td className={`${num} text-left`} style={{ color: FAINT }}>{r.rank}</td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            {r.companyId ? <Link href={`/companies/${r.companyId}`} className="hover:underline" style={{ color: INK }}>{displayName(r.name)}</Link> : <span>{displayName(r.name)}</span>}
                            {r.vip && <span className="text-[10.5px] font-semibold tracking-wide px-1.5 py-[1px] rounded" style={{ border: `1px solid ${INK}`, color: INK }}>VIP</span>}
                          </div>
                          <div className="text-[11.5px]" style={{ color: FAINT }}>
                            {r.policies} polic{r.policies === 1 ? 'y' : 'ies'}{r.classes.length ? ` · ${r.classes.slice(0, 3).join(', ')}` : ''}{r.noCommission ? ` · ${r.noCommission} note${r.noCommission === 1 ? '' : 's'} without commission` : ''}
                          </div>
                        </td>
                        <td className={num} style={{ color: r.periodValue ? INK : FAINT }}>{r.periodValue ? money(r.periodValue) : '—'}</td>
                        <td className={num}>{money(r.lifetimeCommission)}</td>
                        <td className={num}>{money(r.lifetimePremium)}</td>
                        <td className={num}>{pct(r.share)}</td>
                        <td className={num}>{r.tenureMonths}</td>
                        <td className={num}>{dateLabel(r.lastIssue)}</td>
                        <td className={td} style={{ color: MUTED }}>{r.insurers.length > 2 ? `${r.insurers.slice(0, 2).join(', ')} +${r.insurers.length - 2}` : r.insurers.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-2">
              {[{ title: 'By insurer', rows: v.byInsurer }, { title: 'By class of insurance', rows: v.byClass }].map(g => (
                <div key={g.title} className="min-w-0"><SectionCard title={g.title}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px]">
                      <thead>
                        <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                          <th className={th}>{g.title === 'By insurer' ? 'Insurer' : 'Class'}</th>
                          <th className={`${th} text-right`}>Premium</th>
                          <th className={`${th} text-right`}>Commission</th>
                          <th className={`${th} text-right`}>Rate</th>
                          <th className={`${th} text-right`}>Clients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(r => (
                          <tr key={r.name} style={{ borderBottom: `1px solid #f1f3f4` }}>
                            <td className={td}>{r.name}</td>
                            <td className={num}>{money(r.premium)}</td>
                            <td className={num}>{money(r.commission)}</td>
                            <td className={num} style={{ color: r.rate == null ? FAINT : INK }}>{r.rate == null ? '—' : pct(r.rate)}</td>
                            <td className={num}>{r.clients}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard></div>
              ))}
            </div>

            <footer className="pt-2 text-[12px] tabular-nums flex flex-col gap-0.5" style={{ color: FAINT }}>
              <span>{v.noCommissionAll} of {data!.notes.length - v.foreign} SGD debit notes carry no commission; their clients&apos; commission is understated.</span>
              {v.foreign > 0 && <span>{v.foreign} note{v.foreign === 1 ? '' : 's'} in another currency left out of SGD totals.</span>}
              {data!.paidRecorded === 0 && <span>No payment is recorded on any debit note; figures are as billed.</span>}
              <span>{v.clientsWithNotes} of {data!.companiesOnFile} companies on file have a debit note.</span>
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}
