'use client'

/**
 * Renewals › Forecast (docs/renewals.md, release 2): the next 12 months by expiry month. Due,
 * Won, Open and Lost (count, premium, commission); gross retention for a month with nothing open.
 * A bar chart of commission expiring by month, then the table. Filters: line, owner.
 * Policies whose renewal record has not opened yet count as Open. No model is called.
 */
import { useEffect, useMemo, useState } from 'react'
import { Empty, Spinner } from '@/components/crm/primitives'
import { PageHeader } from '@/components/page-header'
import { callApi, errText } from '@/components/placement/shared'
import { Register, RegisterCell, RegisterHead, RegisterRow, RegisterTh } from '@/components/ui/register'
import { SelectBox } from '@/components/ui/select-box'
import { money } from '@/lib/format'
import { LINES } from '@/lib/renewals/lines'
import { barLabel, forecast, monthName, pct, type ForecastItem, type ForecastMonth, type Sums } from '@/lib/renewals/forecast'
import { ownerName } from './bits'

type View = { tables: boolean; today: string; items: ForecastItem[]; owners: string[]; notOpened: number }
const ALL = ''
const S = (n: number) => money(n, { ccy: 'SGD', dp: 0 })

export function RenewalsForecast() {
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [line, setLine] = useState(ALL)
  const [owner, setOwner] = useState(ALL)
  useEffect(() => { callApi<View>('/api/renewals/forecast').then(setView).catch(e => setError(errText(e))) }, [])
  const fc = useMemo(() => (view ? forecast(view.items, view.today, { line, owner }) : null), [view, line, owner])

  return (
    <div className="px-4 md:px-8 py-6 mx-auto w-full min-w-0 max-w-screen-xl flex flex-col gap-8">
      <PageHeader title="Forecast"
        meta={fc ? `Next 12 months · ${fc.total.due.count} due · ${S(fc.total.due.premium)} gross · ${S(fc.total.due.commission)} commission` : undefined}>
        {view?.tables && (
          <>
            <div className="w-48"><SelectBox label="Line" value={line} onChange={setLine} options={[
              { value: ALL, label: 'Every line' }, ...LINES.map(l => ({ value: l.code, label: l.name })), { value: 'none', label: 'No line' },
            ]} /></div>
            <div className="w-36"><SelectBox label="Owner" value={owner} onChange={setOwner} options={[
              { value: ALL, label: 'Every owner' }, ...view.owners.map(o => ({ value: o, label: ownerName(o) })), { value: 'none', label: 'No owner' },
            ]} /></div>
          </>
        )}
      </PageHeader>
      {error && <p className="m-0 text-sm text-trs-neg" role="alert">{error}</p>}
      {!view ? (error ? null : <Spinner label="Loading the forecast…" />)
        : !view.tables ? <Empty>Renewal records are not set up yet.</Empty>
        : fc && (
          <>
            <section aria-labelledby="fc-chart">
              <h2 id="fc-chart" className="m-0 mb-3 text-base font-semibold text-trs-ink">Commission expiring by month · SGD</h2>
              <CommissionBars months={fc.months} />
            </section>
            <section aria-labelledby="fc-table">
              <h2 id="fc-table" className="m-0 mb-3 text-base font-semibold text-trs-ink">By month</h2>
              <Register label="Forecast by month" minWidth={1040}>
                <RegisterHead>
                  <RegisterTh first>Month</RegisterTh>
                  <RegisterTh>Due</RegisterTh>
                  <RegisterTh>Due premium</RegisterTh>
                  <RegisterTh>Due commission</RegisterTh>
                  <RegisterTh>Won</RegisterTh>
                  <RegisterTh>Open</RegisterTh>
                  <RegisterTh>Lost</RegisterTh>
                  <RegisterTh last>Gross retention</RegisterTh>
                </RegisterHead>
                <tbody>
                  {fc.months.map(m => (
                    <RegisterRow key={m.month}>
                      <RegisterCell first primary={monthName(m.month)} />
                      <RegisterCell primary={m.due.count} />
                      <RegisterCell primary={S(m.due.premium)} />
                      <RegisterCell primary={S(m.due.commission)} />
                      <SumCell s={m.won} />
                      <SumCell s={m.open} />
                      <SumCell s={m.lost} />
                      <RegisterCell last primary={pct(m.retention)} />
                    </RegisterRow>
                  ))}
                  <RegisterRow className="row-total">
                    <RegisterCell first primary="12 months" />
                    <RegisterCell primary={fc.total.due.count} />
                    <RegisterCell primary={S(fc.total.due.premium)} />
                    <RegisterCell primary={S(fc.total.due.commission)} />
                    <SumCell s={fc.total.won} />
                    <SumCell s={fc.total.open} />
                    <SumCell s={fc.total.lost} />
                    <RegisterCell last primary={pct(fc.total.retention)} />
                  </RegisterRow>
                </tbody>
              </Register>
            </section>
          </>
        )}
    </div>
  )
}

const SumCell = ({ s }: { s: Sums }) => <RegisterCell primary={s.count} secondary={s.count ? S(s.premium) : undefined} />

/** One series, one axis: commission expiring per month, each bar labelled; hover names the month and the figure. */
function CommissionBars({ months }: { months: ForecastMonth[] }) {
  const W = 960, H = 240, top = 22, bottom = 26, gap = 10
  const max = Math.max(1, ...months.map(m => m.due.commission))
  const bw = (W - gap * (months.length - 1)) / months.length
  const plot = H - top - bottom
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Commission expiring by month" className="block w-full min-w-[640px] h-auto">
        <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} className="stroke-trs-line" strokeWidth={1} />
        {months.map((m, i) => {
          const v = m.due.commission
          const h = v > 0 ? Math.max(2, (v / max) * plot) : 0
          const x = i * (bw + gap)
          const y = H - bottom - h
          return (
            <g key={m.month}>
              <title>{`${monthName(m.month)}: ${S(v)} commission, ${m.due.count} due`}</title>
              <rect x={x} y={top} width={bw} height={plot} className="fill-transparent" />
              {h > 0 && <rect x={x} y={y} width={bw} height={h} rx={3} className="fill-[var(--trs-chart-1)]" />}
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="fill-trs-ink text-xs tabular-nums">{v > 0 ? barLabel(v) : ''}</text>
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-trs-muted text-xs">{monthName(m.month, true)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
