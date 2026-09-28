'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/stat-card'
import { Tip } from '@/components/Tip'
import { Btn, Segmented } from '@/components/crm/primitives'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell } from '@/components/ui/register'
import {
  GEMINI_FEATURE_CONFIG, CAMPAIGN_ACTION_CONFIG, HOURLY_RATE_SGD,
} from '@/lib/kyn-roi/estimation-config'
import type { KynRoiResponse, WorkflowRow } from '@/app/api/analytics/kyn-roi/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d'
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<Range, string> = {
  '7d':  'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
}

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

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

// ── Workflow register row ──────────────────────────────────────────────────────

const WORKFLOW_COLS = 6

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
      <RegisterRow selected={expanded} onClick={onToggle}>
        <RegisterCell first selected={expanded} primary={row.label} secondary={row.description} title={row.description} className="min-w-[260px] max-w-[420px]" />
        <RegisterCell align="right" primary={row.runs.toLocaleString()} />
        <RegisterCell align="right" primary={fmtHours(row.hoursSaved)} />
        <RegisterCell align="right" primary={fmtValueSGD(row.estimatedValueSGD)} />
        <RegisterCell align="right" primary={fmtDateShort(row.lastActive)} />
        <RegisterCell last align="right">
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn('inline-block transition-transform duration-200', expanded && 'rotate-180')}
            style={{ color: '#9aa0a6' }}
            aria-hidden
          />
        </RegisterCell>
      </RegisterRow>

      {/* Expanded breakdown: one action per line, inside the same card */}
      {expanded && (
        <tr style={{ borderBottom: `1px solid ${RULE}` }}>
          <td colSpan={WORKFLOW_COLS} className="px-6 pb-5 pt-2">
            <table className="w-full text-[13.5px] border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 pr-4 text-[12.5px] font-normal" style={{ color: MUTED }}>Action</th>
                  <th className="pb-2 pr-4 text-[12.5px] font-normal text-right" style={{ color: MUTED }}>Count</th>
                  <th className="pb-2 pr-4 text-[12.5px] font-normal text-right" style={{ color: MUTED }}>Per run</th>
                  <th className="pb-2 text-[12.5px] font-normal text-right" style={{ color: MUTED }}>Total saved</th>
                </tr>
              </thead>
              <tbody>
                {row.breakdown.map(b => (
                  <tr key={b.action} style={{ borderTop: `1px solid ${RULE}` }}>
                    <td className="py-2 pr-4" style={{ color: INK }}>{b.action}</td>
                    <td className="py-2 pr-4 tabular-nums text-right" style={{ color: INK }}>{b.count.toLocaleString()}</td>
                    <td className="py-2 pr-4 tabular-nums text-right" style={{ color: MUTED }}>{b.minutesSaved} min</td>
                    <td className="py-2 tabular-nums text-right" style={{ color: INK }}>{fmtHours(b.hoursSaved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
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
    <div className="border-t border-b" style={{ borderColor: RULE }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 py-4 text-left bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
      >
        <span className="flex-1 text-[14px]" style={{ color: INK }}>How Kyn ROI is calculated</span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cn('flex-shrink-0 transition-transform duration-200', open && 'rotate-180')}
          style={{ color: '#9aa0a6' }}
        />
      </button>

      {open && (
        <div className="pb-5">
          <p className="m-0 mb-4 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>
            Time saved is estimated from observed AI automation events and conservative per-action
            benchmarks. Each event type reflects the manual work it replaces for an insurance
            professional. Estimated value is calculated at{' '}
            <span className="font-medium" style={{ color: INK }}>S${HOURLY_RATE_SGD}/hr</span>, a conservative
            professional services rate for Singapore.
          </p>

          <Register label="Estimation assumptions" minWidth={560}>
            <RegisterHead>
              <RegisterTh first>Automation action</RegisterTh>
              <RegisterTh align="right">Assumption</RegisterTh>
              <RegisterTh last>Basis</RegisterTh>
            </RegisterHead>
            <tbody>
              {actions.map(a => (
                <RegisterRow key={a.label} className="hover:bg-[#f8f9fa]">
                  <RegisterCell first primary={a.label} />
                  <RegisterCell align="right" primary={`${a.minutes} min`} />
                  <RegisterCell last nowrap={false}><span className="block text-[13.5px] leading-snug min-w-[260px]" style={{ color: MUTED }}>{a.basis}</span></RegisterCell>
                </RegisterRow>
              ))}
            </tbody>
          </Register>

          <p className="m-0 mt-4 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
            These figures are estimates. Actual time savings vary by task complexity and team
            workflow. Revenue influence is not attributed: no pipeline or deal data is tracked.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KynRoiPage() {
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
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Kyn ROI</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              Estimated hours saved and value created by AI automation · {RANGE_LABEL[range]}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Segmented<Range>
              value={range}
              onChange={setRange}
              options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' }]}
            />
            <Btn level="secondary" onClick={load} loading={loading}>
              {!loading && <RefreshCw size={12} strokeWidth={2} />}
              Refresh
            </Btn>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 mt-4 text-[14px]" style={{ color: INK }}>
            <span className="flex-1">Error: {error}</span>
            <Btn level="tertiary" size="xs" onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</Btn>
          </div>
        )}

        {/* ── KPI tiles ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8 mb-10">
          <StatCard
            label="Hours saved"
            value={loading ? '—' : fmtHours(summary?.totalHoursSaved ?? 0)}
            sublabel="Manual work time recovered"
            loading={loading}
            tooltip="Total manual work time recovered. Each AI event is credited a conservative time estimate: drafting a reply = 15 min, summarising a thread = 3–5 min, analysing an email = 5 min, and so on. Expand any workflow row to see the per-action breakdown."
          />
          <StatCard
            label="Automations run"
            value={loading ? '—' : (summary?.totalRuns ?? 0).toLocaleString()}
            sublabel="Across all workflows"
            loading={loading}
            tooltip="Total automation events counted from the Gemini AI log — every draft generation, thread summary, lead analysis, outbound research action, and campaign draft across all active workflows."
          />
          <StatCard
            label="Estimated value"
            value={loading ? '—' : fmtValueSGD(summary?.estimatedValueSGD ?? 0)}
            sublabel={`At S$${HOURLY_RATE_SGD}/hr`}
            loading={loading}
            tooltip={`Hours saved × S$${HOURLY_RATE_SGD}/hr — a conservative professional services rate for Singapore. No revenue is attributed directly; no pipeline or deal data is tracked.`}
          />
          <StatCard
            label="Workflows active"
            value={loading ? '—' : String(summary?.workflowsActive ?? 0)}
            sublabel="With at least one run"
            loading={loading}
            tooltip="Distinct workflow categories with at least one automation event in the selected time period. Workflows with no activity are excluded from this count."
          />
        </div>

        {/* ── Trend chart ────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Hours saved per day</h2>
            <span className="text-[12.5px]" style={{ color: MUTED }}>{RANGE_LABEL[range]}</span>
          </header>
          {loading ? (
            <div className="h-[220px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />
          ) : timeSeries.length === 0 ? (
            <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No automation activity in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeSeries} barSize={20} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={RULE} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9aa0a6' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={fmtDateAxis}
                  interval={range === '7d' ? 0 : range === '30d' ? 3 : 7}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9aa0a6' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Number(v).toFixed(0)}h`}
                  width={36}
                />
                <Tooltip
                  cursor={{ fill: FIELD }}
                  formatter={(v) => [`${Number(v).toFixed(1)}h`, 'Hours saved']}
                  labelFormatter={l => `Date: ${l}`}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: '1px solid #dadce0',
                    boxShadow: 'none',
                    color: INK,
                  }}
                />
                <Bar
                  dataKey="hoursSaved"
                  fill={INK}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* ── Workflow impact table ───────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Workflow impact</h2>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-12 rounded-[10px] animate-pulse" style={{ background: FIELD }} />)}
            </div>
          ) : workflows.length === 0 ? (
            <p className="m-0 py-16 text-center text-[15px]" style={{ color: MUTED }}>No workflow activity in this period.</p>
          ) : (
            <Register label="Workflow impact" minWidth={760}>
              <RegisterHead>
                <RegisterTh first>Workflow</RegisterTh>
                <RegisterTh align="right">Runs</RegisterTh>
                <RegisterTh align="right">
                  Hours saved
                  <Tip text="Time saved per workflow, based on conservative per-action benchmarks. Expand any row to see the count and minutes saved for each individual action type." />
                </RegisterTh>
                <RegisterTh align="right">Est. value</RegisterTh>
                <RegisterTh align="right">Last active</RegisterTh>
                <RegisterTh last />
              </RegisterHead>
              <tbody>
                {workflows.map(row => (
                  <WorkflowTableRow
                    key={row.id}
                    row={row}
                    expanded={expanded.has(row.id)}
                    onToggle={() => toggleRow(row.id)}
                  />
                ))}

                {/* Total row */}
                {summary && (
                  <RegisterRow>
                    <RegisterCell first primary="Total" />
                    <RegisterCell align="right"><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{summary.totalRuns.toLocaleString()}</span></RegisterCell>
                    <RegisterCell align="right"><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{fmtHours(summary.totalHoursSaved)}</span></RegisterCell>
                    <RegisterCell align="right"><span className="text-[14px] font-medium tabular-nums" style={{ color: INK }}>{fmtValueSGD(summary.estimatedValueSGD)}</span></RegisterCell>
                    <RegisterCell align="right" />
                    <RegisterCell last />
                  </RegisterRow>
                )}
              </tbody>
            </Register>
          )}
        </section>

        {/* ── Methodology ────────────────────────────────────────────────────── */}
        <MethodologyCard />

      </div>
    </div>
  )
}
