'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { Btn, Chip, Segmented, inputCls } from '@/components/crm/primitives'

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
// Every source renders as the same neutral chip; the label carries the meaning.

const SOURCE_CONFIG: Record<string, { label: string }> = {
  gemini:    { label: 'Gemini' },
  anthropic: { label: 'Anthropic' },
  roadplus:  { label: 'RoadPlus' },
  supabase:  { label: 'Supabase' },
}
const ALL_SOURCES = Object.keys(SOURCE_CONFIG)

function sourceCfg(source: string) {
  return SOURCE_CONFIG[source] ?? { label: source }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'
const MONO = 'ui-monospace, monospace'

type Period = '7' | '30' | '90' | '0'
const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '0', label: 'All' },
]

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
  return `${feature}${code}`
}

// ── Row detail expand ─────────────────────────────────────────────────────────

function RowDetail({ row }: { row: LogRow }) {
  return (
    <div className="pb-4 pt-1 sm:pl-[112px] min-w-0">
      {(row.resource_type || row.resource_id || row.thread_id) && (
        <p className="m-0 mb-2 text-[12.5px] break-all" style={{ color: MUTED }}>
          {row.resource_type && row.resource_id ? `${row.resource_type} · ` : ''}
          {row.resource_id && <code className="text-[12px]" style={{ fontFamily: MONO }}>{row.resource_id}</code>}
          {row.thread_id && <>{row.resource_id ? ' · ' : ''}thread <code className="text-[12px]" style={{ fontFamily: MONO }}>{row.thread_id}</code></>}
        </p>
      )}
      <p className="m-0 mb-1 text-[12px]" style={{ color: MUTED }}>Full message</p>
      <pre className="m-0 px-3 py-2 rounded-[10px] text-[12px] leading-relaxed whitespace-pre-wrap break-all max-h-[260px] overflow-y-auto" style={{ background: FIELD, color: INK, fontFamily: MONO }}>
        {row.message}
      </pre>
      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <>
          <p className="m-0 mt-3 mb-1 text-[12px]" style={{ color: MUTED }}>Metadata</p>
          <pre className="m-0 px-3 py-2 rounded-[10px] text-[12px] leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto" style={{ background: FIELD, color: INK, fontFamily: MONO }}>
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

  const periodLabel = days > 0 ? `last ${days} days` : 'all time'

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Error log</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${logs.length} error${logs.length !== 1 ? 's' : ''} · ${periodLabel} · refreshes every 30 seconds`}
            </p>
          </div>
          <Btn level="secondary" onClick={() => load(true)} loading={refreshing} title="Refresh">
            {!refreshing && <RefreshCw size={13} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────────── */}
        <div className="mt-6 mb-6 flex items-center gap-2 flex-wrap">
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className={inputCls.replace('w-full ', '') + ' w-auto min-w-[180px] cursor-pointer'} aria-label="Source">
            <option value="">All sources</option>
            {ALL_SOURCES.map(s => (
              <option key={s} value={s}>{sourceCfg(s).label}</option>
            ))}
          </select>

          <Segmented<Period>
            value={String(days) as Period}
            onChange={v => setDays(parseInt(v))}
            options={PERIODS}
          />

          {(filterSource || days !== 30) && (
            <Btn level="tertiary" onClick={() => { setFilterSource(''); setDays(30) }}>
              Clear
            </Btn>
          )}
        </div>

        {/* ── Feed ───────────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-12 rounded-[10px] animate-pulse" style={{ background: FIELD }} />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="m-0 text-[15px]" style={{ color: MUTED }}>No errors in this period.</p>
            {days > 0 && <Btn level="tertiary" className="mt-3" onClick={() => setDays(0)}>Show all time</Btn>}
          </div>
        ) : (
          Object.entries(grouped).map(([day, rows]) => (
            <section key={day} className="mb-8">
              <p className="m-0 mb-1 text-[12.5px]" style={{ color: MUTED }}>{day}</p>

              <div className="border-t" style={{ borderColor: RULE }}>
                {rows.map(row => {
                  const cfg   = sourceCfg(row.source)
                  const isExp = expanded === row.id

                  return (
                    <div key={row.id} className="border-b" style={{ borderColor: RULE }}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isExp ? null : row.id)}
                        aria-expanded={isExp}
                        className="w-full flex items-start gap-3 py-3 bg-transparent border-0 text-left cursor-pointer hover:bg-[#f8f9fa]"
                      >
                        {/* Source */}
                        <div className="w-[100px] flex-shrink-0 pt-px hidden sm:block">
                          <Chip>{cfg.label}</Chip>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="sm:hidden"><Chip>{cfg.label}</Chip></span>
                            <span className="text-[14px]" style={{ color: INK }}>{describeRow(row)}</span>
                          </div>
                          <p className="m-0 mt-0.5 text-[13px] leading-snug truncate" style={{ color: MUTED }}>
                            {row.message}
                          </p>
                        </div>

                        {/* Right side */}
                        <div className="flex-shrink-0 flex items-center gap-2 pt-0.5">
                          <span className="text-[12.5px] tabular-nums whitespace-nowrap" style={{ color: MUTED }} title={fmtFull(row.created_at)}>
                            {timeAgo(row.created_at)}
                          </span>
                          {isExp
                            ? <ChevronDown size={14} strokeWidth={2} style={{ color: '#9aa0a6' }} />
                            : <ChevronRight size={14} strokeWidth={2} style={{ color: '#9aa0a6' }} />}
                        </div>
                      </button>

                      {isExp && <RowDetail row={row} />}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
