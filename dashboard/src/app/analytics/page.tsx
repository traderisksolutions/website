'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ArrowRight, TrendingUp, Users, Zap, RotateCcw } from 'lucide-react'

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
  color: string
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads', { cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} style={{ color }} strokeWidth={2} />
        </span>
      </div>
      <span style={{ fontSize: 28, fontWeight: 700, color: '#111', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#aaa' }}>{sub}</span>}
    </div>
  )
}

function FunnelBar({
  stage, total, prevCount, isLast,
}: {
  stage: FunnelStage; total: number; prevCount: number; isLast: boolean
}) {
  const widthPct = total ? (stage.count / total) * 100 : 0
  const dropped  = prevCount - stage.count
  const conv     = convRate(stage.count, prevCount)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0' }}>
      {/* Stage label */}
      <div style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111' }}>{stage.label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>{stage.description}</p>
      </div>

      {/* Bar */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Background track */}
        <div style={{ height: 36, background: '#f4f4f5', borderRadius: 6, overflow: 'hidden' }}>
          {/* Fill */}
          <div style={{
            height: '100%',
            width: `${widthPct}%`,
            background: stage.color,
            borderRadius: 6,
            display: 'flex', alignItems: 'center',
            paddingLeft: 12,
            minWidth: stage.count > 0 ? 48 : 0,
            transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {stage.count > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                {stage.count}
              </span>
            )}
          </div>
        </div>
        {/* Zero state */}
        {stage.count === 0 && (
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#bbb' }}>0</span>
        )}
      </div>

      {/* Stats */}
      <div style={{ width: 130, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>of total:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{pct(stage.count, total)}</span>
        </div>
        {prevCount !== stage.count && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#aaa' }}>conv rate:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: stage.count > 0 ? '#15803d' : '#aaa' }}>{conv}</span>
          </div>
        )}
        {!isLast && dropped > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#ef4444' }}>▼ {dropped} dropped</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111', letterSpacing: '-0.01em' }}>{title}</h2>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{sub}</p>}
    </div>
  )
}

function BreakdownBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const w = total ? `${Math.round((count / total) * 100)}%` : '0%'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span style={{ width: 120, fontSize: 12, color: '#555', flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#f4f4f5', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: w, background: color, borderRadius: 4 }} />
      </div>
      <span style={{ width: 60, fontSize: 12, fontWeight: 600, color: '#333', textAlign: 'right' }}>
        {count} <span style={{ fontWeight: 400, color: '#aaa', fontSize: 11 }}>({w})</span>
      </span>
    </div>
  )
}

// ── Journey suggestion card ────────────────────────────────────────────────────

function JourneyStep({
  step, label, metric, color, isLast,
}: {
  step: number; label: string; metric: string; color: string; isLast?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 80, padding: '10px 8px', borderRadius: 10, textAlign: 'center',
          background: '#fff', border: `2px solid ${color}`,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 4 }}>{step}</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#333', lineHeight: 1.3 }}>{label}</div>
          <div style={{ fontSize: 9, color: '#aaa', marginTop: 4, lineHeight: 1.3 }}>{metric}</div>
        </div>
      </div>
      {!isLast && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 2px' }}>
          <ArrowRight size={14} style={{ color: '#ddd' }} />
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
    { key: 'inbound',   label: 'Inbound',   description: 'Email enquiries received', count: inbound,   color: '#3b82f6' },
    { key: 'contacted', label: 'Contacted',  description: 'First reply sent',         count: contacted, color: '#6366f1' },
    { key: 'qualified', label: 'Qualified',  description: 'Intent confirmed',         count: qualified, color: '#8b5cf6' },
    { key: 'converted', label: 'Converted',  description: 'Policy purchased',         count: converted, color: '#111111' },
  ]

  // Breakdown by department
  const depts = ['Sales', 'Customer Support'].map(d => ({
    label: d, count: emailLeads.filter(l => l.department === d).length,
  }))

  // Breakdown by source
  const sources = [
    { label: 'Website form', count: emailLeads.filter(l => l.source === 'website_form').length, color: '#3b82f6' },
    { label: 'Direct email',  count: emailLeads.filter(l => l.source === 'email').length,        color: '#6366f1' },
    { label: 'WhatsApp',      count: waLeads.length,                                              color: '#22c55e' },
    { label: 'Manual entry',  count: emailLeads.filter(l => l.source === 'manual').length,       color: '#f59e0b' },
  ]
  const allSourceTotal = leads.length

  // KPIs
  const convRate       = total ? `${Math.round((converted / total) * 100)}%` : '—'
  const activeLeads    = emailLeads.filter(l => ['new', 'contacted', 'qualified'].includes(l.status)).length

  const DEPT_COLORS: Record<string, string> = {
    'Sales': '#3b82f6',
    'Customer Support': '#f59e0b',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9f9f9', padding: '28px 32px 48px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Analytics</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
            Inbound funnel · all-time · {total} email leads
          </p>
        </div>
        <button
          onClick={() => load(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888', background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          <RefreshCw size={13} strokeWidth={2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0', fontSize: 13, color: '#bbb' }}>Loading data…</div>
      ) : (
        <>

          {/* ── KPI row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            <KpiCard label="Total Inbound"   value={inbound}     sub="Email leads all-time"     icon={Users}      color="#3b82f6" />
            <KpiCard label="Active Pipeline" value={activeLeads} sub="New + contacted + qualified" icon={TrendingUp} color="#6366f1" />
            <KpiCard label="Converted"       value={converted}   sub={`${convRate} of inbound`} icon={Zap}        color="#111"   />
            <KpiCard label="Dropped"         value={dropped}     sub="Disqualified / no response" icon={RotateCcw}  color="#ef4444" />
          </div>

          {/* ── SMB Funnel ── */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '24px 24px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#3b82f6', marginBottom: 4 }}>
                  Journey 1 — SMB Email Sales
                </p>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111' }}>Inbound to Conversion Funnel</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                  Small-medium businesses that contact us via email and decide on purchasing a policy.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: 11, color: '#888' }}>Overall conversion:</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: converted > 0 ? '#111' : '#bbb' }}>{convRate}</span>
              </div>
            </div>

            {/* Funnel bars */}
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
              {smb.map((stage, i) => (
                <div key={stage.key}>
                  <FunnelBar
                    stage={stage}
                    total={inbound || 1}
                    prevCount={i === 0 ? inbound : smb[i - 1].count}
                    isLast={i === smb.length - 1}
                  />
                  {i < smb.length - 1 && (
                    <div style={{ height: 1, background: '#f4f4f5', margin: '0 126px' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Legend note */}
            {inbound === 0 && (
              <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
                No email leads yet. Funnel will populate as leads come in.
              </p>
            )}
          </div>

          {/* ── Breakdown row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* By department */}
            <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '20px 24px' }}>
              <SectionHeader title="By Department" sub="Which team owns the most leads" />
              {depts.map(d => (
                <BreakdownBar
                  key={d.label}
                  label={d.label}
                  count={d.count}
                  total={total}
                  color={DEPT_COLORS[d.label] ?? '#aaa'}
                />
              ))}
              {total === 0 && <p style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>No data yet.</p>}
            </div>

            {/* By source */}
            <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '20px 24px' }}>
              <SectionHeader title="By Source" sub="Where leads are coming from" />
              {sources.map(s => (
                <BreakdownBar
                  key={s.label}
                  label={s.label}
                  count={s.count}
                  total={allSourceTotal}
                  color={s.color}
                />
              ))}
              {allSourceTotal === 0 && <p style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>No data yet.</p>}
            </div>
          </div>

          {/* ── B2C Journey ── */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '24px', marginBottom: 20 }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f59e0b' }}>
                Journey 2 — Individual / B2C Direct Purchase
              </p>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111' }}>Online Self-Serve Funnel</h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                Individuals purchasing Home, Motor, or Travel insurance directly via the website — payment link → policy confirmation.
                Tracking not yet connected; set up data source to activate this funnel.
              </p>
            </div>

            {/* Journey steps */}
            <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4, gap: 0 }}>
              {[
                { step: 1, label: 'Browse',        metric: 'Unique visitors',       color: '#f59e0b' },
                { step: 2, label: 'Quote started',  metric: 'Product page clicks',   color: '#fb923c' },
                { step: 3, label: 'Payment link',   metric: 'Payment link opens',    color: '#f97316' },
                { step: 4, label: 'Paid',           metric: 'Completed payments',    color: '#ea580c' },
                { step: 5, label: 'Policy issued',  metric: 'Confirmation emails',   color: '#c2410c' },
                { step: 6, label: 'Renewal',        metric: '12-month repurchase',   color: '#9a3412', isLast: true },
              ].map((s, i, arr) => (
                <JourneyStep key={s.step} {...s} isLast={i === arr.length - 1} />
              ))}
            </div>

            {/* CTA */}
            <div style={{
              marginTop: 20, padding: '14px 16px', background: '#fffbeb',
              border: '1px dashed #fcd34d', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#92400e' }}>Connect your payment and policy data</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#b45309' }}>
                  Integrate Stripe or your payment processor + policy system to see live B2C conversion data.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, background: '#f59e0b', color: '#fff', flexShrink: 0, marginLeft: 16 }}>
                Coming soon
              </span>
            </div>
          </div>

          {/* ── Suggestions ── */}
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '24px' }}>
            <SectionHeader
              title="Recommended Metrics to Track"
              sub="Based on your two customer journeys — what to measure next"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* SMB suggestions */}
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3b82f6' }}>
                  SMB / Email Sales
                </p>
                {[
                  { metric: 'Time to first reply',    why: 'Fastest response = highest conversion. Target &lt;2h.' },
                  { metric: 'Time in each stage',     why: 'Identify where deals stall. Contacted → Qualified slowdown = qualification problem.' },
                  { metric: 'Drop-off by department', why: 'Sales vs Support conversion rates may differ — different playbooks needed.' },
                  { metric: 'Revenue per converted',  why: 'Track average premium size to forecast pipeline value.' },
                  { metric: 'Renewal rate (12-month)',why: 'SMB policies renew annually. Track to measure true LTV.' },
                  { metric: 'Lead source quality',    why: 'Website form vs direct email — which source converts better and faster?' },
                ].map((r, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < 5 ? '1px solid #f4f4f5' : 'none', display: 'flex', gap: 12 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(59,130,246,0.10)', color: '#3b82f6', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </span>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111' }}>{r.metric}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: r.why }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* B2C suggestions */}
              <div>
                <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f59e0b' }}>
                  Individual / B2C Online
                </p>
                {[
                  { metric: 'Browse → Quote rate',    why: 'What % of visitors start a quote? Low rate = UX or messaging problem.' },
                  { metric: 'Quote → Payment rate',   why: 'Drop here means price or trust friction. A/B test quote page.' },
                  { metric: 'Payment → Policy rate',  why: 'Should be near 100%. Any gap = payment failure or system error.' },
                  { metric: 'Repeat purchase rate',   why: 'Travel insurance is highly recurring. Track 12-month repurchase per customer.' },
                  { metric: 'Product mix',            why: 'Motor vs Travel vs Home — which products drive the most revenue?' },
                  { metric: 'Avg order value',        why: 'Premium per transaction. Drives revenue forecasting and CAC target.' },
                ].map((r, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < 5 ? '1px solid #f4f4f5' : 'none', display: 'flex', gap: 12 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(245,158,11,0.10)', color: '#f59e0b', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </span>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111' }}>{r.metric}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888', lineHeight: 1.5 }}>{r.why}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
