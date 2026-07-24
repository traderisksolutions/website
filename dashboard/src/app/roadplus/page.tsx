'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'

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
const fmtMoney = (n: number | null, ccy: string | null) =>
  n == null ? '—' : `${ccy ?? 'SGD'} ${n.toFixed(2)}`

function StatusPill({ s }: { s: string | null }) {
  const v = (s ?? '').toLowerCase()
  const cls =
    v === 'success' || v === 'ok'
      ? 'bg-emerald-100 text-emerald-700'
      : v === 'failed' || v === 'fail'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-amber-100 text-amber-700'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{s ?? '—'}</span>
}

export default function RoadplusReconPage() {
  const [tab, setTab] = useState<'payments' | 'journey'>('payments')
  const [configured, setConfigured] = useState(true)

  // ── payments ──────────────────────────────────────────────────────────
  const [payments, setPayments] = useState<Payment[]>([])
  const [pQuery, setPQuery] = useState('')
  const [pLoading, setPLoading] = useState(true)

  const loadPayments = useCallback(async (q = '') => {
    setPLoading(true)
    try {
      const res = await fetch(`/api/roadplus/payments${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' })
      const data = await res.json()
      setConfigured(data.configured !== false)
      setPayments(data.rows ?? [])
    } finally {
      setPLoading(false)
    }
  }, [])

  useEffect(() => { loadPayments() }, [loadPayments])

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

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-8 py-7">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-[20px] font-semibold text-slate-900">RoadPlus Reconciliation</h1>
        </div>
        <p className="text-[13px] text-slate-500">
          Live payments ledger &amp; journey traces from the separate <b>roadplus</b> database (read-only).
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
          {(['payments', 'journey'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'payments' ? 'Payments' : 'Journey lookup'}
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

            {pLoading ? (
              <div className="flex items-center gap-2 py-10 text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : payments.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-400">No payments yet. They appear here once ECICS posts to the webhook.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="data-table w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="pl-4 text-left">Received</th>
                      <th className="text-left">Partner</th>
                      <th className="text-left">Amount</th>
                      <th className="text-left">Method</th>
                      <th className="text-left">Policy no</th>
                      <th className="text-left">Transaction id</th>
                      <th className="text-left">Status</th>
                      <th className="text-left pr-4">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="pl-4 whitespace-nowrap">{fmtDate(p.received_at)}</td>
                        <td className="capitalize">{p.partner ?? '—'}</td>
                        <td className="font-medium text-slate-800 tabular-nums">{fmtMoney(p.amount, p.currency)}</td>
                        <td className="capitalize">{p.payment_method ?? '—'}</td>
                        <td className="font-mono text-[11.5px]">{p.policy_no ?? p.policy_id ?? p.proposal_no ?? '—'}</td>
                        <td className="font-mono text-[11.5px] text-slate-500">{p.transaction_id ?? '—'}</td>
                        <td><StatusPill s={p.payment_status} /></td>
                        <td className="pr-4 text-slate-400">{p.source ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

        <p className="mt-6 text-[11.5px] text-slate-400 flex items-center gap-1">
          <ExternalLink size={11} /> Data is read live from the roadplus Supabase project; this view never writes to it.
        </p>
      </div>
    </div>
  )
}
