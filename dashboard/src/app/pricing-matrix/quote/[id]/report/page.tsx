'use client'

/**
 * The client report for one quotation: premiums by insurer, the plans priced, the headline
 * benefits side by side, the census it was priced on, and the basis. Printed or saved as PDF
 * from the browser.
 *
 * Figures and labels only — no commentary, no ranking language, no recommendation. Those stay
 * with the broker. Every figure is read from the saved quotation; nothing is recomputed here.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { Comparison, Cell } from '@/lib/gb/compare'
import { BENEFIT_BY_CODE, PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { resolveProduct } from '@/lib/gb/resolve'
import { censusProfile } from '@/lib/gb/score'
import { gstApplies } from '@/lib/gb-quote'
import { useCoverNames } from '@/components/group-benefits/useCoverNames'

type InsurerResult = { rate_table_id: string; insurer_name: string; by_product: Record<string, number>; subtotal: number; gst: number; total: number; missing: number }
type Quotation = {
  id: string; company_name: string | null; effective_date: string | null; basis: string | null; member_count: number
  census: { dob?: string | null; age?: number | null; relationship?: string | null }[] | null
  results: InsurerResult[]; category_map: Record<string, Record<string, Record<string, string>>> | null
  benefits_analysis: Comparison | null; notes: string | null; created_at: string; priorities: string | null
}

const money = (n: number, dp = 0) => `S$${n.toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const longDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const cellText = (c: Cell | undefined) => {
  if (!c || c.absent) return '—'
  if (c.text?.trim()) return c.text.trim()
  const k = c.comparable
  return k.kind === 'sgd' ? money(k.n) : k.kind === 'percent' ? `${k.n}%` : k.kind === 'as_charged' ? 'As charged' : '—'
}

export default function QuoteReportPage() {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = useState<Quotation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const names = useCoverNames()
  const coverName = (c: string) => names[c] || PRODUCT_BY_CODE[c]?.name || c

  useEffect(() => {
    fetch(`/api/group-benefits/quote/${id}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Could not load the quotation (${r.status})`)))
      .then(d => setQ(d.quotation))
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [id])

  const view = useMemo(() => {
    if (!q) return null
    const profile = censusProfile(q.census ?? [], q.effective_date)
    const employees = profile.employees || q.member_count || 1
    // The covers asked for — stored with the draft — else every cover priced anywhere. A bundle's
    // extra cover (AIA's EMM inside "GHS+EMM") is noted on its row, not given a column.
    const titleCodes = (t: string) => resolveProduct(t).codes
    let asked: string[] = []
    try { asked = (JSON.parse(q.priorities ?? '{}')?.score?.filters?.requiredProducts ?? []) as string[] } catch { /* none */ }
    const covers = (asked.length ? asked : Array.from(new Set(Object.values(q.category_map ?? {}).flatMap(m => Object.keys(m).flatMap(titleCodes)))))
      .filter(c => PRODUCT_BY_CODE[c])
      .sort((a, b) => PRODUCT_BY_CODE[a].sortOrder - PRODUCT_BY_CODE[b].sortOrder)
    const rows = [...(q.results ?? [])].sort((a, b) => a.total - b.total).map(r => {
      const map = q.category_map?.[r.rate_table_id] ?? {}
      const byCover: Record<string, { amount: number | null; with: string[]; extra: string[]; plan: string } | undefined> = {}
      for (const [title, cats] of Object.entries(map)) {
        const all = titleCodes(title)
        const codes = all.filter(c => covers.includes(c))
        if (!codes.length) continue
        const plan = Array.from(new Set(Object.values(cats))).join(', ')
        const extra = all.filter(c => !covers.includes(c))
        // A bundled premium ("GP + SP") sits under its first cover; the others say where it is.
        byCover[codes[0]] = { amount: r.by_product[title] ?? null, with: codes.slice(1), extra, plan }
        for (const c of codes.slice(1)) byCover[c] = { amount: null, with: [codes[0]], extra: [], plan }
      }
      const missingCovers = covers.filter(c => !byCover[c])
      return { r, byCover, missingCovers, pepm: r.total / 12 / employees }
    })
    const cmp = q.benefits_analysis && Array.isArray(q.benefits_analysis.groups) ? q.benefits_analysis : null
    const highlights = cmp ? cmp.groups.filter(g => covers.includes(g.productCode))
      .map(g => ({ ...g, rows: g.rows.filter(r => BENEFIT_BY_CODE[r.benefit.code]?.headline) })).filter(g => g.rows.length) : []
    const basis = (q.notes ?? '').split('\n').filter(l => l.trim() && !/^Drafted by|\[message:|\[thread:|^Thread filed/.test(l))
    return { profile, employees, covers, rows, cmp, highlights, basis }
  }, [q])

  if (error) return <div className="p-8 text-[14px]" style={{ color: '#c5221f' }}>{error}</div>
  if (!q || !view) return <div className="p-8"><Loader2 className="animate-spin" size={18} style={{ color: '#5f6368' }} /></div>

  const th = 'px-2.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide border-b border-[#dadce0]'
  const td = 'px-2.5 py-2 text-[12.5px] align-top border-b border-[#f1f3f4] tabular-nums'
  const exempt = view.covers.filter(c => !gstApplies(c)).map(c => coverName(c).toLowerCase())

  return (
    <div className="bg-white min-h-[calc(100vh/var(--ui-zoom)-var(--top-nav-h))]" style={{ color: '#202124' }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body * { visibility: hidden !important; }
          #gb-report, #gb-report * { visibility: visible !important; }
          #gb-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .no-print { display: none !important; }
          #gb-report table { page-break-inside: auto; }
          #gb-report tr { page-break-inside: avoid; }
        }
      `}</style>
      <div id="gb-report" className="mx-auto max-w-[1000px] px-4 sm:px-10 pt-8 pb-16">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-8">
          <a href={`/pricing-matrix/quote/${q.id}`} className="text-[13px] hover:underline" style={{ color: '#5f6368' }}>← Quotation</a>
          <button onClick={() => window.print()} className="text-[13px] font-semibold px-4 py-1.5 rounded-lg bg-[#202124] text-white hover:opacity-90">
            Print or save as PDF
          </button>
        </div>

        {/* Title block */}
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b-2 border-[#202124]">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#5f6368' }}>Group benefits comparison</p>
            <h1 className="m-0 mt-1 text-[28px] font-medium tracking-[-0.02em] leading-tight">{q.company_name || 'Untitled'}</h1>
          </div>
          <dl className="m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[12.5px]">
            <dt style={{ color: '#5f6368' }}>Policy start</dt><dd className="m-0">{longDate(q.effective_date)}</dd>
            <dt style={{ color: '#5f6368' }}>Basis</dt><dd className="m-0">{q.basis === 'renewal' ? 'Renewal' : 'New business'}</dd>
            <dt style={{ color: '#5f6368' }}>Prepared</dt><dd className="m-0">{longDate(q.created_at)}</dd>
            <dt style={{ color: '#5f6368' }}>Prepared by</dt><dd className="m-0">Trade Risk Solutions Pte Ltd</dd>
          </dl>
        </header>

        {/* Premiums */}
        <section className="mt-8">
          <h2 className="m-0 mb-3 text-[16px] font-medium">Annual premium by insurer</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 520 + view.covers.length * 90 }}>
              <thead>
                <tr style={{ color: '#5f6368' }}>
                  <th className={th}>Insurer</th>
                  {view.covers.map(c => <th key={c} className={`${th} text-right`}>{PRODUCT_BY_CODE[c].abbrev}</th>)}
                  <th className={`${th} text-right`}>GST</th>
                  <th className={`${th} text-right`}>Annual total</th>
                  <th className={`${th} text-right`}>Per employee per month</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map(({ r, byCover, missingCovers, pepm }) => (
                  <tr key={r.rate_table_id}>
                    <td className={td}>
                      <div className="font-semibold">{r.insurer_name}</div>
                      {missingCovers.length > 0 && <div className="text-[11.5px]" style={{ color: '#5f6368' }}>Not quoted: {missingCovers.map(c => PRODUCT_BY_CODE[c].abbrev).join(', ')}</div>}
                      {r.missing > 0 && <div className="text-[11.5px]" style={{ color: '#5f6368' }}>{r.missing} member line{r.missing === 1 ? '' : 's'} not priced</div>}
                    </td>
                    {view.covers.map(c => {
                      const v = byCover[c]
                      return (
                        <td key={c} className={`${td} text-right`} style={{ color: v ? '#202124' : '#9aa0a6' }}>
                          {!v ? '—' : v.amount != null ? money(v.amount) : `in ${PRODUCT_BY_CODE[v.with[0]]?.abbrev ?? ''}`}
                          {v && v.amount != null && v.extra.length > 0 && (
                            <div className="text-[11px]" style={{ color: '#5f6368' }}>incl. {v.extra.map(c => PRODUCT_BY_CODE[c]?.abbrev ?? c).join(', ')}</div>
                          )}
                        </td>
                      )
                    })}
                    <td className={`${td} text-right`}>{money(r.gst)}</td>
                    <td className={`${td} text-right font-semibold`}>{money(r.total)}</td>
                    <td className={`${td} text-right`}>{money(pepm, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Plans */}
        <section className="mt-8">
          <h2 className="m-0 mb-3 text-[16px] font-medium">Plans priced</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 480 + view.covers.length * 90 }}>
              <thead>
                <tr style={{ color: '#5f6368' }}>
                  <th className={th}>Insurer</th>
                  {view.covers.map(c => <th key={c} className={th}>{PRODUCT_BY_CODE[c].abbrev}</th>)}
                </tr>
              </thead>
              <tbody>
                {view.rows.map(({ r, byCover }) => (
                  <tr key={r.rate_table_id}>
                    <td className={`${td} font-semibold`}>{r.insurer_name}</td>
                    {view.covers.map(c => <td key={c} className={td} style={{ color: byCover[c] ? '#3c4043' : '#9aa0a6' }}>{byCover[c]?.plan ?? '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Benefits */}
        {view.cmp && view.highlights.length > 0 && (
          <section className="mt-8">
            <h2 className="m-0 mb-3 text-[16px] font-medium">Key benefits</h2>
            {view.highlights.map(g => {
              // One column per insurer, its plan for this cover underneath.
              const opts = Array.from(new Map(view.cmp!.options.filter(o => o.productCodes.includes(g.productCode))
                .map(o => [o.key.split(':')[0], o])).values())
              return (
                <div key={g.productCode} className="mb-5 overflow-x-auto">
                  <table className="w-full border-collapse" style={{ minWidth: 220 + opts.length * 130 }}>
                    <thead>
                      <tr style={{ color: '#5f6368' }}>
                        <th className={th}>{coverName(g.productCode)}</th>
                        {opts.map(o => <th key={o.key} className={th}>{o.insurerName}<div className="font-normal normal-case tracking-normal">{o.planCode}</div></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(row => {
                        const by = Object.fromEntries(row.cells.map(c => [c.optionKey, c]))
                        return (
                          <tr key={row.benefit.code}>
                            <td className={td}>{names[row.benefit.code] || row.benefit.name}</td>
                            {opts.map(o => <td key={o.key} className={td} style={{ color: by[o.key]?.absent !== false ? '#9aa0a6' : '#3c4043' }}>{cellText(by[o.key])}</td>)}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </section>
        )}

        {/* Census */}
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="m-0 mb-3 text-[16px] font-medium">Census</h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[12.5px] tabular-nums">
              <dt style={{ color: '#5f6368' }}>Members</dt><dd className="m-0">{view.profile.members}</dd>
              <dt style={{ color: '#5f6368' }}>Employees</dt><dd className="m-0">{view.profile.employees}</dd>
              <dt style={{ color: '#5f6368' }}>Dependants</dt><dd className="m-0">{view.profile.dependants}</dd>
              <dt style={{ color: '#5f6368' }}>Average age, employees</dt><dd className="m-0">{view.profile.averageAgeEmployees ?? '—'}</dd>
            </dl>
          </div>
          <div>
            <h2 className="m-0 mb-3 text-[16px] font-medium">Age bands</h2>
            <table className="border-collapse">
              <tbody>
                {view.profile.bands.map(b => (
                  <tr key={b.label}><td className="pr-6 py-0.5 text-[12.5px]" style={{ color: '#5f6368' }}>{b.label}</td><td className="py-0.5 text-[12.5px] tabular-nums text-right">{b.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Basis */}
        {view.basis.length > 0 && (
          <section className="mt-8">
            <h2 className="m-0 mb-3 text-[16px] font-medium">Basis of this comparison</h2>
            <ul className="m-0 pl-4 list-disc flex flex-col gap-1 text-[12.5px] max-w-[85ch]" style={{ color: '#3c4043' }}>
              {view.basis.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </section>
        )}

        <footer className="mt-10 pt-4 border-t border-[#dadce0] text-[11.5px] flex flex-col gap-1" style={{ color: '#5f6368' }}>
          <p className="m-0">Estimates only. Final premiums are subject to insurer underwriting and acceptance.</p>
          <p className="m-0">Premiums include GST at 9%{exempt.length ? `, except ${exempt.join(' and ')}, which ${exempt.length === 1 ? 'is' : 'are'} exempt` : ''}. Per employee per month is the annual total divided by 12 and by {view.employees} employee{view.employees === 1 ? '' : 's'}.</p>
        </footer>
      </div>
    </div>
  )
}
