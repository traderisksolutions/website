'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ArrowRight } from 'lucide-react'
import { Btn, Chip } from '@/components/crm/primitives'
import { StatCard } from '@/components/stat-card'
import { Tip } from '@/components/Tip'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  status: string
  source: string
  department: string | null
  created_at: string
}

type FunnelStage = {
  key: string
  label: string
  description: string
  count: number
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const FIELD = '#f1f3f4'

function pct(n: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

function convRate(n: number, prev: number) {
  if (!prev) return '—'
  return `${Math.round((n / prev) * 100)}%`
}

function avgDays(leads: Lead[], fromStatus: string[], toStatus: string[]): string {
  // Approximation: no timestamps per status, so we return a placeholder
  void leads; void fromStatus; void toStatus
  return '—'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FunnelBar({
  stage, total, prevCount, isLast,
}: {
  stage: FunnelStage; total: number; prevCount: number; isLast: boolean
}) {
  const widthPct = total ? (stage.count / total) * 100 : 0
  const dropped  = prevCount - stage.count
  const conv     = convRate(stage.count, prevCount)

  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[120px_1fr_140px] items-center gap-x-4 gap-y-2 py-3">
      {/* Stage label */}
      <div className="sm:text-right min-w-0">
        <p className="m-0 text-[14px] font-medium" style={{ color: INK }}>{stage.label}</p>
        <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{stage.description}</p>
      </div>

      {/* Bar */}
      <div className="relative col-span-2 sm:col-span-1 order-last sm:order-none">
        <div className="h-9 rounded-[8px] overflow-hidden" style={{ background: FIELD }}>
          <div
            className="h-full flex items-center pl-3 rounded-[8px]"
            style={{ width: `${widthPct}%`, background: INK, minWidth: stage.count > 0 ? 44 : 0, transition: 'width 0.4s ease' }}
          >
            {stage.count > 0 && (
              <span className="text-[12.5px] font-medium text-white whitespace-nowrap tabular-nums">{stage.count}</span>
            )}
          </div>
        </div>
        {stage.count === 0 && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] tabular-nums" style={{ color: '#9aa0a6' }}>0</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-0.5 text-[12.5px] sm:text-right tabular-nums" style={{ color: MUTED }}>
        <span>{pct(stage.count, total)} of total</span>
        {prevCount !== stage.count && <span>{conv} from previous stage</span>}
        {!isLast && dropped > 0 && <span>{dropped} dropped</span>}
      </div>
    </div>
  )
}

function SectionHeading({ title, tip, meta }: { title: string; tip?: string; meta?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em] leading-tight inline-flex items-center" style={{ color: INK }}>
        {title}{tip && <Tip text={tip} />}
      </h2>
      {meta && <div className="text-[12.5px] tabular-nums" style={{ color: MUTED }}>{meta}</div>}
    </header>
  )
}

function BreakdownBar({ label, count, total }: { label: string; count: number; total: number }) {
  const w = total ? `${Math.round((count / total) * 100)}%` : '0%'
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <span className="w-[120px] flex-shrink-0 text-[13.5px] sm:text-right truncate" style={{ color: '#3c4043' }}>{label}</span>
      <div className="flex-1 h-2 rounded-[4px] overflow-hidden" style={{ background: FIELD }}>
        <div className="h-full rounded-[4px]" style={{ width: w, background: INK }} />
      </div>
      <span className="w-[72px] flex-shrink-0 text-[13.5px] text-right tabular-nums" style={{ color: INK }}>
        {count} <span className="text-[12px]" style={{ color: MUTED }}>({w})</span>
      </span>
    </div>
  )
}

// ── Journey steps ──────────────────────────────────────────────────────────────

function JourneyStep({
  step, label, metric, isLast,
}: {
  step: number; label: string; metric: string; isLast?: boolean
}) {
  return (
    <div className="flex items-center">
      <div className="w-[104px] px-2 py-3 rounded-[12px] text-center border" style={{ borderColor: '#dadce0', background: '#fff' }}>
        <div className="text-[16px] font-medium tabular-nums mb-1" style={{ color: INK }}>{step}</div>
        <div className="text-[12.5px] font-medium leading-tight" style={{ color: '#3c4043' }}>{label}</div>
        <div className="text-[11.5px] mt-1 leading-tight" style={{ color: MUTED }}>{metric}</div>
      </div>
      {!isLast && (
        <div className="flex items-center px-1">
          <ArrowRight size={14} style={{ color: '#dadce0' }} />
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try { setLeads(await fetchLeads()) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived metrics ──────────────────────────────────────────────────────

  const emailLeads = leads.filter(l => ['website_form', 'email', 'manual'].includes(l.source))
  const waLeads    = leads.filter(l => l.source === 'whatsapp_click')
  const total      = emailLeads.length

  // SMB funnel — cumulative: each stage includes all downstream statuses
  const inbound   = total
  const contacted = emailLeads.filter(l => ['contacted', 'qualified', 'converted'].includes(l.status)).length
  const qualified = emailLeads.filter(l => ['qualified', 'converted'].includes(l.status)).length
  const converted = emailLeads.filter(l => l.status === 'converted').length
  const dropped   = emailLeads.filter(l => l.status === 'dropped').length

  const smb: FunnelStage[] = [
    { key: 'inbound',   label: 'Inbound',   description: 'Email enquiries received', count: inbound },
    { key: 'contacted', label: 'Contacted', description: 'First reply sent',         count: contacted },
    { key: 'qualified', label: 'Qualified', description: 'Intent confirmed',         count: qualified },
    { key: 'converted', label: 'Converted', description: 'Policy purchased',         count: converted },
  ]

  // Breakdown by department
  const depts = ['Sales', 'Customer Support'].map(d => ({
    label: d, count: emailLeads.filter(l => l.department === d).length,
  }))

  // Breakdown by source
  const sources = [
    { label: 'Website form', count: emailLeads.filter(l => l.source === 'website_form').length },
    { label: 'Direct email', count: emailLeads.filter(l => l.source === 'email').length },
    { label: 'WhatsApp',     count: waLeads.length },
    { label: 'Manual entry', count: emailLeads.filter(l => l.source === 'manual').length },
  ]
  const allSourceTotal = leads.length

  // KPIs
  const convRate       = total ? `${Math.round((converted / total) * 100)}%` : '—'
  const activeLeads    = emailLeads.filter(l => ['new', 'contacted', 'qualified'].includes(l.status)).length

  const smbMetrics = [
    { metric: 'Time to first reply',     why: 'Faster response converts better. Target under 2 hours.' },
    { metric: 'Time in each stage',      why: 'Shows where deals stall. A slow Contacted to Qualified step is a qualification problem.' },
    { metric: 'Drop-off by department',  why: 'Sales and Support may convert at different rates and need different playbooks.' },
    { metric: 'Revenue per converted',   why: 'Average premium size, to forecast pipeline value.' },
    { metric: 'Renewal rate (12-month)', why: 'SMB policies renew annually. Needed to measure true lifetime value.' },
    { metric: 'Lead source quality',     why: 'Website form against direct email: which converts better and faster.' },
  ]
  const b2cMetrics = [
    { metric: 'Browse to quote rate',   why: 'Share of visitors who start a quote. A low rate points to UX or messaging.' },
    { metric: 'Quote to payment rate',  why: 'A drop here is price or trust friction. Test the quote page.' },
    { metric: 'Payment to policy rate', why: 'Should be near 100%. Any gap is a payment failure or system error.' },
    { metric: 'Repeat purchase rate',   why: 'Travel insurance recurs. Track 12-month repurchase per customer.' },
    { metric: 'Product mix',            why: 'Motor, Travel and Home revenue share.' },
    { metric: 'Average order value',    why: 'Premium per transaction. Drives revenue forecasting and the CAC target.' },
  ]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">

        {/* ── Page header ── */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Funnel</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              {loading ? 'Loading…' : `${total} email lead${total === 1 ? '' : 's'} · all time`}
            </p>
          </div>
          <Btn level="secondary" onClick={() => load(true)} loading={refreshing}>
            {!refreshing && <RefreshCw size={13} strokeWidth={2} />}
            Refresh
          </Btn>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-[96px] rounded-[16px] animate-pulse" style={{ background: FIELD }} />)}
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
              <StatCard label="Total inbound"   value={inbound}     sublabel="Email leads, all time" />
              <StatCard label="Active pipeline" value={activeLeads} sublabel="New, contacted and qualified" />
              <StatCard label="Converted"       value={converted}   sublabel={`${convRate} of inbound`} />
              <StatCard label="Dropped"         value={dropped}     sublabel="Disqualified or no response" />
            </div>

            {/* ── SMB Funnel ── */}
            <section className="mb-10">
              <SectionHeading
                title="Inbound to conversion"
                tip="Small and medium businesses that contact us by email and decide on a policy. Each stage counts every lead at that stage or later."
                meta={<>Overall conversion {convRate}</>}
              />
              <div className="border-t" style={{ borderColor: RULE }}>
                {smb.map((stage, i) => (
                  <div key={stage.key} className="border-b" style={{ borderColor: RULE }}>
                    <FunnelBar
                      stage={stage}
                      total={inbound || 1}
                      prevCount={i === 0 ? inbound : smb[i - 1].count}
                      isLast={i === smb.length - 1}
                    />
                  </div>
                ))}
              </div>
              {inbound === 0 && (
                <p className="m-0 py-10 text-center text-[15px]" style={{ color: MUTED }}>No email leads yet.</p>
              )}
            </section>

            {/* ── Breakdown row ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mb-10">
              <section>
                <SectionHeading title="By department" />
                {depts.map(d => (
                  <BreakdownBar key={d.label} label={d.label} count={d.count} total={total} />
                ))}
                {total === 0 && <p className="m-0 py-6 text-center text-[15px]" style={{ color: MUTED }}>No leads yet.</p>}
              </section>

              <section>
                <SectionHeading title="By source" />
                {sources.map(s => (
                  <BreakdownBar key={s.label} label={s.label} count={s.count} total={allSourceTotal} />
                ))}
                {allSourceTotal === 0 && <p className="m-0 py-6 text-center text-[15px]" style={{ color: MUTED }}>No leads yet.</p>}
              </section>
            </div>

            {/* ── B2C Journey ── */}
            <section className="mb-10">
              <SectionHeading
                title="Online self-serve"
                tip="Individuals buying Home, Motor or Travel insurance on the website: payment link to policy confirmation."
                meta={<Chip>Not connected</Chip>}
              />
              <div className="flex items-stretch overflow-x-auto pb-1">
                {[
                  { step: 1, label: 'Browse',        metric: 'Unique visitors' },
                  { step: 2, label: 'Quote started', metric: 'Product page clicks' },
                  { step: 3, label: 'Payment link',  metric: 'Payment link opens' },
                  { step: 4, label: 'Paid',          metric: 'Completed payments' },
                  { step: 5, label: 'Policy issued', metric: 'Confirmation emails' },
                  { step: 6, label: 'Renewal',       metric: '12-month repurchase' },
                ].map((s, i, arr) => (
                  <JourneyStep key={s.step} {...s} isLast={i === arr.length - 1} />
                ))}
              </div>
              <p className="m-0 mt-4 text-[14px]" style={{ color: MUTED }}>
                Tracking is not connected. Payment and policy data are needed to populate this funnel.
              </p>
            </section>

            {/* ── Suggestions ── */}
            <section>
              <SectionHeading title="Metrics to track next" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {[
                  { title: 'SMB email sales', rows: smbMetrics },
                  { title: 'Individual online', rows: b2cMetrics },
                ].map(group => (
                  <div key={group.title}>
                    <p className="m-0 mb-2 text-[12.5px]" style={{ color: MUTED }}>{group.title}</p>
                    {group.rows.map((r, i) => (
                      <div key={r.metric} className="flex gap-3 py-2.5 border-b" style={{ borderColor: RULE }}>
                        <span className="w-5 flex-shrink-0 text-[12.5px] tabular-nums pt-0.5" style={{ color: '#9aa0a6' }}>{i + 1}</span>
                        <div className="min-w-0">
                          <p className="m-0 text-[14px]" style={{ color: INK }}>{r.metric}</p>
                          <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: MUTED }}>{r.why}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
