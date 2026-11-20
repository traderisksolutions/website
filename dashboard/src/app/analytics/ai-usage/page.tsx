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
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import { AGENTS, agentLabel, agentOfFeature, type AgentId } from '@/lib/ai-agents'

// Chart values for the library; the page itself draws with token classes.
const INK = 'var(--trs-ink)'
const FAINT = 'var(--trs-subtle)'
const RULE = 'var(--trs-line)'
const LINE_2 = 'var(--trs-line-2)'

// One ink ramp, in the order agents are listed. Categories are read from the row label, not a hue.
const AGENT_ORDER: AgentId[] = ['placement', 'benefits_admin', 'crm', 'askai', 'group_benefit', 'pricingmatrix', 'housekeeping', 'admin', 'unattributed']
const AGENT_INK: Record<AgentId, string> = {
  placement: 'var(--trs-green)', benefits_admin: 'var(--trs-muted)', crm: 'var(--trs-ink)', askai: 'var(--trs-muted)', group_benefit: 'var(--trs-ink-2)', pricingmatrix: 'var(--trs-subtle)', housekeeping: 'var(--trs-subtle)', admin: 'var(--trs-ink-2)', unattributed: 'var(--trs-line-2)',
}
const AGENT_DOT: Record<AgentId, string> = {
  placement: 'bg-trs-green', benefits_admin: 'bg-trs-muted', crm: 'bg-trs-ink', askai: 'bg-trs-muted', group_benefit: 'bg-trs-ink-2', pricingmatrix: 'bg-trs-subtle', housekeeping: 'bg-trs-subtle', admin: 'bg-trs-ink-2', unattributed: 'bg-trs-line-2',
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
  'claude-opus-5-5':        '$5.00 / $25.00 per 1M (unconfirmed)',
  'unrecorded':             'model not written to the row',
}


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
        <header className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-trs-line">
          <div>
            <h1 className="text-heading font-medium text-trs-ink">AI spend</h1>
            <p className="mt-1.5 text-body text-trs-muted">
              {loading && !d ? 'Reading the ledger…' : (
                <>
                  <span className="tabular-nums font-medium text-trs-ink">{usd(d?.total.cost ?? 0)}</span>
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
        <p className="pt-3 text-small text-trs-subtle">
          Ledger runs {date(d?.ledgerFirst ?? null)} to {date(d?.ledgerLast ?? null)}.
          {d?.truncated ? ' Read stopped at 100,000 rows.' : ''}
        </p>

        {err && (
          <div className="mt-5 rounded px-3.5 py-3 text-body border border-trs-line-2 text-trs-ink">
            {err}
          </div>
        )}

        {loading && !d && <div className="py-16"><Spinner label="Loading spend" /></div>}

        {d && !hasSpend && (
          <div className="mt-6">
            <SectionCard title="Nothing recorded in this window">
              <div className="text-body leading-relaxed text-trs-muted">
                <p>The ledger holds no rows for the last {d.days} days.</p>
                <p className="mt-2">
                  Writes stopped between {date(d.ledgerFirst)} and {date(d.ledgerLast)} because every
                  insert carrying a <code className="text-small">metadata</code> field was rejected and the
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
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={RULE} />
                    <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11, fill: FAINT }}
                           axisLine={{ stroke: RULE }} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => usd(v)} tick={{ fontSize: 11, fill: FAINT }}
                           axisLine={false} tickLine={false} width={78} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 7, border: `1px solid ${LINE_2}`, boxShadow: 'none', color: INK }}
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
              <Register label="By agent" minWidth={560}>
                <RegisterHead>
                  <RegisterTh first>Agent</RegisterTh>
                  <RegisterTh>Model</RegisterTh>
                  <RegisterTh>Calls</RegisterTh>
                  <RegisterTh>Tokens</RegisterTh>
                  <RegisterTh last>Cost</RegisterTh>
                </RegisterHead>
                <tbody>
                  {agents.map(({ id, row }) => {
                    const spec = id === 'unattributed' ? null : AGENTS[id]
                    return (
                      <RegisterRow key={id}>
                        <RegisterCell first nowrap={false}>
                          <span className="inline-flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${AGENT_DOT[id]}`} />
                            <span className="text-trs-ink">{agentLabel(id)}</span>
                          </span>
                          <div className="mt-0.5 text-small pl-4 text-trs-subtle">
                            {spec ? spec.work : 'Logged under a feature no agent claims.'}
                          </div>
                        </RegisterCell>
                        <RegisterCell align="left" className="text-trs-muted">{spec?.model ?? '—'}</RegisterCell>
                        <RegisterCell className="tabular-nums text-trs-muted">{(row?.calls ?? 0).toLocaleString()}</RegisterCell>
                        <RegisterCell className="tabular-nums text-trs-muted">{tok((row?.input ?? 0) + (row?.output ?? 0))}</RegisterCell>
                        <RegisterCell last className="tabular-nums text-trs-ink">{usd(row?.cost ?? 0)}</RegisterCell>
                      </RegisterRow>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="row-total">
                    <RegisterCell first className="font-medium text-trs-ink">Total</RegisterCell>
                    <RegisterCell />
                    <RegisterCell className="tabular-nums font-medium text-trs-ink">{d.total.calls.toLocaleString()}</RegisterCell>
                    <RegisterCell className="tabular-nums font-medium text-trs-ink">{tok(d.total.input + d.total.output)}</RegisterCell>
                    <RegisterCell last className="tabular-nums font-medium text-trs-ink">{usd(d.total.cost)} · {sgd(d.total.cost)}</RegisterCell>
                  </tr>
                </tfoot>
              </Register>
            </SectionCard>

            <SectionCard title="By model">
              <Register label="By model" minWidth={560}>
                <RegisterHead>
                  <RegisterTh first>Model</RegisterTh>
                  <RegisterTh>Rate</RegisterTh>
                  <RegisterTh>Calls</RegisterTh>
                  <RegisterTh>In</RegisterTh>
                  <RegisterTh>Out</RegisterTh>
                  <RegisterTh last>Cost</RegisterTh>
                </RegisterHead>
                <tbody>
                  {d.models.map(m => (
                    <RegisterRow key={m.key}>
                      <RegisterCell first className="text-trs-ink">{m.key}</RegisterCell>
                      <RegisterCell align="left" className="text-trs-subtle">{MODEL_RATE[m.key] ?? '—'}</RegisterCell>
                      <RegisterCell className="tabular-nums text-trs-muted">{m.calls.toLocaleString()}</RegisterCell>
                      <RegisterCell className="tabular-nums text-trs-muted">{tok(m.input)}</RegisterCell>
                      <RegisterCell className="tabular-nums text-trs-muted">{tok(m.output)}</RegisterCell>
                      <RegisterCell last className="tabular-nums text-trs-ink">{usd(m.cost)}</RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            </SectionCard>

            <SectionCard title="By feature">
              {d.features.length === 0 ? <Empty compact>Nothing recorded.</Empty> : (
                <Register label="By feature" minWidth={560}>
                  <RegisterHead>
                    <RegisterTh first>Feature</RegisterTh>
                    <RegisterTh>Agent</RegisterTh>
                    <RegisterTh>Calls</RegisterTh>
                    <RegisterTh>Cost</RegisterTh>
                    <RegisterTh last>Per call</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {d.features.map(f => (
                        <RegisterRow key={f.key}>
                          <RegisterCell first className="text-trs-ink">{f.key}</RegisterCell>
                          <RegisterCell align="left" className="text-trs-muted">{agentLabel(agentOfFeature(f.key))}</RegisterCell>
                          <RegisterCell className="tabular-nums text-trs-muted">{f.calls.toLocaleString()}</RegisterCell>
                          <RegisterCell className="tabular-nums text-trs-ink">{usd(f.cost)}</RegisterCell>
                          <RegisterCell last className="tabular-nums text-trs-subtle">{usd(f.calls ? f.cost / f.calls : 0)}</RegisterCell>
                        </RegisterRow>
                    ))}
                  </tbody>
                </Register>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}
