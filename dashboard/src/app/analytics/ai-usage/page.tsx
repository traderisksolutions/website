'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Cpu, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type UsageRow = {
  id: string; created_at: string; feature: string
  provider: string | null; model: string | null
  input_tokens: number; output_tokens: number; cost_usd: number
}
type Range = '7d' | '30d' | '90d'
type Dim = 'area' | 'model'

// ── Dimensions ────────────────────────────────────────────────────────────────

type Cat = { key: string; label: string; color: string; desc: string }

const AREAS: Cat[] = [
  { key: 'engagement', label: 'Engagement', color: '#3b82f6', desc: 'Thread summaries, reply drafting, and inbound auto-drafts in the Engagement inbox.' },
  { key: 'nexus',      label: 'Nexus',      color: '#8b5cf6', desc: 'Grand analysis (synthesis + Opus strategy) and the Ask-Opus consultant chat.' },
  { key: 'rfq',        label: 'RFQ',        color: '#6366f1', desc: 'Client recommendation drafting and the per-line quote decision.' },
  { key: 'outbound',   label: 'Outbound',   color: '#ef4444', desc: 'Company-name extraction during outbound prospecting.' },
  { key: 'leads',      label: 'Leads',      color: '#f59e0b', desc: 'Analysis of new inbound website enquiries.' },
  { key: 'knowledge',  label: 'Knowledge',  color: '#f97316', desc: 'Embedding cost for indexing Google Drive knowledge docs.' },
  { key: 'other',      label: 'Other',      color: '#9ca3af', desc: 'Uncategorised usage.' },
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
  { key: 'claude-opus-4-8',     label: 'Opus 4.8',        color: '#8b5cf6', desc: 'Claude Opus 4.8 — Nexus strategy, quote decisions, consultant chat, recommendations. $5 / $25 per 1M.' },
  { key: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', color: '#10b981', desc: 'Gemini 3.1 Flash-Lite — all Gemini work (summaries, drafting, extraction, synthesis). $0.25 / $1.50 per 1M.' },
  { key: 'gemini-3.5-flash',    label: 'Gemini 3.5 Flash', color: '#14b8a6', desc: 'Gemini 3.5 Flash (retired) — historical rows. $1.50 / $9 per 1M.' },
  { key: 'gemini-2.5-pro',      label: 'Gemini 2.5 Pro',  color: '#3b82f6', desc: 'Gemini 2.5 Pro (retired) — historical Nexus synthesis + RFQ reasoning rows. $1.25 / $10 per 1M.' },
  { key: 'gemini-2.5-flash',    label: 'Gemini 2.5 Flash', color: '#22d3ee', desc: 'Gemini 2.5 Flash (retired) — historical rows. $0.30 / $2.50 per 1M.' },
  { key: 'gemini-embedding-001', label: 'Embedding',      color: '#f97316', desc: 'gemini-embedding-001 — RAG indexing (priced per character).' },
  { key: 'other',               label: 'Other',           color: '#9ca3af', desc: 'Unlabelled model (legacy rows).' },
]

function catOf(row: UsageRow, dim: Dim): string {
  if (dim === 'area') return AREA_OF_FEATURE[row.feature] ?? 'other'
  const m = row.model ?? ''
  return MODELS.some(c => c.key === m) ? m : 'other'
}

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
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

  const totalTok  = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0)
  const totalCall = rows.length
  const topCat    = presentCats.slice().sort((a, b) => (catTotals.get(b.key)!.cost) - (catTotals.get(a.key)!.cost))[0]

  const STAT_CARDS = [
    { label: 'Total Cost',   value: fmtCost(totalCost),  sub: `${fmtCostSGD(totalCost)} SGD · ${range}`, color: '#10b981' },
    { label: 'Total Tokens', value: fmtTokens(totalTok), sub: `${totalCall.toLocaleString()} calls`,     color: '#3b82f6' },
    { label: 'Top ' + (dim === 'area' ? 'area' : 'model'), value: topCat?.label ?? '—', sub: topCat ? fmtCost(catTotals.get(topCat.key)!.cost) : '', color: topCat?.color ?? '#8b5cf6' },
    { label: 'Avg / Call',   value: fmtTokens(totalCall ? Math.round(totalTok / totalCall) : 0), sub: 'tokens per request', color: '#f59e0b' },
  ]

  return (
    <div className="p-8 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">AI Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">Opus &amp; Gemini — token consumption &amp; cost across Engagement, Nexus and RFQ</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {STAT_CARDS.map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: card.color + '18' }}>
                  <Cpu size={13} style={{ color: card.color }} strokeWidth={2} />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground">{card.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart card */}
      <Card className="mb-4">
        <CardContent className="p-5">

          {/* View (dimension) + metric + range toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div className="flex rounded-md overflow-hidden border border-border">
              {(['area', 'model'] as Dim[]).map(d => (
                <button key={d} onClick={() => setDim(d)}
                  className={cn('px-3.5 py-1 text-[11px] font-semibold transition-colors', dim === d ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}
                >
                  {d === 'area' ? 'By product area' : 'By model'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md overflow-hidden border border-border">
                {(['cost', 'tokens'] as const).map(m => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={cn('px-3 py-1 text-[11px] font-medium transition-colors', metric === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}
                  >
                    {m === 'tokens' ? 'Tokens' : 'Cost'}
                  </button>
                ))}
              </div>
              <div className="flex rounded-md overflow-hidden border border-border">
                {(['7d', '30d', '90d'] as Range[]).map(r => (
                  <button key={r} onClick={() => setRange(r)}
                    className={cn('px-3 py-1 text-[11px] font-medium transition-colors', range === r ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart */}
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Cpu size={32} strokeWidth={1.5} className="opacity-30" />
              <p className="text-sm">No usage data yet — appears once AI calls are made.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              {metric === 'tokens' ? (
                <BarChart data={chartData} barSize={18}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={v => fmtTokens(Number(v))} width={48} />
                  <Tooltip cursor={false}
                    formatter={(v, name) => [fmtTokens(Number(v)), cats.find(c => c.key === name)?.label ?? String(name)]}
                    labelFormatter={l => `Date: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Legend formatter={name => cats.find(c => c.key === name)?.label ?? name} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {presentCats.map(c => (
                    <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} />
                  ))}
                </BarChart>
              ) : (
                <BarChart data={chartData} barSize={24}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${(Number(v)).toFixed(4)}`} width={60} />
                  <Tooltip cursor={false}
                    formatter={v => [`$${Number(v).toFixed(6)} · S$${(Number(v)*SGD_PER_USD).toFixed(6)}`, 'Cost']}
                    labelFormatter={l => `Date: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdown key (by the active dimension) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Breakdown by {dim === 'area' ? 'product area' : 'model'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {presentCats.map(c => {
              const e = catTotals.get(c.key)!
              return (
                <div key={c.key} className="flex gap-2.5 items-start">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-1" style={{ background: c.color }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground">
                      {c.label} <span className="text-muted-foreground font-normal">· {fmtCost(e.cost)} · {fmtTokens(e.tok)} tok</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{c.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
