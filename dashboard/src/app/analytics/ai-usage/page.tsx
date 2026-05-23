'use client'

import { useEffect, useState, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Cpu } from 'lucide-react'
import {
  Card, Statistic, Tag, Segmented, Button, Flex, Typography, Row, Col,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

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

const INPUT_CPM   = 0.15
const OUTPUT_CPM  = 0.60
const SGD_PER_USD = 1.35

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIUsagePage() {
  const [rows,           setRows]           = useState<UsageRow[]>([])
  const [range,          setRange]          = useState<Range>('30d')
  const [activeFeatures, setActiveFeatures] = useState<string[]>(FEATURES.map(f => f.key))
  const [metric,         setMetric]         = useState<'tokens' | 'cost'>('tokens')
  const [loading,        setLoading]        = useState(true)

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

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, letterSpacing: '-0.02em' }}>AI Usage</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Gemini 2.5 Flash — token consumption &amp; cost
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={load}
          loading={loading}
        >
          Refresh
        </Button>
      </Flex>

      {/* ── Stat cards ── */}
      <Row gutter={12} style={{ marginBottom: 24 }}>
        {[
          {
            label: 'Total Tokens',
            value: fmtTokens(totalTok),
            sub:   `${range} · ${activeFeatures.length} feature${activeFeatures.length !== 1 ? 's' : ''}`,
            color: '#3b82f6',
          },
          {
            label: 'Total Cost',
            value: fmtCost(totalCost),
            sub:   `${fmtCostSGD(totalCost)} SGD · Gemini 2.5 Flash`,
            color: '#10b981',
          },
          {
            label: 'API Calls',
            value: totalCall.toLocaleString(),
            sub:   'Gemini requests made',
            color: '#8b5cf6',
          },
          {
            label: 'Avg per Call',
            value: fmtTokens(avgTok),
            sub:   'tokens per request',
            color: '#f59e0b',
          },
        ].map(card => (
          <Col key={card.label} xs={24} sm={12} lg={6}>
            <Card
              size="small"
              style={{ borderRadius: 12, marginBottom: 12 }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Flex justify="space-between" align="flex-start" style={{ marginBottom: 8 }}>
                <Typography.Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>
                  {card.label}
                </Typography.Text>
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${card.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Cpu size={13} style={{ color: card.color }} strokeWidth={2} />
                </span>
              </Flex>
              <Statistic
                value={card.value}
                styles={{ value: { fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.02em', lineHeight: 1 } }}
              />
              <Typography.Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 4 }}>
                {card.sub}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Chart card ── */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }} styles={{ body: { padding: '20px 24px' } }}>

        {/* Row 1 — feature pills */}
        <Flex gap={6} wrap="wrap" style={{ marginBottom: 12 }}>
          {FEATURES.map(f => {
            const active = activeFeatures.includes(f.key)
            return (
              <Tag
                key={f.key}
                title={f.desc}
                onClick={() => toggleFeature(f.key)}
                style={{
                  cursor:     'pointer',
                  userSelect: 'none',
                  fontSize:   11,
                  fontWeight: 600,
                  padding:    '4px 10px',
                  borderRadius: 20,
                  lineHeight: '18px',
                  border:     `1px solid ${active ? f.color : '#e5e7eb'}`,
                  background: active ? `${f.color}18` : '#fff',
                  color:      active ? f.color : '#9ca3af',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
              </Tag>
            )
          })}
        </Flex>

        {/* Row 2 — metric + range toggles */}
        <Flex
          justify="flex-end"
          align="center"
          gap={8}
          style={{ marginBottom: 20, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}
        >
          <Segmented
            size="small"
            options={[
              { label: 'Tokens',         value: 'tokens' },
              { label: 'Cost (USD · SGD)', value: 'cost'   },
            ]}
            value={metric}
            onChange={v => setMetric(v as 'tokens' | 'cost')}
          />
          <Segmented
            size="small"
            options={['7d', '30d', '90d']}
            value={range}
            onChange={v => setRange(v as Range)}
          />
        </Flex>

        {/* Chart */}
        {loading ? (
          <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#aaa' }}>
            <Cpu size={32} style={{ opacity: 0.3 }} strokeWidth={1.5} />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              No usage data yet — data appears once Gemini API calls are made.
            </Typography.Text>
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
      </Card>

      {/* ── Feature key ── */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: '16px 24px' } }}>
        <Typography.Text style={{ display: 'block', marginBottom: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>
          What each feature tracks
        </Typography.Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px 24px' }}>
          {FEATURES.map(f => (
            <Flex key={f.key} gap={10} align="flex-start">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: f.color, flexShrink: 0, marginTop: 3 }} />
              <div>
                <Typography.Text strong style={{ fontSize: 12, color: '#374151' }}>{f.label}</Typography.Text>
                <Typography.Paragraph style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                  {f.desc}
                </Typography.Paragraph>
              </div>
            </Flex>
          ))}
        </div>
      </Card>

    </div>
  )
}
