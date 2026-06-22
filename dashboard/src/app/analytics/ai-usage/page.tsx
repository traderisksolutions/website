'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Cpu, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type UsageRow = {
  id: string; created_at: string; feature: string
  input_tokens: number; output_tokens: number; cost_usd: number
}
type DayBucket = {
  date: string; total: number; cost: number
  auto_summarize: number; draft_reply: number; refresh_summary: number
  email_analysis: number; outbound_search: number; summarize: number; rag_index: number
}
type Range = '7d' | '30d' | '90d'

const FEATURES: { key: string; label: string; color: string; desc: string }[] = [
  { key: 'auto_summarize',  label: 'Auto Summarize',  color: '#3b82f6', desc: 'Triggered automatically on every new inbound client email.' },
  { key: 'draft_reply',     label: 'Draft Reply',     color: '#10b981', desc: 'Triggered when staff clicks "Generate AI reply" in the Engagement tab.' },
  { key: 'refresh_summary', label: 'Refresh Summary', color: '#f59e0b', desc: 'Triggered by the "Regenerate" button in the AI Analysis section.' },
  { key: 'email_analysis',  label: 'Email Analysis',  color: '#8b5cf6', desc: 'Triggered when a new inbound lead submits the website enquiry form.' },
  { key: 'outbound_search', label: 'Outbound Search', color: '#ef4444', desc: 'Triggered during outbound prospecting — extracts company names from search results.' },
  { key: 'summarize',       label: 'Summarize',       color: '#06b6d4', desc: 'On-demand thread summarization from the engagement dashboard.' },
  { key: 'rag_index',       label: 'RAG Index',       color: '#f97316', desc: 'Embedding cost for indexing Google Drive files (text-embedding-004).' },
]

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

function bucketByDay(rows: UsageRow[], features: string[]): DayBucket[] {
  const map = new Map<string, DayBucket>()
  for (const row of rows) {
    const date = row.created_at.slice(0, 10)
    if (!map.has(date)) map.set(date, { date, total: 0, cost: 0, auto_summarize: 0, draft_reply: 0, refresh_summary: 0, email_analysis: 0, outbound_search: 0, summarize: 0, rag_index: 0 })
    const b = map.get(date)!; const tok = row.input_tokens + row.output_tokens
    if (features.includes(row.feature)) {
      const key = row.feature as keyof Omit<DayBucket, 'date' | 'total' | 'cost'>
      b[key] = (b[key] ?? 0) + tok; b.total += tok; b.cost += row.cost_usd
    }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
}

export default function AIUsagePage() {
  const [rows,           setRows]           = useState<UsageRow[]>([])
  const [range,          setRange]          = useState<Range>('30d')
  const [activeFeatures, setActiveFeatures] = useState<string[]>(FEATURES.map(f => f.key))
  const [metric,         setMetric]         = useState<'tokens' | 'cost'>('tokens')
  const [loading,        setLoading]        = useState(true)

  const load = useCallback(async () => {
    setLoading(true); const data = await fetchUsage(RANGE_DAYS[range]); setRows(data); setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const filtered  = rows.filter(r => activeFeatures.includes(r.feature))
  const totalTok  = filtered.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  const totalCost = filtered.reduce((s, r) => s + r.cost_usd, 0)
  const totalCall = filtered.length
  const chartData = bucketByDay(rows, activeFeatures)

  function toggleFeature(key: string) {
    setActiveFeatures(prev => prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key])
  }

  const STAT_CARDS = [
    { label: 'Total Tokens', value: fmtTokens(totalTok), sub: `${range} · ${activeFeatures.length} features`, color: '#3b82f6' },
    { label: 'Total Cost',   value: fmtCost(totalCost),  sub: `${fmtCostSGD(totalCost)} SGD`,                  color: '#10b981' },
    { label: 'API Calls',    value: totalCall.toLocaleString(), sub: 'Gemini requests',                         color: '#8b5cf6' },
    { label: 'Avg / Call',   value: fmtTokens(totalCall ? Math.round(totalTok / totalCall) : 0), sub: 'tokens per request', color: '#f59e0b' },
  ]

  return (
    <div className="p-8 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">AI Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">Gemini 2.5 Flash — token consumption &amp; cost</p>
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

          {/* Feature pills */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {FEATURES.map(f => {
              const active = activeFeatures.includes(f.key)
              return (
                <button key={f.key} title={f.desc} onClick={() => toggleFeature(f.key)}
                  className={cn(
                    'text-[11px] font-semibold px-3 py-1 rounded-[6px] transition-all duration-150',
                    active ? 'opacity-100' : 'opacity-50'
                  )}
                  style={{
                    background: active ? `${f.color}18` : 'hsl(var(--muted))',
                    color: active ? f.color : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Metric + range toggles */}
          <div className="flex flex-wrap items-center justify-end gap-2 mb-5 pt-3 border-t border-[--border-subtle]">
            <div className="flex rounded-md overflow-hidden border border-border">
              {(['tokens', 'cost'] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className={cn('px-3 py-1 text-[11px] font-medium transition-colors', metric === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50')}
                >
                  {m === 'tokens' ? 'Tokens' : 'Cost (USD · SGD)'}
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

          {/* Chart */}
          {loading ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[280px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Cpu size={32} strokeWidth={1.5} className="opacity-30" />
              <p className="text-sm">No usage data yet — appears once Gemini API calls are made.</p>
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
                    formatter={(v, name) => [fmtTokens(Number(v)), FEATURES.find(f => f.key === name)?.label ?? String(name)]}
                    labelFormatter={l => `Date: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Legend formatter={name => FEATURES.find(f => f.key === name)?.label ?? name} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {FEATURES.filter(f => activeFeatures.includes(f.key)).map(f => (
                    <Bar key={f.key} dataKey={f.key} stackId="a" fill={f.color} />
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
                  <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Feature key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">What each feature tracks</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div key={f.key} className="flex gap-2.5 items-start">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-1" style={{ background: f.color }} />
                <div>
                  <p className="text-[12px] font-semibold text-foreground">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
