'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type LogRow = {
  id:            string
  created_at:    string
  source:        string
  feature:       string | null
  status_code:   number | null
  message:       string
  thread_id:     string | null
  resource_type: string | null
  resource_id:   string | null
  metadata:      Record<string, unknown> | null
}

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  gemini:    { label: 'Gemini',    color: '#b45309', bg: '#fffbeb' },
  anthropic: { label: 'Anthropic', color: '#6d28d9', bg: '#f5f3ff' },
  roadplus:  { label: 'RoadPlus',  color: '#0f766e', bg: '#f0fdfa' },
  supabase:  { label: 'Supabase',  color: '#15803d', bg: '#f0fdf4' },
}
const ALL_SOURCES = Object.keys(SOURCE_CONFIG)

function sourceCfg(source: string) {
  return SOURCE_CONFIG[source] ?? { label: source, color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted))' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function describeRow(row: LogRow): string {
  const feature = row.feature ? row.feature.replace(/_/g, ' ') : 'call'
  const code    = row.status_code ? ` (HTTP ${row.status_code})` : ''
  return `${sourceCfg(row.source).label} ${feature}${code}`
}

// ── Row detail expand ─────────────────────────────────────────────────────────

function RowDetail({ row }: { row: LogRow }) {
  return (
    <div style={{ padding: '10px 16px 14px 46px', background: 'hsl(var(--muted))', borderTop: '1px solid var(--border-subtle)' }}>
      {(row.resource_type || row.resource_id || row.thread_id) && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
          {row.resource_type && row.resource_id ? `${row.resource_type} · ` : ''}
          {row.resource_id && <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>{row.resource_id}</code>}
          {row.thread_id && <>{row.resource_id ? ' · ' : ''}thread <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>{row.thread_id}</code></>}
        </p>
      )}
      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>Full message</p>
      <pre style={{ margin: 0, padding: '8px 10px', background: 'hsl(var(--card))', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 11, color: 'hsl(var(--foreground))', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflowY: 'auto', fontFamily: 'ui-monospace, monospace' }}>
        {row.message}
      </pre>
      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <>
          <p style={{ margin: '8px 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))' }}>Metadata</p>
          <pre style={{ margin: 0, padding: '8px 10px', background: 'hsl(var(--card))', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 11, color: 'hsl(var(--foreground))', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto', fontFamily: 'ui-monospace, monospace' }}>
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const POLL_MS = 30_000

export default function ErrorLogPage() {
  const [logs,         setLogs]         = useState<LogRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [filterSource, setFilterSource] = useState('')
  const [days,         setDays]         = useState(30)
  const [expanded,     setExpanded]     = useState<string | null>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const params = new URLSearchParams({ limit: '500', days: String(days) })
      if (filterSource) params.set('source', filterSource)
      const res  = await fetch(`/api/analytics/error-log?${params}`, { cache: 'no-store' })
      const data = res.ok ? await res.json() : []
      setLogs(Array.isArray(data) ? data : [])
    } finally { setLoading(false); setRefreshing(false) }
  }, [filterSource, days])

  // Auto-updating: reload on a timer so a fresh failure shows up without a manual refresh.
  useEffect(() => {
    load()
    const t = setInterval(() => load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // Group logs by calendar day
  const grouped = logs.reduce<Record<string, LogRow[]>>((acc, row) => {
    const day = new Date(row.created_at).toLocaleDateString('en-SG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    if (!acc[day]) acc[day] = []
    acc[day].push(row)
    return acc
  }, {})

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'hsl(var(--foreground))', letterSpacing: '-0.02em' }}>Error Log</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
            {logs.length} error{logs.length !== 1 ? 's' : ''} · {days > 0 ? `last ${days} days` : 'all time'} · updates every 30s
          </p>
        </div>
        <button
          onClick={() => load(true)}
          title="Refresh"
          style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          <span style={{ fontSize: 12 }}>Refresh</span>
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selStyle}>
          <option value="">All sources</option>
          {ALL_SOURCES.map(s => (
            <option key={s} value={s}>{sourceCfg(s).label}</option>
          ))}
        </select>

        <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={selStyle}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>

        {(filterSource || days !== 30) && (
          <button
            onClick={() => { setFilterSource(''); setDays(30) }}
            style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Feed ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>No errors in this period. 🎉</p>
          {days > 0 && <button onClick={() => setDays(0)} style={{ marginTop: 8, fontSize: 12, color: 'var(--primary-hex)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View all time</button>}
        </div>
      ) : (
        Object.entries(grouped).map(([day, rows]) => (
          <div key={day} style={{ marginBottom: 28 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{day}</p>

            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', background: 'hsl(var(--card))' }}>
              {rows.map((row, i) => {
                const cfg   = sourceCfg(row.source)
                const isExp = expanded === row.id

                return (
                  <div key={row.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <button
                      onClick={() => setExpanded(isExp ? null : row.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '11px 14px', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {/* Icon */}
                      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        <AlertTriangle size={13} strokeWidth={2} style={{ color: cfg.color }} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{describeRow(row)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                          {row.message}
                        </p>
                      </div>

                      {/* Right side */}
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} title={fmtFull(row.created_at)}>
                          {timeAgo(row.created_at)}
                        </span>
                        {isExp
                          ? <ChevronDown size={12} strokeWidth={2} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                          : <ChevronRight size={12} strokeWidth={2} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        }
                      </div>
                    </button>

                    {isExp && <RowDetail row={row} />}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  fontSize: 12, border: '1px solid var(--border-subtle)', borderRadius: 7,
  padding: '5px 10px', color: 'hsl(var(--foreground))', background: 'hsl(var(--card))',
  outline: 'none', cursor: 'pointer',
}
