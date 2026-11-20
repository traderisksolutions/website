'use client'

/**
 * Clients › Portfolio: every business ranked by the commission TRS earns from it, the admin each
 * takes beside it, and where the top 20%'s admin goes by request type, so it can be automated
 * (src/lib/clients/portfolio.ts). Figures from records only; the windows they cover are stated.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/page-header'
import { Segmented, Spinner } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { fmtDate, money } from '@/lib/format'
import { REQUEST_TYPES, unfiledLine, type Portfolio } from '@/lib/clients/portfolio'

const pct = (x: number | null | undefined, dp = 1) => x == null ? '—' : `${(x * 100).toFixed(dp)}%`

export default function PortfolioPage() {
  const [window, setWindow] = useState<'12m' | 'all'>('12m')
  const [data, setData] = useState<Portfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setData(null); setError(null)
    fetch(`/api/clients/portfolio?window=${window}`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? `The portfolio could not load (${r.status})`); return }
      setData(d)
    }).catch(e => setError(e instanceof Error ? e.message : 'The portfolio could not load'))
  }, [window])

  const s = data?.summary
  const topRequests = s ? REQUEST_TYPES.reduce((a, t) => a + s.topByType[t], 0) : 0
  return (
    <div className="bg-white text-trs-ink">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 py-6 pb-20 min-w-0">
        <PageHeader title="Portfolio"
          meta={s ? [`Top 20%: ${s.topCount} of ${s.businesses} businesses · ${pct(s.topShare)} of commission · ${pct(s.topSentShare)} of TRS emails · ${pct(s.topRequestShare)} of requests`, unfiledLine(data?.unfiled, fmtDate)].filter(Boolean).join(' · ') : 'Loading…'}
          actions={<Segmented size="sm" label="Period" value={window} onChange={setWindow} options={[{ value: '12m', label: 'Last 12 months' }, { value: 'all', label: 'All debit notes' }]} />} />
        {error && <p className="mt-6 text-[14px] text-trs-neg" role="alert">{error}</p>}
        {!data && !error && <div className="mt-10"><Spinner label="Reading every debit note, email and request…" /></div>}
        {data && s && (<>
          <section className="mt-8" aria-labelledby="pf-admin">
            <h2 id="pf-admin" className="m-0 mb-3 text-[17px] font-medium">Admin for the top 20% · {topRequests} requests</h2>
            <Register label="Top 20% requests by type" minWidth={560} dense={false}>
              <RegisterHead><RegisterTh first>Request type</RegisterTh><RegisterTh>Requests</RegisterTh><RegisterTh>Share</RegisterTh><RegisterTh last>Most from</RegisterTh></RegisterHead>
              <tbody>
                {REQUEST_TYPES.map(t => {
                  const most = data.rows.filter(r => r.top && r.byType[t] > 0).sort((a, b) => b.byType[t] - a.byType[t]).slice(0, 3)
                  return (
                    <RegisterRow key={t}>
                      <RegisterCell first primary={t} />
                      <RegisterCell className="tabular-nums">{s.topByType[t]}</RegisterCell>
                      <RegisterCell>{topRequests ? pct(s.topByType[t] / topRequests, 0) : '—'}</RegisterCell>
                      <RegisterCell align="left" last nowrap={false}>{most.map(r => `${r.name} ${r.byType[t]}`).join(' · ') || '—'}</RegisterCell>
                    </RegisterRow>
                  )
                })}
              </tbody>
            </Register>
          </section>

          <section className="mt-10" aria-labelledby="pf-rank">
            <h2 id="pf-rank" className="m-0 mb-3 text-[17px] font-medium">Businesses by commission · {data.rows.length}</h2>
            <Register label="Businesses by commission" minWidth={1180} maxHeight="70vh">
              <RegisterHead>
                <RegisterTh first>Business</RegisterTh><RegisterTh>Commission</RegisterTh><RegisterTh>Cumulative</RegisterTh>
                <RegisterTh>Premium</RegisterTh><RegisterTh>Emails sent / mo</RegisterTh><RegisterTh>Requests / mo</RegisterTh>
                <RegisterTh>Commission per email</RegisterTh><RegisterTh>Largest request type, since {fmtDate(s.requestsFrom)}</RegisterTh><RegisterTh>Claims</RegisterTh>
                <RegisterTh>Loss ratio</RegisterTh><RegisterTh last>Next renewal</RegisterTh>
              </RegisterHead>
              <tbody>
                {data.rows.map((r, k) => {
                  const largest = REQUEST_TYPES.filter(t => r.byType[t] > 0).sort((a, b) => r.byType[b] - r.byType[a])[0]
                  const edge = k > 0 && data.rows[k - 1].top && !r.top
                  return (
                    <RegisterRow key={r.id} style={edge ? { borderTop: '2px solid var(--trs-ink, #0f1412)' } : undefined}>
                      <RegisterCell first primary={<Link href={`/companies/${r.id}?tab=knowledge`} className="no-underline hover:underline text-trs-ink">{r.name}</Link>} secondary={r.top ? `#${r.rank} · top 20%` : `#${r.rank}`} />
                      <RegisterCell>{money(r.commission, { dp: 0 })}</RegisterCell>
                      <RegisterCell>{pct(r.cumulative)}</RegisterCell>
                      <RegisterCell>{money(r.premium, { dp: 0 })}</RegisterCell>
                      <RegisterCell>{r.perMonth.sent}</RegisterCell>
                      <RegisterCell>{r.perMonth.requests}</RegisterCell>
                      <RegisterCell>{r.commissionPerEmail != null ? money(r.commissionPerEmail, { dp: 0 }) : '—'}</RegisterCell>
                      <RegisterCell>{largest ? `${largest} ${r.byType[largest]}` : '—'}</RegisterCell>
                      <RegisterCell>{r.claims || '—'}</RegisterCell>
                      <RegisterCell title={r.claims ? `${r.claimsWithAmount} of ${r.claims} claims carry a paid amount` : undefined}>{r.lossRatio != null ? `${pct(r.lossRatio, 0)} (${r.claimsWithAmount}/${r.claims})` : '—'}</RegisterCell>
                      <RegisterCell last>{r.nextRenewal ? fmtDate(r.nextRenewal) : '—'}</RegisterCell>
                    </RegisterRow>
                  )
                })}
              </tbody>
            </Register>
          </section>
          <p className="m-0 mt-6 text-[12.5px] text-trs-subtle">
            Commission {money(s.commission, { dp: 0 })} from debit notes{data.from ? ` since ${fmtDate(data.from)}` : ''}, SGD only{s.usd.notes ? `; ${s.usd.notes} USD note${s.usd.notes === 1 ? '' : 's'} (US$${Math.round(s.usd.commission).toLocaleString('en-SG')}) apart` : ''}. Emails since {fmtDate(s.emailsFrom)}; requests since {fmtDate(s.requestsFrom)}.
          </p>

        </>)}
      </div>
    </div>
  )
}
