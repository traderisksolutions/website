'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Search, RefreshCw, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

const INK = '#202124'
const MUTED = '#5f6368'
const HAIR = '1px solid #e8eaed'

/** How often the open Purchases tab re-queries for new transactions. */
const POLL_MS = 20_000
/** How long a row that just arrived stays marked as new. */
const NEW_ROW_MS = 60_000

type AnalyticsData = {
  configured?: boolean
  error?: string
  totals?: { visitors: number; sessions: number; searches: number; purchaseIntent: number; issued: number }
  rates?: { conversion: number; repeatVisitor: number; avgSearchesPerSession: number; avgSessionsPerVisitor: number; avgSearchesBeforePurchase: number }
  funnel?: { step: string; journeys: number }[]
  regionSplit?: Record<string, number>
  typeSplit?: Record<string, number>
  failures?: number
}
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const STEP_LABEL: Record<string, string> = {
  quote_open: 'Opened quote', premium: 'Got a price', finalize: 'Proceeded to pay',
  payment_redirect: 'Sent to payment', policy_issued: 'Policy issued',
}

// Grey stat tile: label, then the number. The label carries the meaning; no state colour.
function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[16px] px-5 py-4" style={{ background: '#f1f3f4' }}>
      <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{label}</p>
      <p className="m-0 mt-2 text-[28px] font-medium tracking-[-0.02em] leading-none tabular-nums" style={{ color: INK }}>{value}</p>
    </div>
  )
}

function Split({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  return (
    <div>
      <h3 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>{title}</h3>
      {entries.length === 0 ? (
        <p className="m-0 text-[14px]" style={{ color: MUTED }}>No data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-[13px] capitalize" style={{ color: '#3c4043' }}>{k}</div>
              <div className="h-5 flex-1 overflow-hidden rounded-[4px]" style={{ background: '#f1f3f4' }}><div className="h-full rounded-[4px]" style={{ width: `${(v / total) * 100}%`, background: '#80868b' }} /></div>
              <div className="w-20 text-right text-[12.5px] tabular-nums" style={{ color: MUTED }}>{v} ({((v / total) * 100).toFixed(0)}%)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type Payment = {
  id: string
  partner: string | null
  gateway: string | null
  payment_method: string | null
  proposal_no: string | null
  policy_id: string | null
  policy_no: string | null
  transaction_id: string | null
  payment_ref_no: string | null
  amount: number | null
  currency: string | null
  payment_status: string | null
  error_code: string | null
  paid_date: string | null
  source: string | null
  received_at: string | null
  quoted_premium: number | null
  journey_id: string | null
  // Who bought, and what they bought.
  insured_name: string | null
  nric: string | null
  email: string | null
  mobile: string | null
  age: number | null
  coverage: string | null
  policy_type: string | null
  geo_area: string | null
  max_rental_period: string | null
  policy_start_date: string | null
  policy_end_date: string | null
  cover_days: number | null
  callback_url: string | null
  recon: Recon
  attention: boolean
}

type Recon = 'reconciled' | 'amount_mismatch' | 'unmatched' | 'awaiting_policy_no' | 'awaiting_confirmation' | 'awaiting_payment' | 'failed'
type PaymentSummary = { collected: number; payments: number; reconciled: number; attention: number; awaitingPayment: number }

const RECON_LABEL: Record<Recon, string> = {
  reconciled: 'Reconciled',
  amount_mismatch: 'Amount mismatch',
  unmatched: 'No matching quote',
  awaiting_policy_no: 'Awaiting policy no',
  awaiting_confirmation: 'Awaiting confirmation',
  awaiting_payment: 'Not paid',
  failed: 'Payment failed',
}

// One neutral chip, used only to mark a row that arrived since the last poll. State is words.
const CHIP = 'inline-block whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium leading-4'
const CHIP_STYLE = { background: '#f1f3f4', color: '#3c4043' } as const

type JourneyEvent = {
  id: string
  journey_id: string
  step: string
  status: 'ok' | 'pending' | 'fail'
  error: string | null
  policy_id: string | null
  source: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const fmtDay = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const fmtMoney = (n: number | null, ccy: string | null) =>
  n == null ? '—' : `${ccy ?? 'SGD'} ${n.toFixed(2)}`

// NRIC is shown masked on screen — full numbers belong in the export, which is a
// deliberate act, not something a passer-by reads over a shoulder.
const maskNric = (s: string | null) =>
  !s ? '—' : s.length < 5 ? s : `${s[0]}••••${s.slice(-4)}`

// Journey step outcomes as words.
const STEP_STATUS_LABEL: Record<JourneyEvent['status'], string> = { ok: 'Completed', pending: 'Pending', fail: 'Failed' }

// ── CSV export ────────────────────────────────────────────────────────────
// The full transaction record, including the unmasked NRIC and the contact
// details — an abandoned checkout is only actionable if you can call the person.
const CSV_COLUMNS: { header: string; value: (p: Payment) => string | number | null }[] = [
  { header: 'Date', value: (p) => p.received_at },
  { header: 'Status', value: (p) => RECON_LABEL[p.recon] },
  { header: 'Name', value: (p) => p.insured_name },
  { header: 'NRIC / FIN', value: (p) => p.nric },
  { header: 'Age', value: (p) => p.age },
  { header: 'Email', value: (p) => p.email },
  { header: 'Mobile', value: (p) => p.mobile },
  { header: 'Coverage', value: (p) => p.coverage },
  { header: 'Max rental period', value: (p) => p.max_rental_period },
  { header: 'Cover start', value: (p) => p.policy_start_date },
  { header: 'Cover end', value: (p) => p.policy_end_date },
  { header: 'Days of coverage', value: (p) => p.cover_days },
  { header: 'Premium quoted', value: (p) => p.quoted_premium },
  { header: 'Amount paid', value: (p) => p.amount },
  { header: 'Currency', value: (p) => p.currency },
  { header: 'Payment status', value: (p) => p.payment_status },
  { header: 'Payment method', value: (p) => p.payment_method },
  { header: 'Policy no', value: (p) => p.policy_no },
  { header: 'Policy id', value: (p) => p.policy_id },
  { header: 'Proposal no', value: (p) => p.proposal_no },
  { header: 'Payment ref', value: (p) => p.payment_ref_no ?? p.transaction_id },
  { header: 'Paid date', value: (p) => p.paid_date },
  { header: 'Journey ref', value: (p) => p.journey_id },
  { header: 'Source', value: (p) => p.source },
  // What ECICS was told to call back on for this transaction, secret removed.
  { header: 'Callback URL', value: (p) => p.callback_url },
]

/** Quote a CSV field, and defuse anything a spreadsheet would run as a formula. */
function csvCell(v: string | number | null): string {
  if (v == null) return ''
  const s = String(v)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv(rows: Payment[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(',')]
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(r))).join(','))
  // BOM so Excel reads UTF-8 names correctly.
  return `﻿${lines.join('\r\n')}\r\n`
}

function download(filename: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Shared control classes (tokens) ───────────────────────────────────────
const inputCls = 'h-10 w-full sm:w-[340px] rounded-[10px] bg-white pl-10 pr-3.5 text-[14px] outline-none focus:border-[#202124] transition-colors placeholder:text-[#80868b]'
const inputStyle = { border: '1px solid #dadce0', color: INK } as const
const primaryCls = 'h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
const secondaryCls = 'inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-white text-[14px] font-medium cursor-pointer whitespace-nowrap hover:bg-[#f8f9fa] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const secondaryStyle = { border: '1px solid #dadce0', color: INK } as const
const tertiaryCls = 'text-[14px] bg-transparent border-0 cursor-pointer p-0 underline underline-offset-4'
const MONO = 'ui-monospace, monospace'

function LoadingRows() {
  return (
    <div aria-busy="true" className="mt-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 flex items-center gap-8" style={{ borderBottom: HAIR }}>
          <span className="h-3.5 w-32 rounded bg-[#f1f3f4] animate-pulse" />
          <span className="h-3.5 w-24 rounded bg-[#f1f3f4] animate-pulse" />
          <span className="h-3.5 w-40 rounded bg-[#f1f3f4] animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  )
}

export default function RoadplusReconPage() {
  const [tab, setTab] = useState<'payments' | 'journey' | 'analytics'>('payments')
  const [configured, setConfigured] = useState(true)

  // ── payments ──────────────────────────────────────────────────────────
  const [payments, setPayments] = useState<Payment[]>([])
  const [pSummary, setPSummary] = useState<PaymentSummary | null>(null)
  const [pError, setPError] = useState<string | null>(null)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [pQuery, setPQuery] = useState('')
  const [pLoading, setPLoading] = useState(true)

  // ── live listener ───────────────────────────────────────────────────────
  // The roadplus database is reachable only with its service key, which stays on
  // the server — so no client subscription. Polling this route every 20s is the
  // honest version of "live": one cheap query, and a tab left open on a wall
  // screen shows a purchase within 20 seconds of it happening.
  const [live, setLive] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [newIds, setNewIds] = useState<string[]>([])
  const seenIds = useRef<Record<string, true> | null>(null)
  const appliedQuery = useRef('')

  const loadPayments = useCallback(async (q = '', opts: { quiet?: boolean } = {}) => {
    appliedQuery.current = q
    if (!opts.quiet) setPLoading(true)
    try {
      const res = await fetch(`/api/roadplus/payments${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' })
      const data = await res.json()
      const rows: Payment[] = data.rows ?? []
      setConfigured(data.configured !== false)
      setPayments(rows)
      setPSummary(data.summary ?? null)
      setPError(data.error ?? null)
      setLastSync(new Date())

      // Flag whatever arrived since the last poll. The first load establishes the
      // baseline — everything is "new" then, which would just be noise.
      const ids: Record<string, true> = {}
      for (const r of rows) ids[r.id] = true
      const before = seenIds.current
      seenIds.current = ids
      if (before) {
        const fresh = rows.filter((r) => !before[r.id]).map((r) => r.id)
        if (fresh.length) {
          setNewIds((prev) => prev.concat(fresh))
          setTimeout(() => setNewIds((prev) => prev.filter((id) => fresh.indexOf(id) === -1)), NEW_ROW_MS)
        }
      }
    } finally {
      if (!opts.quiet) setPLoading(false)
    }
  }, [])

  useEffect(() => { loadPayments() }, [loadPayments])

  useEffect(() => {
    if (!live || tab !== 'payments') return
    const id = setInterval(() => {
      // A background tab polls nothing — it would just burn queries.
      if (document.visibilityState === 'visible') loadPayments(appliedQuery.current, { quiet: true })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [live, tab, loadPayments])

  const visible = payments.filter((p) => !attentionOnly || p.attention)

  const exportCsv = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10)
    download(`roadplus-transactions-${stamp}.csv`, toCsv(visible))
  }, [visible])

  // ── reconcile trigger (Phase 4) ─────────────────────────────────────────
  const [recon, setRecon] = useState<{ running: boolean; msg?: string }>({ running: false })
  const runReconcile = useCallback(async () => {
    setRecon({ running: true })
    try {
      const res = await fetch('/api/roadplus/reconcile', { method: 'POST' })
      const d = await res.json()
      if (d.configured === false)
        setRecon({ running: false, msg: 'Not configured. Set ROADPLUS_SITE_URL and the reconcile secret.' })
      else if (d.ok === false)
        setRecon({ running: false, msg: `Failed: ${d.error ?? 'error'}` })
      else
        setRecon({ running: false, msg: `Scanned ${d.scanned ?? 0} · reconciled ${d.reconciled ?? 0} · still pending ${d.pending ?? 0}.` })
      loadPayments(pQuery)
    } catch (e) {
      setRecon({ running: false, msg: `Error: ${String(e)}` })
    }
  }, [loadPayments, pQuery])

  // ── journey ───────────────────────────────────────────────────────────
  const [jQuery, setJQuery] = useState('')
  const [journey, setJourney] = useState<JourneyEvent[]>([])
  const [jLoading, setJLoading] = useState(false)
  const [jSearched, setJSearched] = useState(false)

  const loadJourney = useCallback(async (q: string) => {
    setJLoading(true)
    setJSearched(true)
    try {
      const term = q.trim()
      const param = term
        ? term.toUpperCase().startsWith('RP-')
          ? `ref=${encodeURIComponent(term)}`
          : `policy_id=${encodeURIComponent(term)}`
        : ''
      const res = await fetch(`/api/roadplus/journey${param ? `?${param}` : ''}`, { cache: 'no-store' })
      const data = await res.json()
      setConfigured(data.configured !== false)
      setJourney(data.rows ?? [])
    } finally {
      setJLoading(false)
    }
  }, [])

  // ── analytics (Phase 3) ─────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [aLoading, setALoading] = useState(false)
  const loadAnalytics = useCallback(async () => {
    setALoading(true)
    try {
      const res = await fetch('/api/roadplus/analytics', { cache: 'no-store' })
      const d: AnalyticsData = await res.json()
      setConfigured(d.configured !== false)
      setAnalytics(d)
    } finally {
      setALoading(false)
    }
  }, [])
  useEffect(() => { if (tab === 'analytics' && !analytics) loadAnalytics() }, [tab, analytics, loadAnalytics])

  const TABS = [
    { key: 'payments' as const, label: 'Purchases' },
    { key: 'journey' as const, label: 'Journey lookup' },
    { key: 'analytics' as const, label: 'Analytics' },
  ]

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK }}>
      <div className="mx-auto max-w-[1400px] px-6 sm:px-12 pt-12 pb-20">

        {/* Header */}
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">RoadPlus reconciliation</h1>
            <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>
              Every purchase attempt, its payment and its journey trace, read live from the roadplus database. Read-only.
            </p>
          </div>
        </div>

        {!configured && (
          <p className="m-0 mt-6 text-[14px] leading-relaxed" style={{ color: '#3c4043' }}>
            The roadplus database is not connected. Set <code className="font-mono text-[13px]">ROADPLUS_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-[13px]">ROADPLUS_SUPABASE_SERVICE_KEY</code> on this dashboard&rsquo;s Vercel project
            (the roadplus project&rsquo;s URL and service-role key), then redeploy.
          </p>
        )}

        {/* Tabs */}
        <div className="mt-6 flex items-center gap-6" role="tablist" aria-label="RoadPlus views" style={{ borderBottom: HAIR }}>
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={cn('relative pb-2.5 bg-transparent border-0 cursor-pointer text-[15px]', on ? 'font-medium' : 'hover:text-[#202124]')}
                style={{ color: on ? INK : MUTED }}
              >
                {t.label}
                <span className={cn('absolute left-0 right-0 -bottom-px h-[2px] rounded-full', on ? 'block' : 'hidden')} style={{ background: INK }} aria-hidden />
              </button>
            )
          })}
        </div>

        {/* ── PAYMENTS ── */}
        {tab === 'payments' && (
          <div className="mt-6">
            <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
              <form
                onSubmit={(e) => { e.preventDefault(); loadPayments(pQuery) }}
                className="flex items-center gap-2 flex-wrap"
              >
                <label className="relative block w-full sm:w-auto">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} aria-hidden />
                  <input
                    value={pQuery}
                    onChange={(e) => setPQuery(e.target.value)}
                    placeholder="Policy no, policy id, proposal or txn id"
                    aria-label="Search purchases"
                    className={inputCls}
                    style={inputStyle}
                  />
                </label>
                <button type="submit" className={primaryCls} style={{ background: INK }}>Search</button>
                {pQuery && (
                  <button type="button" onClick={() => { setPQuery(''); loadPayments() }} className={tertiaryCls} style={{ color: MUTED }}>Clear</button>
                )}
              </form>
              <div className="flex items-center gap-3 flex-wrap">
                {recon.msg && <span className="text-[13px]" style={{ color: MUTED }}>{recon.msg}</span>}
                <button
                  type="button"
                  onClick={() => setLive((v) => !v)}
                  aria-pressed={live}
                  title={live ? `Checks for new transactions every ${POLL_MS / 1000}s` : 'Live updates paused'}
                  className="inline-flex items-center gap-2 h-10 px-2 text-[13px] bg-transparent border-0 cursor-pointer hover:underline underline-offset-4"
                  style={{ color: MUTED }}
                >
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: live ? '#9aa0a6' : '#dadce0' }} aria-hidden />
                  {live ? 'Live' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={visible.length === 0}
                  title="Download the rows below, with full NRIC and contact details"
                  className={secondaryCls}
                  style={secondaryStyle}
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={runReconcile}
                  disabled={recon.running}
                  title="Ask ECICS to backfill any paid-but-unrecorded policies"
                  className={secondaryCls}
                  style={secondaryStyle}
                >
                  {recon.running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Run reconcile
                </button>
              </div>
            </div>

            {pSummary && (
              <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Tile label="Collected" value={fmtMoney(pSummary.collected, 'SGD')} />
                <Tile label="Payments" value={pSummary.payments} />
                <Tile label="Reconciled" value={`${pSummary.reconciled} / ${pSummary.payments}`} />
                <Tile label="To check" value={pSummary.attention} />
                <Tile label="Awaiting payment" value={pSummary.awaitingPayment} />
              </div>
            )}
            {pError && <p className="m-0 mb-4 text-[14px]" style={{ color: MUTED }}>{pError}</p>}

            {pLoading ? (
              <LoadingRows />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-[14px] cursor-pointer" style={{ color: INK }}>
                    <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} className="w-4 h-4 accent-[#202124]" />
                    To check only
                    <Tip text="Payments the reconcile could not settle. Run reconcile first. If a row stays, email ECICS with its policy id." />
                  </label>
                  <span className="text-[12.5px]" style={{ color: MUTED }}>
                    {visible.length} row{visible.length === 1 ? '' : 's'}
                    {lastSync && ` · updated ${lastSync.toLocaleTimeString('en-SG', { hour12: false })}`}
                    {' · NRIC masked on screen, full value in the export'}
                  </span>
                </div>
                <Register label="Purchase attempts" minWidth={1240} maxHeight="calc(100vh - 220px)">
                  <RegisterHead>
                    <RegisterTh first hint="When the attempt was recorded, and its reconciliation state">Date and status</RegisterTh>
                    <RegisterTh>Customer</RegisterTh>
                    <RegisterTh align="right">Age</RegisterTh>
                    <RegisterTh hint="Masked on screen; the full value is in the export">NRIC / FIN</RegisterTh>
                    <RegisterTh>Coverage</RegisterTh>
                    <RegisterTh>Cover period</RegisterTh>
                    <RegisterTh align="right">Days</RegisterTh>
                    <RegisterTh align="right">Premium</RegisterTh>
                    <RegisterTh align="right">Paid</RegisterTh>
                    <RegisterTh>Policy no</RegisterTh>
                    <RegisterTh>Policy id</RegisterTh>
                    <RegisterTh last>Source</RegisterTh>
                  </RegisterHead>
                  <tbody>
                    {visible.length === 0 ? (
                      <RegisterEmpty colSpan={12}>
                        {payments.length > 0
                          ? 'No rows match this filter.'
                          : pQuery
                            ? 'Nothing matches that reference.'
                            : 'No purchase attempts yet. A row appears as soon as a customer reaches the ECICS payment page.'}
                      </RegisterEmpty>
                    ) : (
                      visible.map((p) => (
                        <RegisterRow key={p.id} className="hover:bg-[#f8f9fa]">
                          <RegisterCell first className="min-w-[240px]"
                            primary={<>{newIds.indexOf(p.id) !== -1 && <span className={cn(CHIP, 'mr-2 align-middle')} style={CHIP_STYLE}>New</span>}{fmtDate(p.received_at)}</>}
                            secondary={RECON_LABEL[p.recon]} />
                          <RegisterCell><span className="text-[14px] font-medium" style={{ color: INK }}>{p.insured_name ?? '—'}</span></RegisterCell>
                          <RegisterCell align="right" primary={p.age ?? '—'} />
                          <RegisterCell title="Full value is in the CSV export"><span className="text-[12.5px]" style={{ fontFamily: MONO, color: MUTED }}>{maskNric(p.nric)}</span></RegisterCell>
                          <RegisterCell primary={p.coverage ?? '—'} secondary={p.max_rental_period ? `max ${p.max_rental_period}` : undefined} />
                          <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{p.policy_start_date ? `${fmtDay(p.policy_start_date)} → ${fmtDay(p.policy_end_date)}` : '—'}</span></RegisterCell>
                          <RegisterCell align="right" primary={p.cover_days ?? '—'} />
                          <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: MUTED }}>{fmtMoney(p.quoted_premium, p.currency)}</span></RegisterCell>
                          <RegisterCell align="right"><span className="text-[14px] tabular-nums font-medium" style={{ color: INK }}>{fmtMoney(p.amount, p.currency)}</span></RegisterCell>
                          <RegisterCell><span className="text-[12.5px]" style={{ fontFamily: MONO, color: INK }}>{p.policy_no ?? '—'}</span></RegisterCell>
                          <RegisterCell><span className="text-[12.5px]" style={{ fontFamily: MONO, color: MUTED }}>{p.policy_id ?? '—'}</span></RegisterCell>
                          <RegisterCell last><span className="text-[14px]" style={{ color: MUTED }}>{p.source ?? '—'}</span></RegisterCell>
                        </RegisterRow>
                      ))
                    )}
                  </tbody>
                </Register>
              </>
            )}
          </div>
        )}

        {/* ── JOURNEY ── */}
        {tab === 'journey' && (
          <div className="mt-6">
            <form
              onSubmit={(e) => { e.preventDefault(); loadJourney(jQuery) }}
              className="mb-5 flex items-center gap-2 flex-wrap"
            >
              <label className="relative block w-full sm:w-auto">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#80868b' }} aria-hidden />
                <input
                  value={jQuery}
                  onChange={(e) => setJQuery(e.target.value)}
                  placeholder="Reference (RP-XXXXXX) or policy id"
                  aria-label="Journey reference or policy id"
                  className={inputCls}
                  style={inputStyle}
                />
              </label>
              <button type="submit" className={primaryCls} style={{ background: INK }}>Look up</button>
              <button type="button" onClick={() => { setJQuery(''); loadJourney('') }} className={tertiaryCls} style={{ color: MUTED }}>Recent failures</button>
            </form>

            {jLoading ? (
              <LoadingRows />
            ) : !jSearched ? (
              <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>Enter a reference from a customer&rsquo;s error message, or a policy id. Recent failures lists the latest failed steps.</p>
            ) : journey.length === 0 ? (
              <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>No journey events found.</p>
            ) : (
              <Register label="Journey events" minWidth={840}>
                <RegisterHead>
                  <RegisterTh first>Step</RegisterTh>
                  <RegisterTh>Time</RegisterTh>
                  <RegisterTh>Status</RegisterTh>
                  <RegisterTh>Detail or error</RegisterTh>
                  <RegisterTh last>Source</RegisterTh>
                </RegisterHead>
                <tbody>
                  {journey.map((e) => (
                    <RegisterRow key={e.id} className="hover:bg-[#f8f9fa]">
                      <RegisterCell first primary={e.step} secondary={<span style={{ fontFamily: MONO }}>{e.journey_id}</span>} title={e.journey_id} />
                      <RegisterCell primary={fmtDate(e.created_at)} />
                      <RegisterCell><span className="text-[14px]" style={{ color: INK }}>{STEP_STATUS_LABEL[e.status] ?? e.status}</span></RegisterCell>
                      <RegisterCell nowrap={false}>
                        <span className="block max-w-[420px] text-[14px] break-words" style={{ color: '#3c4043' }}>
                          {e.error ? e.error : e.meta ? <span className="text-[12px]" style={{ fontFamily: MONO, color: MUTED }}>{JSON.stringify(e.meta)}</span> : '—'}
                        </span>
                      </RegisterCell>
                      <RegisterCell last><span className="text-[14px]" style={{ color: MUTED }}>{e.source ?? '—'}</span></RegisterCell>
                    </RegisterRow>
                  ))}
                </tbody>
              </Register>
            )}
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === 'analytics' && (
          <div className="mt-6">
            <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
              <p className="m-0 text-[13px]" style={{ color: MUTED }}>
                Visitors, sessions and journeys without login. Most recent activity.
              </p>
              <button
                type="button"
                onClick={loadAnalytics}
                disabled={aLoading}
                className={secondaryCls}
                style={secondaryStyle}
              >
                {aLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>

            {aLoading && !analytics ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[88px] rounded-[16px] bg-[#f1f3f4] animate-pulse" />)}
              </div>
            ) : !analytics || analytics.configured === false ? (
              <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>Not connected. Set the roadplus database env vars.</p>
            ) : analytics.error ? (
              <p className="m-0 py-16 text-center text-[16px]" style={{ color: MUTED }}>{analytics.error}</p>
            ) : (
              <div className="space-y-10">
                {/* stat tiles */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <Tile label="Visitors" value={analytics.totals!.visitors} />
                  <Tile label="Sessions" value={analytics.totals!.sessions} />
                  <Tile label="Searches" value={analytics.totals!.searches} />
                  <Tile label="Policies issued" value={analytics.totals!.issued} />
                  <Tile label="Failed steps" value={analytics.failures ?? 0} />
                  <Tile label="Conversion" value={pct(analytics.rates!.conversion)} />
                  <Tile label="Repeat visitors" value={pct(analytics.rates!.repeatVisitor)} />
                  <Tile label="Searches per session" value={analytics.rates!.avgSearchesPerSession.toFixed(1)} />
                  <Tile label="Sessions per visitor" value={analytics.rates!.avgSessionsPerVisitor.toFixed(1)} />
                  <Tile label="Searches before purchase" value={analytics.rates!.avgSearchesBeforePurchase.toFixed(1)} />
                </div>

                {/* funnel */}
                <div>
                  <h3 className="m-0 mb-3 text-[16px] font-medium tracking-[-0.01em] flex items-center" style={{ color: INK }}>
                    Conversion funnel
                    <Tip text="Unique journeys reaching each step. The right-hand figure is the drop from the previous step." />
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const funnel = analytics.funnel ?? []
                      const max = Math.max(1, ...funnel.map((f) => f.journeys))
                      return funnel.map((f, i) => {
                        const prev = i > 0 ? funnel[i - 1].journeys : f.journeys
                        const drop = prev > 0 ? 1 - f.journeys / prev : 0
                        return (
                          <div key={f.step} className="flex items-center gap-3">
                            <div className="w-40 shrink-0 text-[13px]" style={{ color: '#3c4043' }}>{STEP_LABEL[f.step] ?? f.step}</div>
                            <div className="h-6 flex-1 overflow-hidden rounded-[4px]" style={{ background: '#f1f3f4' }}>
                              <div
                                className="flex h-full items-center rounded-[4px] px-2 text-[11.5px] font-medium text-white tabular-nums"
                                style={{ width: `${Math.max(4, (f.journeys / max) * 100)}%`, background: INK }}
                              >
                                {f.journeys}
                              </div>
                            </div>
                            <div className="w-16 text-right text-[12.5px] tabular-nums" style={{ color: MUTED }}>
                              {i > 0 && drop > 0 ? `−${(drop * 100).toFixed(0)}%` : ''}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>

                {/* splits */}
                <div className="grid gap-8 sm:grid-cols-2">
                  <Split title="Searches by region" data={analytics.regionSplit ?? {}} />
                  <Split title="Searches by policy type" data={analytics.typeSplit ?? {}} />
                </div>
              </div>
            )}
          </div>
        )}

        <p className="m-0 mt-8 text-[12.5px]" style={{ color: MUTED }}>
          Read live from the roadplus Supabase project. This page never writes to it.
        </p>
      </div>
    </div>
  )
}
