'use client'

/**
 * AI spend.
 *
 * Rebuilt 1 Oct 2026. The figure is in the page's own header line, not in a row of tiles, and
 * every section is a table of what was spent on what. The ledger's own date range is stated
 * because a month reading zero is usually a month that was not recorded, and the page should say
 * which it was rather than imply the work was free.
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { Btn, Segmented, SectionCard, Empty, Spinner } from '@/components/crm/primitives'
import { AGENTS, agentLabel, agentOfFeature, type AgentId } from '@/lib/ai-agents'

const INK = '#202124'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const RULE = '#e8eaed'

// One ink ramp, in the order agents are listed. Categories are read from the row label, not a hue.
const AGENT_ORDER: AgentId[] = ['crm', 'askai', 'groupbenefits', 'housekeeping', 'unattributed']
const AGENT_INK: Record<AgentId, string> = {
  crm: '#202124', askai: '#5f6368', groupbenefits: '#80868b', housekeeping: '#9aa0a6', unattributed: '#dadce0',
}

type Bucket = { key: string; calls: number; input: number; output: number; cost: number; failures: number }
type Payload = {
  days: number
  total: Omit<Bucket, 'key'>
  truncated: boolean
  ledgerFirst: string | null
  ledgerLast: string | null
  agents: Bucket[]
  models: Bucket[]
  features: Bucket[]
  daily: Record<string, number | string>[]
  error?: string
}

const SGD_PER_USD = 1.35
const usd = (n: number) => n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(5)}`
const sgd = (n: number) => { const s = n * SGD_PER_USD; return s >= 1 ? `S$${s.toFixed(2)}` : `S$${s.toFixed(4)}` }
const tok = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)
const day = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
const date = (s: string | null) => s ? new Date(s).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/** Model names the ledger holds, with what they cost, so a row can be read without a price list. */
const MODEL_RATE: Record<string, string> = {
  'gemini-3.8-flash':       '$0.75 / $3.75 per 1M',
  'gemini-3.6-flash':       '$0.75 / $3.75 per 1M',
  'gemini-3.5-flash-lite':  '$0.30 / $2.50 per 1M',
  'gemini-3.5-flash':       '$1.50 / $9.00 per 1M',
  'gemini-3.1-pro-preview': '$2.00 / $12.00 per 1M',
  'gemini-3.1-flash-lite':  '$0.25 / $1.50 per 1M',
  'gemini-embedding-001':   '$0.15 per 1M input',
  'claude-opus-4-8':        '$5.00 / $25.00 per 1M',
  'unrecorded':             'model not written to the row',
}

const th = 'text-left text-[11px] uppercase tracking-[0.04em] font-medium pb-2'
const td = 'py-2.5 text-[13px] align-top'
const num = 'py-2.5 text-[13px] text-right tabular-nums align-top'

export default function AISpendPage() {
  const [d, setD] = useState<Payload | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/analytics/ai-usage?days=${days}`, { cache: 'no-store' })
      const j = await res.json() as Payload
      if (!res.ok || j.error) { setErr(j.error ?? `Request failed (${res.status})`); setD(null) }
      else setD(j)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const agents = useMemo(() => {
    const m = new Map((d?.agents ?? []).map(a => [a.key, a]))
    return AGENT_ORDER
      .map(id => ({ id, row: m.get(id) }))
      .filter(x => x.row || x.id !== 'unattributed')
  }, [d])

  const chart = d?.daily ?? []
  const hasSpend = (d?.total.cost ?? 0) > 0

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-8 sm:py-10">

        {/* The figure lives in the page's own header line. */}
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5" style={{ borderBottom: `1px solid ${RULE}` }}>
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.01em]" style={{ color: INK }}>AI spend</h1>
            <p className="mt-1.5 text-[14px]" style={{ color: MUTED }}>
              {loading && !d ? 'Reading the ledger…' : (
                <>
                  <span className="tabular-nums font-medium" style={{ color: INK }}>{usd(d?.total.cost ?? 0)}</span>
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">{sgd(d?.total.cost ?? 0)}</span>
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">{(d?.total.calls ?? 0).toLocaleString()} calls</span>
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">{tok((d?.total.input ?? 0) + (d?.total.output ?? 0))} tokens</span>
                  <span className="mx-1.5">·</span>
                  <span>last {d?.days ?? days} days</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              value={String(days)}
              onChange={v => setDays(Number(v))}
              options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
            />
            <Btn level="tertiary" onClick={load} aria-label="Reload">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Btn>
          </div>
        </header>

        {/* What the ledger actually covers. A zero month is usually an unrecorded one. */}
        <p className="pt-3 text-[12px]" style={{ color: FAINT }}>
          Ledger runs {date(d?.ledgerFirst ?? null)} to {date(d?.ledgerLast ?? null)}.
          {d?.truncated ? ' Read stopped at 100,000 rows.' : ''}
        </p>

        {err && (
          <div className="mt-5 rounded-[10px] px-3.5 py-3 text-[13px]" style={{ border: `1px solid #dadce0`, color: INK }}>
            {err}
          </div>
        )}

        {loading && !d && <div className="py-16"><Spinner label="Loading spend" /></div>}

        {d && !hasSpend && (
          <div className="mt-6">
            <SectionCard title="Nothing recorded in this window">
              <div className="text-[13px] leading-relaxed" style={{ color: MUTED }}>
                <p>The ledger holds no rows for the last {d.days} days.</p>
                <p className="mt-2">
                  Writes stopped between {date(d.ledgerFirst)} and {date(d.ledgerLast)} because every
                  insert carrying a <code className="text-[12px]">metadata</code> field was rejected and the
                  failure was never checked. Work done in that period is not recoverable — it was
                  never written.
                </p>
              </div>
            </SectionCard>
          </div>
        )}

        {d && hasSpend && (
          <div className="mt-6 space-y-6">

            <SectionCard title="Daily cost by agent">
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={RULE} />
                    <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11, fill: FAINT }}
                           axisLine={{ stroke: RULE }} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => usd(v)} tick={{ fontSize: 11, fill: FAINT }}
                           axisLine={false} tickLine={false} width={78} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid #dadce0`, boxShadow: 'none', color: INK }}
                      labelFormatter={(l) => (typeof l === 'string' ? day(l) : String(l ?? ''))}
                      formatter={(v, n) => [usd(Number(v) || 0), agentLabel(String(n) as AgentId)]}
                    />
                    {AGENT_ORDER.map(id => (
                      <Bar key={id} dataKey={id} stackId="c" fill={AGENT_INK[id]} radius={[2, 2, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="By agent">
              <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead>
                  <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                    <th className={th}>Agent</th>
                    <th className={th}>Model</th>
                    <th className={`${th} text-right`}>Calls</th>
                    <th className={`${th} text-right`}>Tokens</th>
                    <th className={`${th} text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(({ id, row }) => {
                    const spec = id === 'unattributed' ? null : AGENTS[id]
                    return (
                      <tr key={id} style={{ borderBottom: `1px solid ${RULE}` }}>
                        <td className={td}>
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: AGENT_INK[id] }} />
                            <span style={{ color: INK }}>{agentLabel(id)}</span>
                          </span>
                          <div className="mt-0.5 text-[12px] pl-4" style={{ color: FAINT }}>
                            {spec ? spec.work : 'Logged under a feature no agent claims.'}
                          </div>
                        </td>
                        <td className={td} style={{ color: MUTED }}>{spec?.model ?? '—'}</td>
                        <td className={num} style={{ color: MUTED }}>{(row?.calls ?? 0).toLocaleString()}</td>
                        <td className={num} style={{ color: MUTED }}>{tok((row?.input ?? 0) + (row?.output ?? 0))}</td>
                        <td className={num} style={{ color: INK }}>{usd(row?.cost ?? 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className={`${td} font-medium`} style={{ color: INK }}>Total</td>
                    <td className={td} />
                    <td className={`${num} font-medium`} style={{ color: INK }}>{d.total.calls.toLocaleString()}</td>
                    <td className={`${num} font-medium`} style={{ color: INK }}>{tok(d.total.input + d.total.output)}</td>
                    <td className={`${num} font-medium`} style={{ color: INK }}>{usd(d.total.cost)} · {sgd(d.total.cost)}</td>
                  </tr>
                </tfoot>
              </table></div>
            </SectionCard>

            <SectionCard title="By model">
              <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead>
                  <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                    <th className={th}>Model</th>
                    <th className={th}>Rate</th>
                    <th className={`${th} text-right`}>Calls</th>
                    <th className={`${th} text-right`}>In</th>
                    <th className={`${th} text-right`}>Out</th>
                    <th className={`${th} text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {d.models.map(m => (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${RULE}` }}>
                      <td className={td} style={{ color: INK }}>{m.key}</td>
                      <td className={td} style={{ color: FAINT }}>{MODEL_RATE[m.key] ?? '—'}</td>
                      <td className={num} style={{ color: MUTED }}>{m.calls.toLocaleString()}</td>
                      <td className={num} style={{ color: MUTED }}>{tok(m.input)}</td>
                      <td className={num} style={{ color: MUTED }}>{tok(m.output)}</td>
                      <td className={num} style={{ color: INK }}>{usd(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </SectionCard>

            <SectionCard title="By feature">
              {d.features.length === 0 ? <Empty compact>Nothing recorded.</Empty> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
                  <thead>
                    <tr style={{ color: FAINT, borderBottom: `1px solid ${RULE}` }}>
                      <th className={th}>Feature</th>
                      <th className={th}>Agent</th>
                      <th className={`${th} text-right`}>Calls</th>
                      <th className={`${th} text-right`}>Cost</th>
                      <th className={`${th} text-right`}>Per call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.features.map(f => (
                        <tr key={f.key} style={{ borderBottom: `1px solid ${RULE}` }}>
                          <td className={td} style={{ color: INK }}>{f.key}</td>
                          <td className={td} style={{ color: MUTED }}>{agentLabel(agentOfFeature(f.key))}</td>
                          <td className={num} style={{ color: MUTED }}>{f.calls.toLocaleString()}</td>
                          <td className={num} style={{ color: INK }}>{usd(f.cost)}</td>
                          <td className={num} style={{ color: FAINT }}>{usd(f.calls ? f.cost / f.calls : 0)}</td>
                        </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}
