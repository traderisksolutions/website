'use client'

/**
 * One business's numbers from the portfolio (src/lib/clients/portfolio.ts), last 12 months: its
 * rank by commission, what it earns, the admin it takes by request type, claims and renewal.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtDate, money } from '@/lib/format'
import { REQUEST_TYPES, type Portfolio } from '@/lib/clients/portfolio'

export function BusinessNumbers({ companyId }: { companyId: string }) {
  const [p, setP] = useState<Portfolio | null>(null)
  useEffect(() => {
    fetch(`/api/clients/portfolio?window=12m&business=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(setP).catch(() => setP(null))
  }, [companyId])
  const r = p?.rows[0]
  if (!p || !r) return null
  const types = REQUEST_TYPES.filter(t => r.byType[t] > 0).sort((a, b) => r.byType[b] - r.byType[a])
  const items: [string, React.ReactNode][] = [
    ['Rank by commission', <><Link href="/companies/portfolio" className="text-trs-ink">#{r.rank}</Link> of {p.summary.businesses}{r.top ? ' · top 20%' : ''}</>],
    ['Commission, 12 months', `${money(r.commission, { dp: 0 })} · ${(r.share * 100).toFixed(1)}%`],
    ['Premium billed', money(r.premium, { dp: 0 })],
    ['Emails sent a month', `${r.perMonth.sent}${r.commissionPerEmail != null ? ` · ${money(r.commissionPerEmail, { dp: 0 })} commission each` : ''}`],
    ['Requests a month', `${r.perMonth.requests}${types.length ? ` · since ${fmtDate(p.summary.requestsFrom)}: ${types.map(t => `${t} ${r.byType[t]}`).join(' · ')}` : ''}`],
    ['Claims', r.claims ? `${r.claims}${r.lossRatio != null ? ` · loss ratio ${(r.lossRatio * 100).toFixed(0)}% (${r.claimsWithAmount} of ${r.claims} paid)` : ''}` : '—'],
    ['Next renewal', r.nextRenewal ? fmtDate(r.nextRenewal) : '—'],
  ]
  return (
    <section className="mb-4 min-w-0" aria-label="Business numbers">
      <h2 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-trs-muted">Numbers</h2>
      <dl className="m-0 grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
        {items.map(([k, v]) => <div key={k} className="contents"><dt className="text-trs-muted">{k}</dt><dd className="m-0 tabular-nums text-trs-ink">{v}</dd></div>)}
      </dl>
    </section>
  )
}
