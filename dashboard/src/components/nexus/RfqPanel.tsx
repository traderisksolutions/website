'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productLineLabel } from '@/lib/product-lines'

/**
 * Nexus RFQ view — READ-ONLY aggregate. The sending workflow lives in Engagement;
 * here we only make sense of it: quote comparison across insurers, and a Link →
 * into each conversation. No pick / draft / send / chase.
 */

interface Dispatch {
  id:           string
  insurer_name: string | null
  to_email:     string
  status:       string
  thread_id:    string | null
  created_at:   string
  updated_at?:  string
}
interface RfqRequest {
  id:               string
  product_line:     string
  insured_name:     string | null
  client_thread_id: string | null
  status:           string
  won_insurer?:     string | null
  bound_premium?:   string | null
  effective_date?:  string | null
  policy_number?:   string | null
  outcome_reason?:  string | null
  dispatches:       Dispatch[]
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Quote comparison (AI-extracted from insurer replies) ───────────────────────

type FieldEvidence = { excerpt: string | null; source: string | null }
type Quote = {
  dispatch_id: string; insurer_name: string; product_line: string
  premium: string | null; excess: string | null; limit_indemnity: string | null
  validity: string | null; key_terms: string[]; exclusions: string[]; summary: string | null
  evidence: Record<string, FieldEvidence>; primary_source: string | null
}

// A figure cell with an evidence popover — click ⓘ to see the verbatim source
// excerpt the number was pulled from (guards against a wrong / jumbled price).
function FigureCell({ value, ev }: { value: string | null; ev?: FieldEvidence }) {
  const [open, setOpen] = useState(false)
  const hasEv = !!(ev?.excerpt || ev?.source)
  return (
    <span className="relative inline-flex items-start gap-1">
      <span className={value ? 'font-semibold text-foreground' : 'text-muted-foreground/50'}>{value ?? '—'}</span>
      {value && hasEv && (
        <button onClick={() => setOpen(o => !o)} className="mt-[1px] text-indigo-500/70 hover:text-indigo-700" title="Show source evidence">
          <Info size={11} />
        </button>
      )}
      {open && hasEv && (
        <span className="absolute z-20 top-5 left-0 w-64 rounded-md border border-indigo-200 bg-white shadow-lg p-2.5 text-left normal-case">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-600/70 mb-1">
            Source{ev?.source ? ` · ${ev.source}` : ''}
          </span>
          <span className="block text-[10.5px] text-foreground/80 leading-[1.5] whitespace-pre-wrap">“{ev?.excerpt ?? 'No excerpt captured.'}”</span>
          <button onClick={() => setOpen(false)} className="mt-1.5 text-[9.5px] text-muted-foreground hover:text-foreground">close</button>
        </span>
      )}
    </span>
  )
}

function QuotesComparison({ caseId }: { caseId: string }) {
  const [quotes,  setQuotes]  = useState<Quote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [pick,    setPick]    = useState<string | null>(null)
  const [reccing, setReccing] = useState(false)
  const [recErr,  setRecErr]  = useState<string | null>(null)

  async function compare() {
    setLoading(true)
    try {
      const res = await fetch('/api/nexus/rfq/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseId }),
      })
      setQuotes(res.ok ? await res.json() : [])
    } finally { setLoading(false) }
  }

  // Draft the client recommendation and hand it to Engagement to review + send.
  async function recommend() {
    if (!pick || !quotes) return
    setReccing(true); setRecErr(null)
    try {
      const res = await fetch('/api/nexus/rfq/recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId, recommended_dispatch_id: pick, shortlist_dispatch_ids: quotes.map(q => q.dispatch_id) }),
      })
      const d = await res.json()
      if (!res.ok || !d.body) { setRecErr(d.error ?? 'Could not draft recommendation'); return }
      if (d.thread_id) {
        window.sessionStorage.setItem('trs_pending_reply', JSON.stringify({ threadId: d.thread_id, toEmail: d.to_email, subject: d.subject, body: d.body }))
        window.location.href = `/engagement?lead=${d.thread_id}`
      } else {
        await navigator.clipboard.writeText(d.body).catch(() => {})
        setRecErr('No client thread linked — recommendation copied to clipboard; start the email in Engagement.')
      }
    } finally { setReccing(false) }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[12px] font-semibold text-indigo-900">Quote comparison</span>
          <span className="text-[10px] text-indigo-700/60">Figures are copied verbatim from the insurer reply / attachments — click ⓘ to verify the source.</span>
        </div>
        <button onClick={compare} disabled={loading} className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50 flex-shrink-0">
          {loading ? 'Reading replies…' : quotes ? 'Refresh' : 'Compare quotes'}
        </button>
      </div>
      {quotes && quotes.length === 0 && <p className="text-[11.5px] text-muted-foreground">No insurer replies to compare yet.</p>}
      {quotes && quotes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="py-1.5 pr-2 font-semibold">Pick</th>
                <th className="py-1.5 pr-3 font-semibold">Insurer</th><th className="py-1.5 pr-3 font-semibold">Line</th>
                <th className="py-1.5 pr-3 font-semibold">Premium</th><th className="py-1.5 pr-3 font-semibold">Excess</th>
                <th className="py-1.5 pr-3 font-semibold">Limit</th><th className="py-1.5 pr-3 font-semibold">Validity</th>
                <th className="py-1.5 font-semibold">Key terms</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr key={q.dispatch_id ?? i} className="border-t border-indigo-200/50 align-top">
                  <td className="py-2 pr-2">
                    <input type="radio" name="reco-pick" checked={pick === q.dispatch_id} onChange={() => setPick(q.dispatch_id)} className="accent-indigo-600" />
                  </td>
                  <td className="py-2 pr-3 font-medium text-foreground">{q.insurer_name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.product_line}</td>
                  <td className="py-2 pr-3"><FigureCell value={q.premium} ev={q.evidence?.premium} /></td>
                  <td className="py-2 pr-3"><FigureCell value={q.excess} ev={q.evidence?.excess} /></td>
                  <td className="py-2 pr-3"><FigureCell value={q.limit_indemnity} ev={q.evidence?.limit_indemnity} /></td>
                  <td className="py-2 pr-3"><FigureCell value={q.validity} ev={q.evidence?.validity} /></td>
                  <td className="py-2 text-muted-foreground">
                    {q.key_terms.length > 0 ? q.key_terms.join(' · ') : (q.summary ?? '—')}
                    {q.exclusions?.length > 0 && <span className="block text-[10px] text-rose-600/70 mt-0.5">Excl: {q.exclusions.join(' · ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {quotes && quotes.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-indigo-200/50 pt-2.5">
          <span className="text-[10.5px] text-indigo-700/60">{pick ? 'Recommendation drafts in Engagement for your review — nothing is sent automatically.' : 'Pick the option to recommend to the client.'}</span>
          <button onClick={recommend} disabled={!pick || reccing}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-40 flex-shrink-0">
            {reccing ? 'Drafting…' : 'Recommend to client →'}
          </button>
        </div>
      )}
      {recErr && <p className="text-[11px] text-rose-600">{recErr}</p>}
    </div>
  )
}

// ── Outcome control (#4b: bind / lost per line) ────────────────────────────────

function OutcomeControl({ line, onChanged }: { line: RfqRequest; onChanged: () => void }) {
  const [mode, setMode]   = useState<'idle' | 'bind' | 'lost'>('idle')
  const [busy, setBusy]   = useState(false)
  const [err,  setErr]    = useState<string | null>(null)
  // bind form
  const replied = line.dispatches.filter(d => d.status === 'replied')
  const [winner,   setWinner]   = useState<string>(replied[0]?.id ?? '')
  const [premium,  setPremium]  = useState('')
  const [effDate,  setEffDate]  = useState('')
  const [policyNo, setPolicyNo] = useState('')
  const [reason,   setReason]   = useState('')

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/nexus/rfq/outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Failed'); return }
      setMode('idle'); onChanged()
    } finally { setBusy(false) }
  }

  // Decided → outcome summary + reopen.
  if (line.status === 'won') return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
      <span className="text-[11px] text-emerald-800">
        <span className="font-bold uppercase tracking-wide">Bound</span> · {line.won_insurer ?? 'insurer'}
        {line.bound_premium ? ` · ${line.bound_premium}` : ''}
        {line.policy_number ? ` · policy ${line.policy_number}` : ''}
        {line.effective_date ? ` · eff. ${line.effective_date}` : ''}
      </span>
      <button onClick={() => post({ action: 'reopen', rfq_request_id: line.id })} disabled={busy}
        className="text-[10px] text-emerald-700/70 hover:underline flex-shrink-0">Reopen</button>
    </div>
  )
  if (line.status === 'lost') return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50/50 px-3 py-2">
      <span className="text-[11px] text-rose-800"><span className="font-bold uppercase tracking-wide">Lost</span>{line.outcome_reason ? ` · ${line.outcome_reason}` : ''}</span>
      <button onClick={() => post({ action: 'reopen', rfq_request_id: line.id })} disabled={busy}
        className="text-[10px] text-rose-700/70 hover:underline flex-shrink-0">Reopen</button>
    </div>
  )

  // Only offer outcomes once at least one insurer has replied.
  if (replied.length === 0) return null

  if (mode === 'idle') return (
    <div className="flex items-center justify-end gap-2 pt-0.5">
      <span className="text-[10px] text-muted-foreground/60 mr-auto">Client decided? Record the outcome — nothing is sent.</span>
      <button onClick={() => setMode('bind')} className="text-[10.5px] font-semibold px-2.5 py-1 rounded-md bg-emerald-600 text-white">Mark bound</button>
      <button onClick={() => setMode('lost')} className="text-[10.5px] font-semibold px-2.5 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50">Mark lost</button>
    </div>
  )

  if (mode === 'bind') return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-emerald-900">Bind this line</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 col-span-2">
          <span className="text-[9.5px] uppercase tracking-wide text-emerald-700/70">Winning insurer</span>
          <select value={winner} onChange={e => setWinner(e.target.value)} className="text-[11.5px] rounded border border-emerald-200 bg-white px-2 py-1">
            {replied.map(d => <option key={d.id} value={d.id}>{d.insurer_name || d.to_email}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9.5px] uppercase tracking-wide text-emerald-700/70">Bound premium</span>
          <input value={premium} onChange={e => setPremium(e.target.value)} placeholder="SGD 12,500" className="text-[11.5px] rounded border border-emerald-200 bg-white px-2 py-1" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9.5px] uppercase tracking-wide text-emerald-700/70">Effective date</span>
          <input type="date" value={effDate} onChange={e => setEffDate(e.target.value)} className="text-[11.5px] rounded border border-emerald-200 bg-white px-2 py-1" />
        </label>
        <label className="flex flex-col gap-0.5 col-span-2">
          <span className="text-[9.5px] uppercase tracking-wide text-emerald-700/70">Policy number</span>
          <input value={policyNo} onChange={e => setPolicyNo(e.target.value)} placeholder="optional" className="text-[11.5px] rounded border border-emerald-200 bg-white px-2 py-1" />
        </label>
      </div>
      {err && <span className="text-[10.5px] text-rose-600">{err}</span>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setMode('idle')} className="text-[10.5px] text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={() => post({ action: 'bind', rfq_request_id: line.id, dispatch_id: winner, bound_premium: premium || null, effective_date: effDate || null, policy_number: policyNo || null })}
          disabled={busy || !winner} className="text-[10.5px] font-semibold px-3 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm bind'}
        </button>
      </div>
    </div>
  )

  // mode === 'lost'
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/40 p-3 flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-rose-900">Mark this line lost</span>
      <select value={reason} onChange={e => setReason(e.target.value)} className="text-[11.5px] rounded border border-rose-200 bg-white px-2 py-1">
        <option value="">Select a reason…</option>
        <option value="Price">Price</option>
        <option value="Coverage / terms">Coverage / terms</option>
        <option value="Client went direct">Client went direct</option>
        <option value="No decision / lapsed">No decision / lapsed</option>
        <option value="Other">Other</option>
      </select>
      {err && <span className="text-[10.5px] text-rose-600">{err}</span>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setMode('idle')} className="text-[10.5px] text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={() => post({ action: 'lost', rfq_request_id: line.id, outcome_reason: reason || null })}
          disabled={busy} className="text-[10.5px] font-semibold px-3 py-1 rounded-md bg-rose-600 text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm lost'}
        </button>
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function LinkToEngagement({ threadId }: { threadId: string | null }) {
  if (!threadId) return null
  return (
    <a
      href={`/engagement?lead=${threadId}`}
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary hover:underline flex-shrink-0"
      title="Open this conversation in Engagement"
    >
      Link <ExternalLink size={10} />
    </a>
  )
}

export default function RfqPanel({ caseId }: { caseId: string }) {
  const [requests, setRequests] = useState<RfqRequest[] | null>(null)
  const [slaDays,  setSlaDays]  = useState(3)

  const load = useCallback(async () => {
    const res = await fetch(`/api/nexus/rfq/requests?case_id=${caseId}`, { cache: 'no-store' })
    setRequests(res.ok ? await res.json() : [])
  }, [caseId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/settings?key=rfq_sla', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(row => { try { const v = row?.value ? JSON.parse(row.value) : null; if (v?.default_days) setSlaDays(v.default_days) } catch { /* default */ } })
      .catch(() => {})
  }, [])

  if (requests === null) return <div className="p-6 text-[12px] text-muted-foreground">Loading quotation requests…</div>
  if (requests.length === 0) return <div className="p-6 text-[12px] text-muted-foreground/60">No quotation lines on this file.</div>

  const anyReplied = requests.some(r => r.dispatches.some(d => d.status === 'replied'))

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">Quotation Requests</h3>
        <span className="text-[11px] text-muted-foreground/60">
          {requests.length} line{requests.length !== 1 ? 's' : ''} · insured: {requests[0].insured_name || '—'} · view-only — send from Engagement
        </span>
      </div>

      {anyReplied && <QuotesComparison caseId={caseId} />}

      {requests.map(r => (
        <div key={r.id} className="rounded-lg border border-[--border-subtle] bg-card p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-foreground">{productLineLabel(r.product_line)}</span>
            <LinkToEngagement threadId={r.client_thread_id} />
          </div>
          {r.dispatches.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground/70">Not yet sent to any insurer.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {r.dispatches.map(d => {
                const replied = d.status === 'replied'
                const waited  = daysSince(d.created_at)
                const overdue = !replied && waited >= slaDays
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('text-[9.5px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 border flex-shrink-0',
                        replied ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200')}>
                        {replied ? 'replied' : 'sent'}
                      </span>
                      <span className="font-medium text-foreground truncate">{d.insurer_name || d.to_email}</span>
                      {!replied && (
                        overdue
                          ? <span className="text-[10px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 flex-shrink-0">overdue · {waited}d</span>
                          : <span className="text-[10.5px] text-muted-foreground/60 flex-shrink-0">⏳ {waited}d</span>
                      )}
                    </div>
                    {overdue && d.thread_id
                      ? <a href={`/engagement?lead=${d.thread_id}`} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-rose-600 hover:underline flex-shrink-0">Chase <ExternalLink size={10} /></a>
                      : <LinkToEngagement threadId={d.thread_id} />}
                  </div>
                )
              })}
            </div>
          )}
          <OutcomeControl line={r} onChanged={load} />
        </div>
      ))}
    </div>
  )
}
