'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, Search, AlertTriangle, ExternalLink, RefreshCw, Download, Play } from 'lucide-react'

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

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: 'rose' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tabular-nums ${tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function Split({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  return (
    <div>
      <h3 className="mb-3 text-[13px] font-semibold text-slate-800">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-[12.5px] text-slate-400">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-[12.5px] capitalize text-slate-600">{k}</div>
              <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-slate-400" style={{ width: `${(v / total) * 100}%` }} /></div>
              <div className="w-16 text-right text-[11px] tabular-nums text-slate-400">{v} ({((v / total) * 100).toFixed(0)}%)</div>
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

function ReconPill({ r, attention }: { r: Recon; attention: boolean }) {
  const cls =
    r === 'reconciled'
      ? 'bg-emerald-100 text-emerald-700'
      : r === 'failed' || attention
        ? 'bg-rose-100 text-rose-700'
        : // Not paid yet is the normal state of a live checkout, not a problem.
          r === 'awaiting_payment'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-amber-100 text-amber-700'
  return <span className={`inline-block whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[11px] font-medium ${cls}`}>{RECON_LABEL[r]}</span>
}

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

function StatusPill({ s }: { s: string | null }) {
  // No payment row yet — a pill would imply a gateway result we never got.
  if (!s) return <span className="text-slate-400">—</span>
  const v = s.toLowerCase()
  const cls =
    v === 'success' || v === 'ok'
      ? 'bg-emerald-100 text-emerald-700'
      : v === 'failed' || v === 'fail'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-amber-100 text-amber-700'
  return <span className={`inline-block rounded-[6px] px-2 py-0.5 text-[11px] font-medium ${cls}`}>{s ?? '—'}</span>
}

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
        setRecon({ running: false, msg: 'Not configured — set ROADPLUS_SITE_URL + reconcile secret.' })
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

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-8 py-7">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[20px] font-semibold text-slate-900">RoadPlus Reconciliation</h1>
        </div>
        <p className="text-[13px] text-slate-500">
          Every purchase attempt, its payment and its journey trace, read live from the separate <b>roadplus</b> database (read-only).
        </p>

        {!configured && (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              The roadplus database isn&rsquo;t connected. Set <code className="font-mono">ROADPLUS_SUPABASE_URL</code> and{' '}
              <code className="font-mono">ROADPLUS_SUPABASE_SERVICE_KEY</code> on this dashboard&rsquo;s Vercel project
              (the roadplus project&rsquo;s URL + service-role key), then redeploy.
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="mt-6 flex gap-1 border-b border-slate-200">
          {(['payments', 'journey', 'analytics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'payments' ? 'Purchases' : t === 'journey' ? 'Journey lookup' : 'Analytics'}
            </button>
          ))}
        </div>

        {/* ── PAYMENTS ── */}
        {tab === 'payments' && (
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
              <form
                onSubmit={(e) => { e.preventDefault(); loadPayments(pQuery) }}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={pQuery}
                    onChange={(e) => setPQuery(e.target.value)}
                    placeholder="Policy no / policy id / proposal / txn id…"
                    className="w-80 rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
                <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-800">Search</button>
                {pQuery && (
                  <button type="button" onClick={() => { setPQuery(''); loadPayments() }} className="text-[12.5px] text-slate-400 hover:text-slate-600">Clear</button>
                )}
              </form>
              <div className="flex items-center gap-2">
                {recon.msg && <span className="text-[12px] text-slate-500">{recon.msg}</span>}
                <button
                  onClick={() => setLive((v) => !v)}
                  title={live ? `Checking for new transactions every ${POLL_MS / 1000}s` : 'Live updates paused'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {live ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      Live
                    </>
                  ) : (
                    <><Play size={13} /> Paused</>
                  )}
                </button>
                <button
                  onClick={exportCsv}
                  disabled={visible.length === 0}
                  title="Download the rows below, with full NRIC and contact details"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <button
                  onClick={runReconcile}
                  disabled={recon.running}
                  title="Ask ECICS to backfill any paid-but-unrecorded policies"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {recon.running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Run reconcile
                </button>
              </div>
            </div>

            {pSummary && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Tile label="Collected" value={fmtMoney(pSummary.collected, 'SGD')} />
                <Tile label="Payments" value={pSummary.payments} />
                <Tile label="Reconciled" value={`${pSummary.reconciled} / ${pSummary.payments}`} />
                <Tile label="Needs attention" value={pSummary.attention} tone={pSummary.attention ? 'rose' : undefined} />
                <Tile label="Awaiting payment" value={pSummary.awaitingPayment} />
              </div>
            )}
            {pSummary && pSummary.attention > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] text-rose-700">
                <AlertTriangle size={14} className="shrink-0" />
                <span>
                  {pSummary.attention} payment{pSummary.attention === 1 ? '' : 's'} need{pSummary.attention === 1 ? 's' : ''} checking.
                  Run reconcile first. If it stays, email ECICS with the policy id.
                </span>
                <button onClick={() => setAttentionOnly(true)} className="ml-auto font-medium underline">Show them</button>
              </div>
            )}
            {pError && <p className="mb-3 text-[12.5px] text-rose-600">{pError}</p>}

            {pLoading ? (
              <div className="flex items-center gap-2 py-10 text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-600">
                    <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
                    Needs attention only
                  </label>
                  <span className="text-[11.5px] text-slate-400">
                    {visible.length} row{visible.length === 1 ? '' : 's'}
                    {lastSync && ` · updated ${lastSync.toLocaleTimeString('en-SG', { hour12: false })}`}
                    {' · NRIC masked on screen, full value in the export'}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 overflow-x-auto">
                  <table className="data-table w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="pl-4 text-left">Date</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Customer</th>
                        <th className="text-left">Age</th>
                        <th className="text-left">NRIC / FIN</th>
                        <th className="text-left">Coverage</th>
                        <th className="text-left">Cover period</th>
                        <th className="text-left">Days</th>
                        <th className="text-left">Premium</th>
                        <th className="text-left">Paid</th>
                        <th className="text-left">Policy no</th>
                        <th className="text-left">Policy id</th>
                        <th className="text-left pr-4">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="px-4 py-10 text-center text-[13px] text-slate-400">
                            {payments.length > 0
                              ? 'No rows match this filter.'
                              : pQuery
                                ? 'Nothing matches that reference.'
                                : 'No purchase attempts yet. A row appears as soon as a customer reaches the ECICS payment page.'}
                          </td>
                        </tr>
                      ) : (
                        visible.map((p) => (
                          <tr
                            key={p.id}
                            className={
                              newIds.indexOf(p.id) !== -1
                                ? 'bg-emerald-50/70'
                                : p.attention
                                  ? 'bg-rose-50/60'
                                  : undefined
                            }
                          >
                            <td className="pl-4 whitespace-nowrap">
                              {newIds.indexOf(p.id) !== -1 && (
                                <span className="mr-1.5 rounded-[5px] bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                  New
                                </span>
                              )}
                              {fmtDate(p.received_at)}
                            </td>
                            <td><ReconPill r={p.recon} attention={p.attention} /></td>
                            <td className="whitespace-nowrap font-medium text-slate-800">{p.insured_name ?? '—'}</td>
                            <td className="tabular-nums text-slate-600">{p.age ?? '—'}</td>
                            <td className="font-mono text-[11.5px] text-slate-500" title="Full value is in the CSV export">{maskNric(p.nric)}</td>
                            <td className="whitespace-nowrap text-slate-600">
                              {p.coverage ?? '—'}
                              {p.max_rental_period && <span className="text-slate-400"> · max {p.max_rental_period}</span>}
                            </td>
                            <td className="whitespace-nowrap text-slate-500">
                              {p.policy_start_date ? `${fmtDay(p.policy_start_date)} → ${fmtDay(p.policy_end_date)}` : '—'}
                            </td>
                            <td className="tabular-nums text-slate-600">{p.cover_days ?? '—'}</td>
                            <td className="tabular-nums text-slate-500">{fmtMoney(p.quoted_premium, p.currency)}</td>
                            <td className={`font-medium tabular-nums ${p.recon === 'amount_mismatch' ? 'text-rose-600' : 'text-slate-800'}`}>{fmtMoney(p.amount, p.currency)}</td>
                            <td className="font-mono text-[11.5px]">{p.policy_no ?? '—'}</td>
                            <td className="font-mono text-[11.5px] text-slate-500">{p.policy_id ?? '—'}</td>
                            <td className="pr-4 text-slate-400">{p.source ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── JOURNEY ── */}
        {tab === 'journey' && (
          <div className="mt-5">
            <form
              onSubmit={(e) => { e.preventDefault(); loadJourney(jQuery) }}
              className="mb-3 flex items-center gap-2"
            >
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={jQuery}
                  onChange={(e) => setJQuery(e.target.value)}
                  placeholder="Reference (RP-XXXXXX) or policy id…"
                  className="w-80 rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-800">Look up</button>
              <button type="button" onClick={() => { setJQuery(''); loadJourney('') }} className="text-[12.5px] text-slate-400 hover:text-slate-600">Recent failures</button>
            </form>

            {jLoading ? (
              <div className="flex items-center gap-2 py-10 text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : !jSearched ? (
              <p className="py-10 text-center text-[13px] text-slate-400">Enter a reference (from a customer&rsquo;s error message) or a policy id — or hit &ldquo;Recent failures&rdquo;.</p>
            ) : journey.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-400">No journey events found.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="data-table w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="pl-4 text-left">Time</th>
                      <th className="text-left">Reference</th>
                      <th className="text-left">Step</th>
                      <th className="text-left">Status</th>
                      <th className="text-left">Detail / error</th>
                      <th className="text-left pr-4">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journey.map((e) => (
                      <tr key={e.id} className={e.status === 'fail' ? 'bg-rose-50/60' : undefined}>
                        <td className="pl-4 whitespace-nowrap text-slate-500">{fmtDate(e.created_at)}</td>
                        <td className="font-mono text-[11.5px]">{e.journey_id}</td>
                        <td className="font-medium text-slate-800">{e.step}</td>
                        <td><StatusPill s={e.status} /></td>
                        <td className="text-slate-600 max-w-[360px]">
                          {e.error ? <span className="text-rose-600">{e.error}</span> : e.meta ? <span className="font-mono text-[11px] text-slate-400">{JSON.stringify(e.meta)}</span> : '—'}
                        </td>
                        <td className="pr-4 text-slate-400">{e.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === 'analytics' && (
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-slate-500">
                No-login behaviour across visitors, sessions &amp; journeys (most recent activity).
              </p>
              <button
                onClick={loadAnalytics}
                disabled={aLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {aLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Refresh
              </button>
            </div>

            {aLoading && !analytics ? (
              <div className="flex items-center gap-2 py-10 text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : !analytics || analytics.configured === false ? (
              <p className="py-10 text-center text-[13px] text-slate-400">Not connected — set the roadplus database env vars.</p>
            ) : analytics.error ? (
              <p className="py-10 text-center text-[13px] text-rose-500">{analytics.error}</p>
            ) : (
              <div className="space-y-8">
                {/* stat tiles */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Tile label="Visitors" value={analytics.totals!.visitors} />
                  <Tile label="Sessions" value={analytics.totals!.sessions} />
                  <Tile label="Searches" value={analytics.totals!.searches} />
                  <Tile label="Policies issued" value={analytics.totals!.issued} />
                  <Tile label="Failed steps" value={analytics.failures ?? 0} tone="rose" />
                  <Tile label="Conversion" value={pct(analytics.rates!.conversion)} />
                  <Tile label="Repeat visitors" value={pct(analytics.rates!.repeatVisitor)} />
                  <Tile label="Searches / session" value={analytics.rates!.avgSearchesPerSession.toFixed(1)} />
                  <Tile label="Sessions / visitor" value={analytics.rates!.avgSessionsPerVisitor.toFixed(1)} />
                  <Tile label="Searches before buy" value={analytics.rates!.avgSearchesBeforePurchase.toFixed(1)} />
                </div>

                {/* funnel */}
                <div>
                  <h3 className="mb-3 text-[13px] font-semibold text-slate-800">
                    Conversion funnel <span className="font-normal text-slate-400">— unique journeys reaching each step</span>
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
                            <div className="w-40 shrink-0 text-[12.5px] text-slate-600">{STEP_LABEL[f.step] ?? f.step}</div>
                            <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                              <div
                                className="flex h-full items-center rounded bg-slate-800 px-2 text-[11px] font-semibold text-white"
                                style={{ width: `${Math.max(4, (f.journeys / max) * 100)}%` }}
                              >
                                {f.journeys}
                              </div>
                            </div>
                            <div className="w-16 text-right text-[11px] tabular-nums text-slate-400">
                              {i > 0 && drop > 0 ? `−${(drop * 100).toFixed(0)}%` : ''}
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>

                {/* splits */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <Split title="Searches by region" data={analytics.regionSplit ?? {}} />
                  <Split title="Searches by policy type" data={analytics.typeSplit ?? {}} />
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-[11.5px] text-slate-400 flex items-center gap-1">
          <ExternalLink size={11} /> Data is read live from the roadplus Supabase project; this view never writes to it.
        </p>
      </div>
    </div>
  )
}
