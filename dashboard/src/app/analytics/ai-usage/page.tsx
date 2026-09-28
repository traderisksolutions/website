'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { Btn, Segmented } from '@/components/crm/primitives'
import { StatCard } from '@/components/stat-card'

type UsageRow = {
  id: string; created_at: string; feature: string
  provider: string | null; model: string | null
  input_tokens: number; output_tokens: number; cost_usd: number
}
type Range = '7d' | '30d' | '90d'
type Dim = 'area' | 'model'
type Metric = 'tokens' | 'cost'

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

// Series are ink first, then a grey ramp — categories are told apart by the legend, not by hue.
const SERIES = ['#202124', '#5f6368', '#80868b', '#9aa0a6', '#bdc1c6', '#dadce0', '#e8eaed', '#f1f3f4', '#f8f9fa']
const seriesColor = (i: number) => SERIES[Math.min(i, SERIES.length - 1)]

// ── Dimensions ────────────────────────────────────────────────────────────────

type Cat = { key: string; label: string; desc: string }

const AREAS: Cat[] = [
  { key: 'engagement', label: 'Engagement', desc: 'Thread summaries, reply drafting, and inbound auto-drafts in the Engagement inbox.' },
  { key: 'nexus',      label: 'Nexus',      desc: 'Grand analysis (synthesis + Opus strategy) and the Ask-Opus consultant chat.' },
  { key: 'rfq',        label: 'RFQ',        desc: 'Client recommendation drafting and the per-line quote decision.' },
  { key: 'outbound',   label: 'Outbound',   desc: 'Company-name extraction during outbound prospecting.' },
  { key: 'leads',      label: 'Leads',      desc: 'Analysis of new inbound website enquiries.' },
  { key: 'knowledge',  label: 'Knowledge',  desc: 'Embedding cost for indexing Google Drive knowledge docs.' },
  { key: 'other',      label: 'Other',      desc: 'Uncategorised usage.' },
]
const AREA_OF_FEATURE: Record<string, string> = {
  auto_summarize: 'engagement', draft_reply: 'engagement', draft_reply_drafter: 'engagement', draft_reply_editor: 'engagement',
  refresh_summary: 'engagement', summarize: 'engagement', rag_draft_reply: 'engagement', inbound_auto_draft: 'engagement', draft_email: 'engagement',
  nexus_synthesis: 'nexus', nexus_strategy: 'nexus', chat_consultant: 'nexus',
  rfq_recommend: 'rfq', rfq_quote_decision: 'rfq',
  outbound_search: 'outbound',
  email_analysis: 'leads',
  rag_index: 'knowledge',
}

const MODELS: Cat[] = [
  { key: 'claude-opus-4-8',        label: 'Opus 4.8',              desc: 'Claude Opus 4.8 — Nexus strategy, quote decisions, consultant chat, recommendations. $5 / $25 per 1M.' },
  { key: 'gemini-3.6-flash',       label: 'Gemini 3.6 Flash',      desc: 'Gemini 3.6 Flash (Flash tier) — drafting, analysis, extraction, synthesis. $1.50 / $7.50 per 1M.' },
  { key: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',        desc: 'Gemini 3.1 Pro (Pro tier) — RFQ recommendation + quote-decision reasoning. $2 / $12 per 1M.' },
  { key: 'gemini-3.1-flash-lite',  label: 'Gemini 3.1 Flash-Lite', desc: 'Gemini 3.1 Flash-Lite (Lite tier) — high-volume classification, RFQ chase, auto-draft, auto-summarize, outbound, evals. $0.25 / $1.50 per 1M.' },
  { key: 'gemini-3.5-flash',       label: 'Gemini 3.5 Flash',      desc: 'Gemini 3.5 Flash (retired) — historical rows. $1.50 / $9 per 1M.' },
  { key: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro',        desc: 'Gemini 2.5 Pro (retired) — historical Nexus synthesis + RFQ reasoning rows. $1.25 / $10 per 1M.' },
  { key: 'gemini-2.5-flash',       label: 'Gemini 2.5 Flash',      desc: 'Gemini 2.5 Flash (retired) — historical rows. $0.30 / $2.50 per 1M.' },
  { key: 'gemini-embedding-001',   label: 'Embedding',             desc: 'gemini-embedding-001 — RAG indexing (priced per character).' },
  { key: 'other',                  label: 'Other',                 desc: 'Unlabelled model (legacy rows).' },
]

function catOf(row: UsageRow, dim: Dim): string {
  if (dim === 'area') return AREA_OF_FEATURE[row.feature] ?? 'other'
  const m = row.model ?? ''
  return MODELS.some(c => c.key === m) ? m : 'other'
}

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<Range, string> = { '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days' }
const SGD_PER_USD = 1.35

function fmtCost(n: number)    { return n < 0.01 ? `$${(n * 100).toFixed(3)}¢` : `$${n.toFixed(4)}` }
function fmtCostSGD(n: number) { const s = n * SGD_PER_USD; return s < 0.01 ? `S$${(s*100).toFixed(3)}¢` : `S$${s.toFixed(4)}` }
function fmtTokens(n: number)  { return n >= 1_000_000 ? `${(n/1e6).toFixed(2)}M` : n >= 1_000 ? `${(n/1e3).toFixed(1)}K` : String(n) }

async function fetchUsage(days: number): Promise<UsageRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const res = await fetch(`/api/analytics/ai-usage?since=${encodeURIComponent(since)}`, { cache: 'no-store' })
  return res.ok ? res.json() : []
}

type DayBucket = { date: string; total: number; cost: number } & Record<string, number>

function bucketByDay(rows: UsageRow[], dim: Dim): DayBucket[] {
  const map = new Map<string, DayBucket>()
  for (const row of rows) {
    const date = row.created_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { date, total: 0, cost: 0 } as DayBucket)
    const b = map.get(date)!
    const cat = catOf(row, dim)
    const tok = row.input_tokens + row.output_tokens
    b[cat] = (b[cat] ?? 0) + tok
    b.total += tok
    b.cost += row.cost_usd
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

const AXIS_TICK = { fontSize: 11, fill: '#9aa0a6' }
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 10, border: '1px solid #dadce0', boxShadow: 'none', color: INK }

export default function AIUsagePage() {
  const [rows,    setRows]    = useState<UsageRow[]>([])
  const [range,   setRange]   = useState<Range>('30d')
  const [dim,     setDim]     = useState<Dim>('area')
  const [metric,  setMetric]  = useState<'tokens' | 'cost'>('cost')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); const data = await fetchUsage(RANGE_DAYS[range]); setRows(data); setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const cats = dim === 'area' ? AREAS : MODELS
  const chartData = useMemo(() => bucketByDay(rows, dim), [rows, dim])

  // Categories that actually have data (drives bars + legend + the breakdown key).
  const catTotals = useMemo(() => {
    const t = new Map<string, { tok: number; cost: number }>()
    for (const r of rows) {
      const k = catOf(r, dim)
      const e = t.get(k) ?? { tok: 0, cost: 0 }
      e.tok += r.input_tokens + r.output_tokens; e.cost += r.cost_usd
      t.set(k, e)
    }
    return t
  }, [rows, dim])
  const presentCats = cats.filter(c => catTotals.has(c.key))
  const colorOf = (key: string) => seriesColor(presentCats.findIndex(c => c.key === key))

  const totalTok  = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0)
  const totalCall = rows.length
  const topCat    = presentCats.slice().sort((a, b) => (catTotals.get(b.key)!.cost) - (catTotals.get(a.key)!.cost))[0]

  const STAT_CARDS = [
    { label: 'Total cost',   value: fmtCost(totalCost),  sub: `${fmtCostSGD(totalCost)} · ${RANGE_LABEL[range]}` },
    { label: 'Total tokens', value: fmtTokens(totalTok), sub: `${totalCall.toLocaleString()} calls` },
    { label: 'Top ' + (dim === 'area' ? 'area' : 'model'), value: topCat?.label ?? '—', sub: topCat ? fmtCost(catTotals.get(topCat.key)!.cost) : '' },
    { label: 'Average per call', value: fmtTokens(totalCall ? Math.round(totalTok / totalCall) : 0), sub: 'tokens per request' },
  ]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">AI usage</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${totalCall.toLocaleString()} call${totalCall === 1 ? '' : 's'} · ${fmtCost(totalCost)} · ${RANGE_LABEL[range]}`}
            </p>
          </div>
          <Btn level="secondary" onClick={load} loading={loading}>
            {!loading && <RefreshCw size={13} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {/* Controls */}
        <div className="mt-6 mb-6 flex items-center gap-2 flex-wrap">
          <Segmented<Dim> value={dim} onChange={setDim} options={[{ value: 'area', label: 'By product area' }, { value: 'model', label: 'By model' }]} />
          <Segmented<Metric> value={metric} onChange={setMetric} options={[{ value: 'cost', label: 'Cost' }, { value: 'tokens', label: 'Tokens' }]} />
          <Segmented<Range> value={range} onChange={setRange} options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' }]} />
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          {STAT_CARDS.map(card => (
            <StatCard key={card.label} label={card.label} value={card.value} sublabel={card.sub} loading={loading} />
          ))}
        </div>

        {/* Chart */}
        <section className="mb-10">
          <h2 className="m-0 mb-4 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
            {metric === 'cost' ? 'Cost per day' : 'Tokens per day'}
          </h2>
          {loading ? (
            <div className="h-[300px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />
          ) : chartData.length === 0 ? (
            <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No usage in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              {metric === 'tokens' ? (
                <BarChart data={chartData} barSize={18}>
                  <CartesianGrid vertical={false} stroke={RULE} />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false}
                    tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false}
                    tickFormatter={v => fmtTokens(Number(v))} width={48} />
                  <Tooltip cursor={{ fill: FIELD }}
                    formatter={(v, name) => [fmtTokens(Number(v)), cats.find(c => c.key === name)?.label ?? String(name)]}
                    labelFormatter={l => `Date: ${l}`}
                    contentStyle={TOOLTIP_STYLE} />
                  <Legend formatter={name => cats.find(c => c.key === name)?.label ?? name} wrapperStyle={{ fontSize: 12, paddingTop: 8, color: MUTED }} iconType="square" iconSize={10} />
                  {presentCats.map((c, i) => (
                    <Bar key={c.key} dataKey={c.key} stackId="a" fill={seriesColor(i)} />
                  ))}
                </BarChart>
              ) : (
                <BarChart data={chartData} barSize={24}>
                  <CartesianGrid vertical={false} stroke={RULE} />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false}
                    tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${(Number(v)).toFixed(4)}`} width={60} />
                  <Tooltip cursor={{ fill: FIELD }}
                    formatter={v => [`$${Number(v).toFixed(6)} · S$${(Number(v)*SGD_PER_USD).toFixed(6)}`, 'Cost']}
                    labelFormatter={l => `Date: ${l}`}
                    contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="cost" fill={INK} radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </section>

        {/* Breakdown key (by the active dimension) */}
        <section>
          <h2 className="m-0 mb-1 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
            Breakdown by {dim === 'area' ? 'product area' : 'model'}
          </h2>
          {loading ? (
            <div className="h-24 rounded-[16px] animate-pulse mt-3" style={{ background: FIELD }} />
          ) : presentCats.length === 0 ? (
            <p className="m-0 py-10 text-center text-[15px]" style={{ color: MUTED }}>No usage in this period.</p>
          ) : (
            <div className="border-t" style={{ borderColor: RULE }}>
              {presentCats.map(c => {
                const e = catTotals.get(c.key)!
                return (
                  <div key={c.key} className="flex gap-3 items-start py-3 border-b" style={{ borderColor: RULE }}>
                    <span className="w-2.5 h-2.5 rounded-[2px] flex-shrink-0 mt-[5px]" style={{ background: colorOf(c.key), outline: '1px solid #dadce0' }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <p className="m-0 text-[14px]" style={{ color: INK }}>{c.label}</p>
                        <p className="m-0 text-[13px] tabular-nums" style={{ color: MUTED }}>{fmtCost(e.cost)} · {fmtTokens(e.tok)} tokens</p>
                      </div>
                      <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: MUTED }}>{c.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
