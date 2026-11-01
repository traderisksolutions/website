'use client'

/**
 * Autonomy: the share of outgoing mail that came from an agent's draft, against the 80% target.
 * The figure sits in the page's own header line; every section is a table.
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Btn, Segmented, SectionCard, Spinner } from '@/components/crm/primitives'
import type { Bucket, Metrics } from '@/lib/analytics/autonomy/metrics'

const INK = '#0f1412'
const MUTED = '#4a5550'
const FAINT = '#6f7a74'
const RULE = '#e6e8e4'

type Payload = Metrics & { days: number; target: number; computedThrough: string | null; error?: string }

const pct = (n: number | null | undefined) => n == null ? '—' : `${Math.round(n * 100)}%`
const date = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) : '—'
const label = (k: string) => k.replace(/_/g, ' ')

const th = 'text-left text-[11px] uppercase tracking-[0.04em] font-medium pb-2'
const td = 'py-2.5 text-[13px] align-top'
const num = 'py-2.5 text-[13px] text-right tabular-nums align-top'

function Rows({ rows, first, extra }: { rows: Bucket[]; first: string; extra?: (b: Bucket) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto"><table className="trs-table w-full min-w-[640px]">
      <thead>
        <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
          <th className={th}>{first}</th>
          <th className={`${th} text-right`}>Share</th>
          <th className={`${th} text-right`}>Effort share</th>
          <th className={`${th} text-right`}>Messages</th>
          <th className={`${th} text-right`}>Agent, approved</th>
          <th className={`${th} text-right`}>Agent, auto</th>
          <th className={`${th} text-right`}>Hand written</th>
          <th className={`${th} text-right`}>Sent unedited</th>
          {extra && <th className={th}></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(b => (
          <tr key={b.key} style={{ borderBottom: `1px solid ${RULE}` }}>
            <td className={td} style={{ color: INK }}>{b.label}</td>
            <td className={num} style={{ color: INK }}>{pct(b.share)}</td>
            <td className={num} style={{ color: MUTED }}>{pct(b.effortShare)}</td>
            <td className={num} style={{ color: MUTED }}>{b.messages.toLocaleString()}</td>
            <td className={num} style={{ color: MUTED }}>{b.agent - b.auto}</td>
            <td className={num} style={{ color: MUTED }}>{b.auto}</td>
            <td className={num} style={{ color: MUTED }}>{b.hand}</td>
            <td className={num} style={{ color: MUTED }}>{pct(b.uneditedRate)}</td>
            {extra && <td className={td} style={{ color: MUTED }}>{extra(b)}</td>}
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

export default function AutonomyPage() {
  const [d, setD] = useState<Payload | null>(null)
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/analytics/autonomy?days=${days}`, { cache: 'no-store' })
      const j = await res.json() as Payload
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); setD(null) } else setD(j)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Request failed') }
    finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  const week = d?.thisWeek

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-8 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Autonomy</h1>
            <p className="mt-1.5 text-[14px]" style={{ color: MUTED }}>
              {loading && !d ? 'Reading…' : (
                <>
                  <span className="tabular-nums font-medium" style={{ color: INK }}>{pct(week?.share ?? d?.total.share)}</span>
                  <span className="mx-1.5">·</span><span>target {pct(d?.target ?? 0.8)}</span>
                  <span className="mx-1.5">·</span><span className="tabular-nums">{week ? `${week.messages} messages this week` : `${d?.total.messages ?? 0} messages`}</span>
                  <span className="mx-1.5">·</span><span className="tabular-nums">{pct(d?.total.share)} over {d?.days ?? days} days</span>
                  <span className="mx-1.5">·</span><span>computed through {date(d?.computedThrough ?? null)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented value={String(days)} onChange={v => setDays(Number(v))} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '180 days' }]} />
            <Btn level="tertiary" onClick={load} aria-label="Reload"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></Btn>
          </div>
        </header>

        <p className="pt-3 text-[12px]" style={{ color: FAINT }}>
          Share = messages sent from an agent's draft over all outgoing messages; internal mail and the agent mailboxes are left out. Effort weights each message by its own words plus 40 per file. Unedited = less than a tenth of the draft changed. {d ? `${d.excluded} messages excluded.` : ''}
        </p>

        {err && <div className="mt-5 rounded-[10px] px-3.5 py-3 text-[13px]" style={{ border: '1px solid #d5d9d4', color: INK }}>{err}</div>}
        {loading && !d && <div className="py-16"><Spinner label="Loading" /></div>}

        {d && (
          <div className="mt-6 space-y-6">
            <SectionCard title="By week"><Rows rows={[...d.byWeek].reverse()} first="Week of" /></SectionCard>
            <SectionCard title="By class of work">
              <Rows rows={d.byClass} first="Class" extra={b => b.personOnly ? 'person only' : ''} />
            </SectionCard>
            <SectionCard title="By sender"><Rows rows={d.bySender} first="Sender" /></SectionCard>
            <SectionCard title="By client"><Rows rows={d.byClient} first="Client" /></SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}
