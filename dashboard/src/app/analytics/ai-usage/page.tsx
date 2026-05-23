'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Cpu, DollarSign, Hash, RefreshCw } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type UsageRow = {
  id:            string
  created_at:    string
  feature:       string
  input_tokens:  number
  output_tokens: number
  cost_usd:      number
}

type DayBucket = {
  date:            string
  auto_summarize:  number
  draft_reply:     number
  refresh_summary: number
  email_analysis:  number
  outbound_search: number
  summarize:       number
  total:           number
  cost:            number
}

type Range = '7d' | '30d' | '90d'

const FEATURES: { key: string; label: string; color: string; desc: string }[] = [
  { key: 'auto_summarize',  label: 'Auto Summarize',  color: '#3b82f6', desc: 'Triggered automatically on every new inbound client email. Generates the AI analysis, next action, and draft reply stored in the engagement view.' },
  { key: 'draft_reply',     label: 'Draft Reply',     color: '#10b981', desc: 'Triggered when a staff member clicks "Generate AI reply" in the Engagement → Draft tab.' },
  { key: 'refresh_summary', label: 'Refresh Summary', color: '#f59e0b', desc: 'Triggered by the "Regenerate" button in the AI Analysis section of a thread. Re-runs the analysis on demand.' },
  { key: 'email_analysis',  label: 'Email Analysis',  color: '#8b5cf6', desc: 'Triggered when a new inbound lead submits the website enquiry form. Generates the first-contact reply draft.' },
  { key: 'outbound_search', label: 'Outbound Search', color: '#ef4444', desc: 'Triggered during outbound prospecting — Gemini extracts company names from Google search results.' },
  { key: 'summarize',       label: 'Summarize',       color: '#06b6d4', desc: 'On-demand thread summarization called from the engagement dashboard.' },
]

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }

const INPUT_CPM  = 0.15   // $ per 1M input tokens
const OUTPUT_CPM = 0.60   // $ per 1M output tokens
const SGD_PER_USD = 1.35  // approximate rate

function fmtCost(n: number) {
  if (n < 0.01) return `$${(n * 100).toFixed(3)}¢`
  return `$${n.toFixed(4)}`
}
function fmtCostSGD(n: number) {
  const s = n * SGD_PER_USD
  if (s < 0.01) return `S$${(s * 100).toFixed(3)}¢`
  return `S$${s.toFixed(4)}`
}
function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchUsage(days: number): Promise<UsageRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const res = await fetch(
    `/api/analytics/ai-usage?since=${encodeURIComponent(since)}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return []
  return res.json()
}

function bucketByDay(rows: UsageRow[], features: string[]): DayBucket[] {
  const map = new Map<string, DayBucket>()
  for (const row of rows) {
    const date = row.created_at.slice(0, 10)
    if (!map.has(date)) {
      map.set(date, {
        date, total: 0, cost: 0,
        auto_summarize: 0, draft_reply: 0, refresh_summary: 0,
        email_analysis: 0, outbound_search: 0, summarize: 0,
      })
    }
    const b   = map.get(date)!
    const tok = row.input_tokens + row.output_tokens
    const cos = row.input_tokens * INPUT_CPM / 1_000_000 + row.output_tokens * OUTPUT_CPM / 1_000_000
    if (features.includes(row.feature)) {
      const key = row.feature as keyof Omit<DayBucket, 'date' | 'total' | 'cost'>
      b[key] = (b[key] ?? 0) + tok
      b.total += tok
      b.cost  += cos
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v)
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} style={{ color }} strokeWidth={2} />
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIUsagePage() {
  const [rows,            setRows]            = useState<UsageRow[]>([])
  const [range,           setRange]           = useState<Range>('30d')
  const [activeFeatures,  setActiveFeatures]  = useState<string[]>(FEATURES.map(f => f.key))
  const [metric,          setMetric]          = useState<'tokens' | 'cost'>('tokens')
  const [loading,         setLoading]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchUsage(RANGE_DAYS[range])
    setRows(data)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  const filtered  = rows.filter(r => activeFeatures.includes(r.feature))
  const totalTok  = filtered.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0)
  const totalCost = filtered.reduce((s, r) => s + r.input_tokens * INPUT_CPM / 1_000_000 + r.output_tokens * OUTPUT_CPM / 1_000_000, 0)
  const totalCall = filtered.length
  const avgTok    = totalCall ? Math.round(totalTok / totalCall) : 0

  const chartData = bucketByDay(rows, activeFeatures)

  function toggleFeature(key: string) {
    setActiveFeatures(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(k => k !== key) : prev
        : [...prev, key]
    )
  }

  const pillStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
    border: `1px solid ${active ? color : '#e5e7eb'}`,
    background: active ? `${color}18` : '#fff',
    color: active ? color : '#9ca3af',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>AI Usage</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Gemini 2.5 Flash — token consumption &amp; cost</p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#555', cursor: 'pointer' }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Tokens"    value={fmtTokens(totalTok)}  sub={`${range} · ${activeFeatures.length} feature${activeFeatures.length !== 1 ? 's' : ''}`} icon={Hash}        color="#3b82f6" />
        <StatCard label="Total Cost"      value={fmtCost(totalCost)}   sub={`${fmtCostSGD(totalCost)} SGD · Gemini 2.5 Flash`}                                      icon={DollarSign}  color="#10b981" />
        <StatCard label="API Calls"       value={totalCall.toLocaleString()} sub="Gemini requests made"                                                             icon={Cpu}         color="#8b5cf6" />
        <StatCard label="Avg per Call"    value={fmtTokens(avgTok)}    sub="tokens per request"                                                                    icon={Hash}        color="#f59e0b" />
      </div>

      {/* ── Chart card ── */}
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '20px 24px' }}>

        {/* Row 1 — feature pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {FEATURES.map(f => (
            <button key={f.key} onClick={() => toggleFeature(f.key)}
              title={f.desc}
              style={pillStyle(activeFeatures.includes(f.key), f.color)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Row 2 — metric + range toggles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 20, paddingTop: 2, borderTop: '1px solid #f3f4f6' }}>
          {(['tokens', 'cost'] as const).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${metric === m ? '#2563eb' : '#e5e7eb'}`,
                background: metric === m ? '#eff6ff' : '#fff',
                color: metric === m ? '#2563eb' : '#9ca3af' }}>
              {m === 'tokens' ? 'Tokens' : 'Cost (USD · SGD)'}
            </button>
          ))}
          <div style={{ width: 1, background: '#e5e7eb', margin: '0 2px' }} />
          {(['7d', '30d', '90d'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${range === r ? '#2563eb' : '#e5e7eb'}`,
                background: range === r ? '#eff6ff' : '#fff',
                color: range === r ? '#2563eb' : '#9ca3af' }}>
              {r}
            </button>
          ))}
        </div>

        {/* Chart */}
        {loading ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#aaa' }}>
            <Cpu size={32} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 13 }}>No usage data yet — data appears once Gemini API calls are made.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {metric === 'tokens' ? (
              <BarChart data={chartData} barSize={18}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={v => fmtTokens(v as number)} width={48} />
                <Tooltip
                  formatter={(v, name) => [fmtTokens(Number(v)), FEATURES.find(f => f.key === name)?.label ?? String(name)]}
                  labelFormatter={l => `Date: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend formatter={name => FEATURES.find(f => f.key === name)?.label ?? name} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {FEATURES.filter(f => activeFeatures.includes(f.key)).map(f => (
                  <Bar key={f.key} dataKey={f.key} stackId="a" fill={f.color} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            ) : (
              <BarChart data={chartData} barSize={24}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={d => { const [,m,day] = d.split('-'); return `${day}/${m}` }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v as number).toFixed(4)}`} width={60} />
                <Tooltip
                  formatter={v => [`$${Number(v).toFixed(6)} · S$${(Number(v) * SGD_PER_USD).toFixed(6)}`, 'Cost']}
                  labelFormatter={l => `Date: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Feature key ── */}
      <div style={{ marginTop: 16, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 24px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>What each feature tracks</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px 24px' }}>
          {FEATURES.map(f => (
            <div key={f.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: f.color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{f.label}</span>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
