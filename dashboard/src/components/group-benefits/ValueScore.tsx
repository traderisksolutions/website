'use client'

/**
 * The value score, with the weights in view.
 *
 * Every figure here comes from scoreComparison (src/lib/gb/score.ts), run in the browser so a
 * change of weight re-ranks at once. Weights, filters and the ranking order save to the
 * quotation, so the next person to open it sees the same table. The written explanation is one
 * model call on request, never on load, and says when the weights have moved since it was written.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import type { Comparison } from '@/lib/gb/compare'
import { PRODUCT_BY_CODE } from '@/lib/gb/canon'
import { VERIFICATION } from '@/lib/gb/verification'
import {
  DEFAULT_WEIGHTS, DIMENSIONS, WARD_FLOORS, parseSettings, scoreComparison,
  type DimensionKey, type ScoreSettings, type SortMode,
} from '@/lib/gb/score'

type Explanation = { points: string[]; model: string; at: string; settings: ScoreSettings }

const money = (n: number, dp = 0) =>
  n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: dp, maximumFractionDigits: dp })

const METHOD = 'Each benefit line scores 0–1 against the other insurers on that line: limits against the highest, co-payments and deductibles against the lowest, ward class by rank. "As charged" scores 1; a capped limit beside it scores at most 0.8. Headline lines count twice. Lines roll into four dimensions; your weights combine them into coverage, 0–100. PEPM is the annual premium ÷ 12 ÷ employees. Value is coverage ÷ PEPM, indexed so the best is 100. Lines with nothing on record are not scored. An insurer with unpriced member lines is shown, not ranked. Renewal risk is not scored: no claims data is held.'

const SORTS: { key: SortMode; label: string }[] = [
  { key: 'value', label: 'Value' }, { key: 'pepm', label: 'Lowest PEPM' }, { key: 'coverage', label: 'Coverage' },
]

const sameSettings = (a: ScoreSettings, b: ScoreSettings) => JSON.stringify(a) === JSON.stringify(b)

export function ValueScore({ quoteId, comparison, priorities, employeesFallback }: {
  quoteId: string
  comparison: Comparison
  /** gb_quotations.priorities as stored: { score, explanation } in JSON. */
  priorities: string | null
  employeesFallback: number
}) {
  const stored = useMemo(() => {
    try { return priorities ? JSON.parse(priorities) as { explanation?: Explanation } : {} } catch { return {} }
  }, [priorities])
  const [settings, setSettings] = useState<ScoreSettings>(() => parseSettings(priorities))
  const [explanation, setExplanation] = useState<Explanation | null>(stored.explanation ?? null)
  const [explaining, setExplaining] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)

  const employees = comparison.employees || employeesFallback
  const result = useMemo(() => scoreComparison(comparison, settings, employees), [comparison, settings, employees])

  // Save a moment after the last change, not on every keystroke.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setSaveState('saving')
    const t = setTimeout(async () => {
      const res = await fetch(`/api/group-benefits/quote/${quoteId}/score`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }),
      }).catch(() => null)
      setSaveState(res?.ok ? 'saved' : 'failed')
    }, 700)
    return () => clearTimeout(t)
  }, [settings, quoteId])

  const setWeight = (k: DimensionKey, v: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
    setSettings(s => ({ ...s, weights: { ...s.weights, [k]: n } }))
  }
  const setFilters = (patch: Partial<ScoreSettings['filters']>) =>
    setSettings(s => ({ ...s, filters: { ...s.filters, ...patch } }))
  const toggleStrike = (tableId: string) => setFilters({
    excludeTables: settings.filters.excludeTables.includes(tableId)
      ? settings.filters.excludeTables.filter(t => t !== tableId)
      : [...settings.filters.excludeTables, tableId],
  })
  const toggleRequired = (p: string) => setFilters({
    requiredProducts: settings.filters.requiredProducts.includes(p)
      ? settings.filters.requiredProducts.filter(x => x !== p)
      : [...settings.filters.requiredProducts, p],
  })

  async function explain() {
    setExplaining(true); setError(null)
    try {
      const res = await fetch(`/api/group-benefits/quote/${quoteId}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.explanation) setExplanation(d.explanation as Explanation)
      else setError(d.error ?? 'Could not write the explanation')
    } finally { setExplaining(false) }
  }

  const tables = new Set(comparison.options.map(o => o.key.split(':')[0]))
  if (tables.size < 2) {
    return (
      <div className="border border-[#e8eaed] rounded-lg px-3 py-2.5 text-[12.5px]" style={{ color: '#5f6368' }}>
        <span className="font-bold" style={{ color: '#202124' }}>Value score</span> · needs two or more insurers on the quote.
      </div>
    )
  }

  const dims = DIMENSIONS.filter(d => result.activeDimensions.includes(d.key))
  const weightTotal = dims.reduce((s, d) => s + settings.weights[d.key], 0)
  const quotedDims = DIMENSIONS.filter(d => result.insurers.some(i => i.dimensions[d.key].quoted))
  const products = Array.from(new Set(comparison.options.flatMap(o => o.productCodes)))
    .filter(p => PRODUCT_BY_CODE[p]).sort((a, b) => PRODUCT_BY_CODE[a].sortOrder - PRODUCT_BY_CODE[b].sortOrder)
  const stale = explanation && !sameSettings(explanation.settings, settings)

  const th = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap'
  const td = 'px-3 py-2.5 text-[13px] tabular-nums align-top'
  const label = 'text-[11px] font-semibold uppercase tracking-wide'

  return (
    <div className="border border-[#e8eaed] rounded-lg overflow-hidden">
      {/* Header: title and ranking order. */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-b border-[#e8eaed]">
        <h3 className="m-0 text-[13px] font-bold inline-flex items-center" style={{ color: '#202124' }}>
          Value score <Tip text={METHOD} placement="bottomLeft" />
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[12px] whitespace-nowrap" style={{ color: '#5f6368' }}>Rank by</span>
          <div role="radiogroup" aria-label="Rank by" className="inline-flex rounded-lg border border-[#dadce0] overflow-hidden">
            {SORTS.map(s => (
              <button key={s.key} role="radio" aria-checked={settings.sort === s.key}
                      onClick={() => setSettings(x => ({ ...x, sort: s.key }))}
                      className={cn('px-2.5 py-1 text-[12px] font-medium whitespace-nowrap',
                        settings.sort === s.key ? 'bg-[#202124] text-white' : 'text-[#5f6368] hover:bg-[#f8f9fa]')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Weights and filters. */}
      <div className="grid gap-4 px-3 py-3 border-b border-[#e8eaed] md:grid-cols-2">
        <fieldset className="m-0 p-0 border-0 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <legend className={label} style={{ color: '#5f6368' }}>Weights</legend>
            <button onClick={() => setSettings(s => ({ ...s, weights: DEFAULT_WEIGHTS }))}
                    className="text-[12px] bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: '#5f6368' }}>
              Reset
            </button>
          </div>
          {/* Every dimension the quote covers, in coverage or not, so a weight can be set before
              the data arrives. A dimension out of coverage shows no share. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {quotedDims.map(d => (
              <label key={d.key} htmlFor={`w-${d.key}`} className="flex items-center justify-between gap-2 text-[12.5px]" style={{ color: '#202124' }}>
                <span className="truncate">{d.label}</span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <input id={`w-${d.key}`} type="number" min={0} max={100} step={5} inputMode="numeric"
                         value={settings.weights[d.key]} onChange={e => setWeight(d.key, e.target.value)}
                         className="w-14 px-1.5 py-1 text-right text-[12.5px] tabular-nums border border-[#dadce0] rounded-md" />
                  <span className="w-9 text-right text-[11.5px] tabular-nums" style={{ color: '#5f6368' }}>
                    {weightTotal && result.activeDimensions.includes(d.key) ? `${Math.round((settings.weights[d.key] / weightTotal) * 100)}%` : '—'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 p-0 border-0 min-w-0">
          <legend className={cn(label, 'mb-2')} style={{ color: '#5f6368' }}>Filters</legend>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="f-pepm" className="flex flex-col gap-1 text-[12px]" style={{ color: '#5f6368' }}>
              Max PEPM (S$)
              <input id="f-pepm" type="number" min={0} step={10} inputMode="decimal" placeholder="No limit"
                     value={settings.filters.maxPepm ?? ''}
                     onChange={e => setFilters({ maxPepm: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) || null })}
                     className="px-2 py-1 text-[12.5px] tabular-nums border border-[#dadce0] rounded-md" style={{ color: '#202124' }} />
            </label>
            <label htmlFor="f-ward" className="flex flex-col gap-1 text-[12px]" style={{ color: '#5f6368' }}>
              Ward floor
              <select id="f-ward" value={settings.filters.minWardRank ?? ''}
                      onChange={e => setFilters({ minWardRank: e.target.value === '' ? null : Number(e.target.value) })}
                      className="px-2 py-1 text-[12.5px] border border-[#dadce0] rounded-md bg-white" style={{ color: '#202124' }}>
                <option value="">Any</option>
                {WARD_FLOORS.map(w => <option key={w.rank} value={w.rank}>{w.label} or better</option>)}
              </select>
            </label>
          </div>
          {products.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[12px] mr-0.5" style={{ color: '#5f6368' }}>Must quote</span>
              {products.map(p => {
                const on = settings.filters.requiredProducts.includes(p)
                return (
                  <button key={p} aria-pressed={on} onClick={() => toggleRequired(p)}
                          className={cn('px-2 py-0.5 text-[11.5px] font-medium rounded-md border',
                            on ? 'bg-[#202124] text-white border-[#202124]' : 'border-[#dadce0] text-[#5f6368] hover:bg-[#f8f9fa]')}>
                    {PRODUCT_BY_CODE[p].abbrev}
                  </button>
                )
              })}
            </div>
          )}
        </fieldset>
      </div>

      {/* The ranking. `relative` keeps the visually hidden header inside the scroll frame; without
          it the label positions against the page and widens it on a phone. */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 560 + dims.length * 96 }}>
          <thead>
            <tr className="bg-[#f8f9fa]" style={{ color: '#5f6368' }}>
              <th className={cn(th, 'text-right w-10')}>#</th>
              <th className={cn(th, 'text-left')}>Insurer</th>
              <th className={cn(th, 'text-right')}>Annual premium</th>
              <th className={cn(th, 'text-right')}>PEPM</th>
              {dims.map(d => <th key={d.key} className={cn(th, 'text-right')}>{d.label}</th>)}
              <th className={cn(th, 'text-right')}>Coverage</th>
              <th className={cn(th, 'text-right')}>Value</th>
              <th className={th}><span className="sr-only">Strike out</span></th>
            </tr>
          </thead>
          <tbody>
            {result.insurers.map(i => {
              const out = i.excluded.length > 0
              const ink = out ? '#9aa0a6' : '#202124'
              const struck = settings.filters.excludeTables.includes(i.tableId)
              return (
                <tr key={i.tableId} className="border-t border-[#f1f3f4]">
                  <td className={cn(td, 'text-right')} style={{ color: ink }}>{i.rank ?? '—'}</td>
                  <td className={cn(td, 'min-w-[180px]')}>
                    <div className="font-semibold" style={{ color: ink }}>{i.insurerName}</div>
                    <div className="text-[11.5px]" style={{ color: '#5f6368' }}>{i.planLabels.join(', ')}</div>
                    {i.verification && i.verification !== 'calculator' && (
                      <div className="text-[11px] font-medium" style={{ color: VERIFICATION[i.verification].color }}>{VERIFICATION[i.verification].label}</div>
                    )}
                    {out && <div className="text-[11.5px]" style={{ color: '#5f6368' }}>{i.excluded.join(' · ')}</div>}
                  </td>
                  <td className={cn(td, 'text-right')} style={{ color: ink }}>
                    {i.annualTotal != null ? money(i.annualTotal) : 'Not priced'}
                    {i.pricingGaps > 0 && <div className="text-[11px]" style={{ color: '#b06000' }}>{i.pricingGaps} unpriced</div>}
                  </td>
                  <td className={cn(td, 'text-right')} style={{ color: ink }}>{i.pepm != null ? money(i.pepm, 2) : '—'}</td>
                  {dims.map(d => {
                    const s = i.dimensions[d.key]
                    return (
                      <td key={d.key} className={cn(td, 'text-right')} style={{ color: s.score == null ? '#9aa0a6' : ink }}>
                        {!s.quoted ? (s.score === 0 ? <span title="Not quoted">0</span> : '—') : s.score == null ? '—' : Math.round(s.score)}
                      </td>
                    )
                  })}
                  <td className={cn(td, 'text-right font-semibold')} style={{ color: ink }}>
                    {i.coverage != null ? Math.round(i.coverage) : '—'}
                    <div className="text-[11px] font-normal" style={{ color: '#5f6368' }}>{i.linesScored} of {i.linesAvailable} lines</div>
                  </td>
                  <td className={cn(td, 'text-right font-semibold')} style={{ color: ink }}>{i.valueIndex != null && !out ? Math.round(i.valueIndex) : '—'}</td>
                  <td className={cn(td, 'text-right')}>
                    <button onClick={() => toggleStrike(i.tableId)}
                            className="text-[12px] bg-transparent border-0 p-0 cursor-pointer hover:underline whitespace-nowrap" style={{ color: '#5f6368' }}>
                      {struck ? 'Restore' : 'Strike out'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3 py-2 border-t border-[#e8eaed] bg-[#f8f9fa] text-[11.5px] tabular-nums" style={{ color: '#5f6368' }}>
        <span>PEPM over {employees} employee{employees === 1 ? '' : 's'}{comparison.employees ? '' : ' (all members; recompare to count employees only)'}</span>
        {result.droppedDimensions.map(d => (
          <span key={d.key}>{DIMENSIONS.find(x => x.key === d.key)!.label} not in coverage: nothing comparable on record for {d.insurers.join(', ')}</span>
        ))}
        <span>Estimates only. Final quotes are subject to insurer underwriting.</span>
      </div>

      {/* The written explanation. */}
      <div className="px-3 py-3 border-t border-[#e8eaed]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="m-0 text-[13px] font-bold" style={{ color: '#202124' }}>Explanation</h4>
          <div className="flex items-center gap-3">
            {saveState === 'saving' && <span className="text-[11.5px]" style={{ color: '#9aa0a6' }}>Saving…</span>}
            {saveState === 'failed' && <span className="text-[11.5px]" style={{ color: '#c5221f' }}>Weights not saved</span>}
            <button onClick={explain} disabled={explaining || !weightTotal}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#dadce0] bg-white hover:bg-[#f8f9fa] disabled:opacity-50"
                    style={{ color: '#202124' }}>
              {explaining && <Loader2 size={13} className="animate-spin" />}
              {explaining ? 'Writing…' : explanation ? 'Rewrite' : 'Write explanation'}
            </button>
          </div>
        </div>
        {explanation && (
          <>
            <ul className="m-0 mt-2 pl-4 list-disc flex flex-col gap-1.5 text-[13px] leading-relaxed max-w-[75ch]" style={{ color: '#202124' }}>
              {explanation.points.map((p, n) => <li key={n}>{p}</li>)}
            </ul>
            <p className="m-0 mt-2 text-[11.5px] tabular-nums" style={{ color: '#5f6368' }}>
              {new Date(explanation.at).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' · weights '}{DIMENSIONS.map(d => explanation.settings.weights[d.key]).join('/')}
              {stale && ' · weights or filters changed since; rewrite to match'}
            </p>
          </>
        )}
        {error && <p className="m-0 mt-2 text-[11.5px]" style={{ color: '#c5221f' }}>{error}</p>}
      </div>
    </div>
  )
}
