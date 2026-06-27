'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Clock, Zap, TrendingUp, Layers, ChevronDown, ChevronRight,
  RefreshCw, Info,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/stat-card'
import { Tip } from '@/components/Tip'
import {
  GEMINI_FEATURE_CONFIG, CAMPAIGN_ACTION_CONFIG, HOURLY_RATE_SGD,
} from '@/lib/kyn-roi/estimation-config'
import type { KynRoiResponse, WorkflowRow } from '@/app/api/analytics/kyn-roi/route'
import type { DevLogEntry } from '@/app/api/dev-logs/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab   = 'dashboard' | 'logs'
type Range = '7d' | '30d' | '90d'
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<Range, string> = {
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  if (h === 0) return '0h'
  if (h < 1) return `${Math.round(h * 60)}m`
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`
}

function fmtValueSGD(sgd: number): string {
  if (sgd >= 10_000) return `S$${(sgd / 1000).toFixed(0)}k`
  if (sgd >= 1_000) return `S$${(sgd / 1000).toFixed(1)}k`
  return `S$${Math.round(sgd).toLocaleString()}`
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

function fmtDateAxis(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchRoiData(days: number): Promise<KynRoiResponse | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  try {
    const res = await fetch(`/api/analytics/kyn-roi?since=${encodeURIComponent(since)}`, {
      cache: 'no-store',
    })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

// ── Workflow table row ─────────────────────────────────────────────────────────

function WorkflowTableRow({
  row,
  expanded,
  onToggle,
}: {
  row: WorkflowRow
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'w-full text-left flex items-center gap-4 px-5 py-3.5 transition-colors group',
          'border-b border-[--border-subtle] last:border-b-0',
          expanded ? 'bg-muted/30' : 'hover:bg-muted/20',
        )}
      >
        {/* Colour chip + label */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: row.color }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground tracking-tight truncate">
              {row.label}
            </p>
            <p className="text-[11px] text-muted-foreground/70 truncate">{row.description}</p>
          </div>
        </div>

        {/* Runs */}
        <div className="text-right w-20 flex-shrink-0">
          <p className="text-[13px] font-semibold tabular-nums text-foreground">
            {row.runs.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">runs</p>
        </div>

        {/* Hours saved */}
        <div className="text-right w-24 flex-shrink-0">
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: '#0F3D91' }}>
            {fmtHours(row.hoursSaved)}
          </p>
          <p className="text-[10px] text-muted-foreground">saved</p>
        </div>

        {/* Value */}
        <div className="text-right w-24 flex-shrink-0">
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: '#C27A07' }}>
            {fmtValueSGD(row.estimatedValueSGD)}
          </p>
          <p className="text-[10px] text-muted-foreground">est. value</p>
        </div>

        {/* Last active */}
        <div className="text-right w-20 flex-shrink-0 hidden sm:block">
          <p className="text-[12px] text-muted-foreground">{fmtDateShort(row.lastActive)}</p>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cn(
            'text-muted-foreground/40 flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-b border-[--border-subtle] bg-muted/10">
          <div className="px-5 py-3">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left">
                  <th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4">Action</th>
                  <th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4 text-right">Count</th>
                  <th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4 text-right">Per Run</th>
                  <th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 text-right">Total Saved</th>
                </tr>
              </thead>
              <tbody>
                {row.breakdown.map(b => (
                  <tr key={b.action} className="border-t border-[--border-subtle]/50">
                    <td className="py-2 pr-4 font-medium text-foreground/80">{b.action}</td>
                    <td className="py-2 pr-4 tabular-nums text-right text-foreground/70">
                      {b.count.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-right text-muted-foreground">
                      {b.minutesSaved} min
                    </td>
                    <td className="py-2 tabular-nums text-right font-semibold" style={{ color: '#0F3D91' }}>
                      {fmtHours(b.hoursSaved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// ── Methodology block ─────────────────────────────────────────────────────────

function MethodologyCard() {
  const [open, setOpen] = useState(false)

  const actions = [
    ...Object.entries(GEMINI_FEATURE_CONFIG).map(([, cfg]) => ({
      label: cfg.label,
      minutes: cfg.minutesSaved,
      basis: cfg.basis,
    })),
    {
      label: CAMPAIGN_ACTION_CONFIG.label,
      minutes: CAMPAIGN_ACTION_CONFIG.minutesSaved,
      basis: CAMPAIGN_ACTION_CONFIG.basis,
    },
  ]

  return (
    <Card>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-muted/15 transition-colors rounded-lg"
      >
        <Info size={14} strokeWidth={2} className="text-muted-foreground/60 flex-shrink-0" />
        <p className="text-[12px] font-semibold text-muted-foreground flex-1">
          How Kyn ROI is calculated
        </p>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn(
            'text-muted-foreground/40 flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <CardContent className="pt-0 pb-5 px-5">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-4">
            Time saved is estimated from observed AI automation events and conservative per-action
            benchmarks. Each event type reflects the manual work it replaces for an insurance
            professional. Estimated value is calculated at{' '}
            <strong className="text-foreground">S${HOURLY_RATE_SGD}/hr</strong> — a conservative
            professional services rate for Singapore.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-[--border-subtle]">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-6">
                    Automation Action
                  </th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-6 w-20">
                    Assumption
                  </th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2">
                    Basis
                  </th>
                </tr>
              </thead>
              <tbody>
                {actions.map(a => (
                  <tr key={a.label} className="border-b border-[--border-subtle]/50 last:border-0">
                    <td className="py-2 pr-6 font-medium text-foreground/80">{a.label}</td>
                    <td className="py-2 pr-6 tabular-nums text-right font-semibold text-foreground">
                      {a.minutes} min
                    </td>
                    <td className="py-2 text-muted-foreground leading-snug">{a.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground/60 mt-4 leading-relaxed">
            These figures are estimates only. Actual time savings vary by task complexity and team
            workflow. Revenue influence is not attributed directly — no pipeline or deal data is
            currently tracked.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

// ── Logs tab ──────────────────────────────────────────────────────────────────

const PROJECT_LABELS: Record<string, string> = {
  'trs-dashboard': 'Dashboard',
  'trs-website':   'Website',
  'ai-agent':      'AI Agent',
}

const TAG_COLORS: Record<string, string> = {
  feature:  'bg-blue-50 text-blue-600',
  bugfix:   'bg-red-50 text-red-600',
  design:   'bg-violet-50 text-violet-600',
  refactor: 'bg-amber-50 text-amber-600',
  security: 'bg-orange-50 text-orange-600',
  perf:     'bg-green-50 text-green-600',
}

function LogsTab() {
  const [logs,    setLogs]    = useState<DevLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/dev-logs', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((rows: DevLogEntry[]) => setLogs(rows))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground">
        Loading logs…
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-destructive/6 border border-destructive/20 text-[13px] text-destructive">
        Failed to load logs: {error}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <ChevronRight size={28} strokeWidth={1.5} className="opacity-25" />
        <p className="text-[13px]">No log entries yet. Ask Claude to add one at the end of a session.</p>
      </div>
    )
  }

  return (
    <Card>
      {/* Column headers */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-[--border-subtle]">
        <div className="w-24 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Date
        </div>
        <div className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Project
        </div>
        <div className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Session
        </div>
        <div className="w-32 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tags
        </div>
        <div className="w-5 flex-shrink-0" />
      </div>

      {/* Rows */}
      {logs.map((log, idx) => {
        const open = expanded.has(log.id)
        const isLast = idx === logs.length - 1
        return (
          <div key={log.id}>
            <button
              onClick={() => toggle(log.id)}
              aria-expanded={open}
              className={cn(
                'w-full text-left flex items-center gap-4 px-5 py-3.5 transition-colors group',
                !isLast && 'border-b border-[--border-subtle]',
                open ? 'bg-muted/30' : 'hover:bg-muted/20',
              )}
            >
              {/* Date */}
              <div className="w-24 flex-shrink-0">
                <p className="text-[12px] font-medium text-foreground tabular-nums">
                  {fmtDate(log.session_date)}
                </p>
              </div>

              {/* Project */}
              <div className="w-20 flex-shrink-0">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/8 text-primary">
                  {PROJECT_LABELS[log.project] ?? log.project}
                </span>
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{log.title}</p>
                {!open && (
                  <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                    {log.changes.length} change{log.changes.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="w-32 flex-shrink-0 flex flex-wrap gap-1">
                {(log.tags ?? []).slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'text-[9.5px] font-bold px-1.5 py-[1px] rounded-sm capitalize',
                      TAG_COLORS[tag] ?? 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Chevron */}
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={cn(
                  'text-muted-foreground/40 flex-shrink-0 transition-transform duration-200',
                  open && 'rotate-180',
                )}
              />
            </button>

            {/* Expanded: bullet list */}
            {open && (
              <div className={cn(
                'bg-muted/10 px-5 py-4',
                !isLast && 'border-b border-[--border-subtle]',
              )}>
                <ul className="space-y-2">
                  {log.changes.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-foreground/80 leading-snug">
                      <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KynRoiPage() {
  const [tab,     setTab]     = useState<Tab>('dashboard')
  const [range,   setRange]   = useState<Range>('30d')
  const [data,    setData]    = useState<KynRoiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchRoiData(RANGE_DAYS[range])
    if (!result) setError('Failed to load ROI data')
    else setData(result)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const summary = data?.summary
  const workflows = data?.workflows ?? []
  const timeSeries = data?.timeSeries ?? []

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <TrendingUp size={20} strokeWidth={2} className="text-primary flex-shrink-0" />
            <h1 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
              Kyn ROI
            </h1>
          </div>
          <p className="text-[13.5px] text-muted-foreground leading-snug">
            {tab === 'dashboard' ? (
              <>
                Estimated business value and man-hours saved by AI automations
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                <span className="text-muted-foreground/70">{RANGE_LABEL[range]}</span>
              </>
            ) : (
              'Session changelog — what was built and when'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {tab === 'dashboard' && (
            <>
              <div className="flex rounded-md overflow-hidden border border-border">
                {(['7d', '30d', '90d'] as Range[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn(
                      'px-3 py-1.5 text-[11px] font-medium transition-colors',
                      range === r
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 border-b border-[--border-subtle]">
        {(['dashboard', 'logs'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-[12.5px] font-medium capitalize transition-colors',
              'border-b-2 -mb-px',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'dashboard' ? 'Dashboard' : 'Logs'}
          </button>
        ))}
      </div>

      {/* ── Dashboard tab ──────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
      <>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-5 rounded-lg bg-destructive/6 border border-destructive/20 text-[13px] text-destructive">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="bg-transparent border-0 cursor-pointer text-destructive text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Hours Saved"
          value={loading ? '—' : fmtHours(summary?.totalHoursSaved ?? 0)}
          sublabel="man-hours recovered"
          accent="blue"
          icon={Clock}
          loading={loading}
          tooltip="Total manual work time recovered. Each AI event is credited a conservative time estimate: drafting a reply = 15 min, summarising a thread = 3–5 min, analysing an email = 5 min, and so on. Expand any workflow row to see the per-action breakdown."
        />
        <StatCard
          label="Automations Run"
          value={loading ? '—' : (summary?.totalRuns ?? 0).toLocaleString()}
          sublabel="across all workflows"
          accent="green"
          icon={Zap}
          loading={loading}
          tooltip="Total automation events counted from the Gemini AI log — every draft generation, thread summary, lead analysis, outbound research action, and campaign draft across all active workflows."
        />
        <StatCard
          label="Est. Value Created"
          value={loading ? '—' : fmtValueSGD(summary?.estimatedValueSGD ?? 0)}
          sublabel={`@ S$${HOURLY_RATE_SGD}/hr · conservative estimate`}
          accent="amber"
          icon={TrendingUp}
          loading={loading}
          tooltip={`Hours saved × S$${HOURLY_RATE_SGD}/hr — a conservative professional services rate for Singapore. No revenue is attributed directly; no pipeline or deal data is tracked.`}
        />
        <StatCard
          label="Workflows Active"
          value={loading ? '—' : String(summary?.workflowsActive ?? 0)}
          sublabel="running automations"
          accent="blue"
          icon={Layers}
          loading={loading}
          tooltip="Distinct workflow categories with at least one automation event in the selected time period. Workflows with no activity are excluded from this count."
        />
      </div>

      {/* ── Trend chart ────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-foreground">
              Hours Saved Over Time
            </CardTitle>
            <span className="text-[11px] text-muted-foreground/60">daily — {RANGE_LABEL[range]}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-3 pb-4 px-5">
          {loading ? (
            <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground">
              Loading…
            </div>
          ) : timeSeries.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <TrendingUp size={28} strokeWidth={1.5} className="opacity-25" />
              <p className="text-[13px]">No automation activity in this period.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeSeries} barSize={20} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtDateAxis}
                  interval={range === '7d' ? 0 : range === '30d' ? 3 : 7}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Number(v).toFixed(0)}h`}
                  width={36}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15,61,145,0.04)' }}
                  formatter={(v) => [`${Number(v).toFixed(1)}h`, 'Hours saved']}
                  labelFormatter={l => `Date: ${l}`}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                />
                <Bar
                  dataKey="hoursSaved"
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                  fillOpacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Workflow impact table ───────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-0 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[13px] font-semibold text-foreground">
              Workflow Impact
            </CardTitle>
            <span className="text-[11px] text-muted-foreground/60">
              click any row to expand
            </span>
          </div>
        </CardHeader>

        {/* Column headers */}
        {!loading && workflows.length > 0 && (
          <div className="flex items-center gap-4 px-5 py-2 mt-2 border-b border-[--border-subtle]">
            <div className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workflow
            </div>
            <div className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
              Runs
            </div>
            <div className="w-24 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right flex items-center justify-end gap-1">
              Hours Saved
              <Tip text="Time saved per workflow, based on conservative per-action benchmarks. Expand any row to see the count and minutes saved for each individual action type." />
            </div>
            <div className="w-24 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
              Est. Value
            </div>
            <div className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right hidden sm:block">
              Last Active
            </div>
            <div className="w-5 flex-shrink-0" />
          </div>
        )}

        <CardContent className="pt-0 pb-0 px-0">
          {loading ? (
            <div className="px-5 py-10 flex items-center justify-center text-[13px] text-muted-foreground">
              Loading workflow data…
            </div>
          ) : workflows.length === 0 ? (
            <div className="px-5 py-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Layers size={28} strokeWidth={1.5} className="opacity-25" />
              <p className="text-[13px]">No workflow activity in this period.</p>
            </div>
          ) : (
            <div>
              {workflows.map(row => (
                <WorkflowTableRow
                  key={row.id}
                  row={row}
                  expanded={expanded.has(row.id)}
                  onToggle={() => toggleRow(row.id)}
                />
              ))}
            </div>
          )}

          {/* Total row */}
          {!loading && workflows.length > 0 && summary && (
            <div className="flex items-center gap-4 px-5 py-3 border-t border-[--border-subtle] bg-muted/10">
              <div className="flex-1 text-[12px] font-semibold text-foreground">Total</div>
              <div className="w-20 flex-shrink-0 text-[13px] font-bold tabular-nums text-right text-foreground">
                {summary.totalRuns.toLocaleString()}
              </div>
              <div
                className="w-24 flex-shrink-0 text-[13px] font-bold tabular-nums text-right"
                style={{ color: '#0F3D91' }}
              >
                {fmtHours(summary.totalHoursSaved)}
              </div>
              <div
                className="w-24 flex-shrink-0 text-[13px] font-bold tabular-nums text-right"
                style={{ color: '#C27A07' }}
              >
                {fmtValueSGD(summary.estimatedValueSGD)}
              </div>
              <div className="w-20 flex-shrink-0 hidden sm:block" />
              <div className="w-5 flex-shrink-0" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Methodology ────────────────────────────────────────────────────── */}
      <MethodologyCard />

      </> /* end dashboard tab */
      )}

    </div>
  )
}
