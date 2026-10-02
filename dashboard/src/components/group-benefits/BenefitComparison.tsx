'use client'

/**
 * The quoted options, side by side.
 *
 * Benefit lines down, insurers across, premium difference at the top. Where a line can be
 * ordered — a dollar limit, a ward class, a co-payment — the option holding the most cover is
 * marked. Where it cannot be ordered, both values are simply shown.
 *
 * This table carries no score. The value score sits above it (ValueScore.tsx), with the broker's
 * weights in view; this stays the line-by-line record that score is built from.
 *
 * A blank cell means no value on record for that line — not that the insurer excludes it. The
 * two are different and the footer says which lines are affected, because a comparison that
 * quietly drops a missing schedule reads as a comparison of equals.
 */

import React, { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Comparison, Cell } from '@/lib/gb/compare'
import { VERIFICATION } from '@/lib/gb/verification'

const money = (n: number) => n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 })

function cellText(c: Cell): string {
  if (c.absent) return '—'
  if (c.text?.trim()) return c.text.trim()
  const k = c.comparable
  if (k.kind === 'sgd')     return money(k.n)
  if (k.kind === 'percent') return `${k.n}%`
  if (k.kind === 'number')  return String(k.n)
  if (k.kind === 'boolean') return k.v ? 'Yes' : 'No'
  if (k.kind === 'as_charged') return 'As charged'
  return '—'
}

export function BenefitComparison({ comparison, onRecompute, busy }: {
  comparison: Comparison
  onRecompute?: (opts: { hideIdentical: boolean }) => void
  busy?: boolean
}) {
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const { options, premium, groups, coverage } = comparison

  const premiumBy = useMemo(() => Object.fromEntries(premium.map(p => [p.optionKey, p])), [premium])
  // One column per insurer. Options are per product and plan ("Income · GHS Plan 2", "Income ·
  // SP Plan 2"), and a column each left every column blank outside its own product.
  const cols = useMemo(() => {
    const by = new Map<string, typeof options>()
    for (const o of options) {
      const tid = o.key.split(':')[0]
      by.set(tid, [...(by.get(tid) ?? []), o])
    }
    return Array.from(by.entries()).map(([tid, opts]) => ({
      key: tid, insurerName: opts[0].insurerName, verification: opts[0].verification, first: opts[0].key,
      keys: new Set(opts.map(o => o.key)),
      plans: Array.from(new Set(opts.map(o => o.planCode))).join(' · '),
    }))
  }, [options])
  const visible = useMemo(
    () => groups.map(g => ({ ...g, rows: onlyDifferences ? g.rows.filter(r => r.differs) : g.rows }))
               .filter(g => g.rows.length > 0),
    [groups, onlyDifferences])

  const col = 'px-3 py-2 text-[13px] border-l border-[#e8eaed] text-right tabular-nums align-top'

  return (
    <div className="border border-[#e8eaed] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-[#e8eaed]">
        <h3 className="m-0 text-[13px] font-bold" style={{ color: '#202124' }}>Benefit comparison</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer" style={{ color: '#5f6368' }}>
            <input type="checkbox" checked={onlyDifferences} onChange={e => setOnlyDifferences(e.target.checked)}
                   className="accent-[#202124]" />
            Only lines that differ
          </label>
          {onRecompute && (
            <button onClick={() => onRecompute({ hideIdentical: false })} disabled={busy}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] bg-white hover:bg-[#f8f9fa] disabled:opacity-50"
                    style={{ color: '#202124' }}>
              {busy ? 'Comparing…' : 'Recompare'}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 220 + cols.length * 150 }}>
          <thead>
            <tr className="bg-[#f8f9fa]">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide sticky left-0 bg-[#f8f9fa] z-10"
                  style={{ color: '#5f6368', minWidth: 220 }}>Benefit</th>
              {cols.map(o => (
                <th key={o.key} className="px-3 py-2 text-right text-[12px] font-semibold border-l border-[#e8eaed]"
                    style={{ color: '#202124', minWidth: 150 }}>
                  <div>{o.insurerName}</div>
                  <div className="text-[11px] font-normal" style={{ color: '#5f6368' }}>{o.plans}</div>
                  {o.verification && o.verification !== 'calculator' && (
                    <div className="text-[11px] font-medium mt-0.5" style={{ color: VERIFICATION[o.verification].color }}>{VERIFICATION[o.verification].label}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Premium first: the number every other row is a trade against. */}
            <tr className="border-t border-[#e8eaed]">
              <td className="px-3 py-2 text-[13px] font-semibold sticky left-0 bg-white z-10" style={{ color: '#202124' }}>
                Annual premium
              </td>
              {cols.map(o => {
                const p = premiumBy[o.first]
                return (
                  <td key={o.key} className={cn(col, 'font-semibold')} style={{ color: '#202124' }}>
                    {p?.annualTotal != null ? money(p.annualTotal) : <span style={{ color: '#9aa0a6' }}>Not priced</span>}
                  </td>
                )
              })}
            </tr>
            {/* Only when there is something to compare against. One option is not cheapest. */}
            {cols.length > 1 && (
            <tr className="border-t border-[#f1f3f4]">
              <td className="px-3 py-2 text-[13px] sticky left-0 bg-white z-10" style={{ color: '#5f6368' }}>
                Against the cheapest
              </td>
              {cols.map(o => {
                const p = premiumBy[o.first]
                if (p?.deltaAbsolute == null) return <td key={o.key} className={col} style={{ color: '#9aa0a6' }}>—</td>
                return (
                  <td key={o.key} className={col} style={{ color: p.deltaAbsolute === 0 ? '#202124' : '#5f6368' }}>
                    {p.deltaAbsolute === 0
                      ? 'Cheapest'
                      : `+${money(p.deltaAbsolute)}${p.deltaPercent != null ? ` · +${p.deltaPercent.toFixed(1)}%` : ''}`}
                    {p.pricingGaps > 0 && (
                      <div className="text-[11px]" style={{ color: '#b06000' }}>
                        {p.pricingGaps} member line{p.pricingGaps === 1 ? '' : 's'} unpriced
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
            )}
            {cols.length === 1 && premium[0]?.pricingGaps > 0 && (
              <tr className="border-t border-[#f1f3f4]">
                <td className="px-3 py-2 text-[13px] sticky left-0 bg-white z-10" style={{ color: '#5f6368' }}>
                  Unpriced member lines
                </td>
                <td className={col} style={{ color: '#b06000' }}>{premium[0].pricingGaps}</td>
              </tr>
            )}

            {visible.map(g => (
              <React.Fragment key={g.productCode}>
                <tr>
                  <td colSpan={1 + cols.length}
                      className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide border-t border-[#e8eaed]"
                      style={{ color: '#5f6368' }}>
                    {g.productName}
                  </td>
                </tr>
                {g.rows.map(r => {
                  const cellFor = (k: Set<string>) => r.cells.find(c => k.has(c.optionKey))
                  return (
                    <tr key={r.benefit.code} className="border-t border-[#f1f3f4]">
                      <td className="px-3 py-2 text-[13px] sticky left-0 bg-white z-10" style={{ color: '#202124' }}>
                        {r.benefit.name}
                        {r.benefit.unit && r.benefit.unit !== 'SGD' && (
                          <span className="text-[11px]" style={{ color: '#9aa0a6' }}> ({r.benefit.unit})</span>
                        )}
                      </td>
                      {cols.map(o => {
                        const c = cellFor(o.keys)
                        // An option that does not cover this product was never asked to carry
                        // the line, which is not the same as having nothing on record for it.
                        if (!c) return <td key={o.key} className={col} style={{ color: '#dadce0' }}>Not quoted</td>
                        return (
                          <td key={o.key} className={cn(col, c.best && 'font-semibold')}
                              style={{ color: c.absent ? '#9aa0a6' : '#202124' }}>
                            {cellText(c)}
                            {c.best && <span className="ml-1.5 text-[11px] font-normal" style={{ color: '#137333' }}>most cover</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2.5 border-t border-[#e8eaed] bg-[#f8f9fa] text-[11.5px] tabular-nums" style={{ color: '#5f6368' }}>
        {coverage.linesCompared} line{coverage.linesCompared === 1 ? '' : 's'} compared ·{' '}
        {coverage.linesWithEveryOption} with a value from every option ·{' '}
        {coverage.linesWithNothing} canonical line{coverage.linesWithNothing === 1 ? '' : 's'} with nothing on record from anybody
        {coverage.optionsWithPricingGaps.length > 0 && ' · premiums marked unpriced are not comparable totals'}
      </div>
    </div>
  )
}
