'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productLineLabel } from '@/lib/product-lines'
import { Btn, Chip, Spinner } from '@/components/crm/primitives'

/**
 * Nexus RFQ view — READ-ONLY aggregate. The sending workflow lives in Engagement;
 * here we only make sense of it: quote comparison across insurers, and a Link →
 * into each conversation. No pick / draft / send / chase.
 *
 * Styled on the Home design system: ink #202124, muted #5f6368, hairline #e8eaed,
 * grey field #f1f3f4. State is never colour-coded; the chip label carries the meaning.
 */

const INK   = '#202124'
const BODY  = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT   = '#9aa0a6'
const HAIR  = '#e8eaed'
const FIELD = '#f1f3f4'

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

const linkCls = 'inline-flex items-center gap-1 text-[13px] font-medium no-underline underline-offset-4 hover:underline flex-shrink-0'

// ── Quote comparison (AI-extracted from insurer replies) ───────────────────────

type FieldEvidence = { excerpt: string | null; source: string | null }
type Quote = {
  dispatch_id: string; insurer_name: string; product_line: string
  premium: string | null; excess: string | null; limit_indemnity: string | null
  validity: string | null; key_terms: string[]; exclusions: string[]; summary: string | null
  evidence: Record<string, FieldEvidence>; primary_source: string | null
}

// A figure cell with an evidence popover — click the info mark to see the verbatim source
// excerpt the number was pulled from (guards against a wrong / jumbled price).
function FigureCell({ value, ev }: { value: string | null; ev?: FieldEvidence }) {
  const [open, setOpen] = useState(false)
  const hasEv = !!(ev?.excerpt || ev?.source)
  return (
    <span className="relative inline-flex items-start gap-1">
      <span className={cn('tabular-nums', value ? 'font-medium' : '')} style={{ color: value ? INK : FAINT }}>{value ?? '—'}</span>
      {value && hasEv && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-[2px] bg-transparent border-0 p-0 cursor-pointer" style={{ color: FAINT }} title="Show source evidence" aria-label="Show source evidence" aria-expanded={open}>
          <Info size={12} />
        </button>
      )}
      {open && hasEv && (
        <span className="absolute z-20 top-6 left-0 w-72 rounded-[12px] bg-white p-3 text-left" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 8px 24px rgba(32,33,36,0.08)' }}>
          <span className="block text-[12.5px] font-medium mb-1" style={{ color: MUTED }}>
            Source{ev?.source ? ` · ${ev.source}` : ''}
          </span>
          <span className="block text-[13px] leading-[1.5] whitespace-pre-wrap" style={{ color: BODY }}>“{ev?.excerpt ?? 'No excerpt captured.'}”</span>
          <button type="button" onClick={() => setOpen(false)} className="mt-2 bg-transparent border-0 p-0 cursor-pointer text-[12.5px] underline-offset-4 hover:underline" style={{ color: INK }}>Close</button>
        </span>
      )}
    </span>
  )
}

type FieldCheck = { field: string; value: string | null; status: 'verified' | 'review' | 'empty'; reasons: string[]; excerpt: string | null; source: string | null; consensus_value: string | null }
type QuoteVerification = { dispatch_id: string; insurer_name: string | null; product_line: string | null; fields: FieldCheck[]; ok: boolean; note?: string }

function QuotesComparison({ caseId }: { caseId: string }) {
  const [quotes,  setQuotes]  = useState<Quote[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [pick,    setPick]    = useState<string | null>(null)
  const [reccing, setReccing] = useState(false)
  const [recErr,  setRecErr]  = useState<string | null>(null)
  // #1 pre-send verification failsafe
  const [verifying,    setVerifying]    = useState(false)
  const [verifyData,   setVerifyData]   = useState<{ results: QuoteVerification[]; all_ok: boolean; flagged_count: number } | null>(null)
  const [showVerify,   setShowVerify]   = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  // Run the failsafe (deterministic checks + second-model consensus), then open
  // the verify modal — the recommendation is only drafted after this gate.
  async function runVerify() {
    if (!pick) return
    setVerifying(true); setRecErr(null); setAcknowledged(false)
    try {
      const res = await fetch('/api/nexus/rfq/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseId }),
      })
      const d = await res.json()
      if (!res.ok) { setRecErr(d.error ?? 'Verification failed'); return }
      setVerifyData(d); setShowVerify(true)
    } finally { setVerifying(false) }
  }

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
        setRecErr('No client thread linked. The recommendation is copied to the clipboard; start the email in Engagement.')
      }
    } finally { setReccing(false) }
  }

  const th = 'py-2.5 pr-3 text-[12px] font-medium text-left whitespace-nowrap'

  return (
    <section className="rounded-[16px] bg-white p-5 flex flex-col gap-4" style={{ border: `1px solid ${HAIR}` }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Quote comparison</h3>
        <Btn level="secondary" onClick={compare} disabled={loading} loading={loading}>
          {loading ? 'Reading replies…' : quotes ? 'Refresh' : 'Compare quotes'}
        </Btn>
      </div>
      {quotes && quotes.length === 0 && <p className="m-0 text-[14px]" style={{ color: MUTED }}>No insurer replies to compare yet.</p>}
      {quotes && quotes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] border-collapse min-w-[720px]">
            <thead>
              <tr style={{ color: MUTED, borderBottom: `1px solid ${HAIR}` }}>
                <th className={th}>Pick</th>
                <th className={th}>Insurer</th><th className={th}>Line</th>
                <th className={th}>Premium</th><th className={th}>Excess</th>
                <th className={th}>Limit</th><th className={th}>Validity</th>
                <th className={cn(th, 'pr-0')}>Key terms</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr key={q.dispatch_id ?? i} className="align-top" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                  <td className="py-3 pr-3">
                    <input type="radio" name="reco-pick" checked={pick === q.dispatch_id} onChange={() => setPick(q.dispatch_id)} className="accent-[#202124] cursor-pointer" aria-label={`Recommend ${q.insurer_name}`} />
                  </td>
                  <td className="py-3 pr-3 font-medium" style={{ color: INK }}>{q.insurer_name}</td>
                  <td className="py-3 pr-3" style={{ color: MUTED }}>{q.product_line}</td>
                  <td className="py-3 pr-3"><FigureCell value={q.premium} ev={q.evidence?.premium} /></td>
                  <td className="py-3 pr-3"><FigureCell value={q.excess} ev={q.evidence?.excess} /></td>
                  <td className="py-3 pr-3"><FigureCell value={q.limit_indemnity} ev={q.evidence?.limit_indemnity} /></td>
                  <td className="py-3 pr-3"><FigureCell value={q.validity} ev={q.evidence?.validity} /></td>
                  <td className="py-3 text-[13.5px]" style={{ color: BODY }}>
                    {q.key_terms.length > 0 ? q.key_terms.join(' · ') : (q.summary ?? '—')}
                    {q.exclusions?.length > 0 && <span className="block text-[13px] mt-0.5" style={{ color: MUTED }}>Exclusions: {q.exclusions.join(' · ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-2 text-[12.5px]" style={{ color: MUTED }}>Figures are copied verbatim from the insurer reply or attachment. The info mark shows the source excerpt.</p>
        </div>
      )}
      {quotes && quotes.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-3 flex-wrap" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="text-[13px]" style={{ color: MUTED }}>{pick ? 'Figures are verified against the insurer source before drafting. Nothing is sent automatically.' : 'Pick the option to recommend to the client.'}</span>
          <Btn level="primary" onClick={runVerify} disabled={!pick || verifying || reccing} loading={verifying || reccing}>
            {verifying ? 'Verifying figures…' : reccing ? 'Drafting…' : 'Verify and recommend'}
          </Btn>
        </div>
      )}
      {recErr && <p className="m-0 text-[13.5px]" style={{ color: BODY }}>{recErr}</p>}

      {showVerify && verifyData && (
        <VerifyModal
          data={verifyData}
          acknowledged={acknowledged}
          setAcknowledged={setAcknowledged}
          onClose={() => setShowVerify(false)}
          onProceed={() => { setShowVerify(false); recommend() }}
        />
      )}
    </section>
  )
}

// Pre-send verification modal — 3 checks per figure (source, excerpt, consensus).
function VerifyModal({ data, acknowledged, setAcknowledged, onClose, onProceed }: {
  data: { results: QuoteVerification[]; all_ok: boolean; flagged_count: number }
  acknowledged: boolean; setAcknowledged: (v: boolean) => void
  onClose: () => void; onProceed: () => void
}) {
  const canProceed = data.all_ok || acknowledged
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(32,33,36,0.4)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[calc(85vh/var(--ui-zoom))] overflow-y-auto rounded-[16px] bg-white" style={{ boxShadow: 'var(--shadow-modal)', color: INK }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Verify figures">
        <div className="sticky top-0 bg-white px-6 pt-5 pb-4 flex items-center justify-between gap-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <h2 className="m-0 text-[20px] font-medium tracking-[-0.02em]" style={{ color: INK }}>Verify figures</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="m-0 text-[14px]" style={{ color: BODY }}>
            {data.all_ok
              ? 'Every figure matches the insurer source and the second model.'
              : `${data.flagged_count} figure${data.flagged_count === 1 ? '' : 's'} to check before this goes to the client. Each figure is checked against the insurer source, its cited excerpt and a second model.`}
          </p>

          {data.results.map(r => (
            <div key={r.dispatch_id} className="rounded-[16px] p-4" style={{ border: `1px solid ${HAIR}` }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[15px] font-medium" style={{ color: INK }}>{r.insurer_name ?? 'Insurer'}</span>
                <Chip>{r.ok ? 'Verified' : 'Review'}</Chip>
              </div>
              {r.note && <p className="m-0 mb-2 text-[13px]" style={{ color: MUTED }}>{r.note}</p>}
              <dl className="m-0 flex flex-col">
                {r.fields.filter(f => f.status !== 'empty').map((f, i) => (
                  <div key={f.field} className="py-2" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <dt className="m-0 text-[13px] w-20 flex-shrink-0" style={{ color: MUTED }}>{f.field}</dt>
                      <dd className="m-0 text-[14px] font-medium tabular-nums" style={{ color: INK }}>{f.value}</dd>
                      <Chip>{f.status === 'verified' ? 'Verified' : 'Review'}</Chip>
                    </div>
                    {f.status === 'review' && f.reasons.map((rs, ri) => (
                      <p key={ri} className="m-0 mt-1 ml-[92px] text-[13px]" style={{ color: BODY }}>{rs}</p>
                    ))}
                    {f.excerpt && (
                      <p className="m-0 mt-1 ml-[92px] text-[12.5px]" style={{ color: MUTED }}>
                        Source{f.source ? ` · ${f.source}` : ''}: “{f.excerpt}”
                      </p>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: `1px solid ${HAIR}` }}>
          {!data.all_ok
            ? <label className="flex items-center gap-2 text-[13.5px] cursor-pointer" style={{ color: INK }}>
                <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="accent-[#202124]" />
                I have reviewed the flagged figures
              </label>
            : <span className="text-[13px]" style={{ color: MUTED }}>Ready to draft the recommendation.</span>}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Btn level="secondary" onClick={onClose}>Cancel</Btn>
            <Btn level="primary" onClick={onProceed} disabled={!canProceed}>Draft recommendation</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Outcome control (simplified: Selected insurer / Not chosen per line) ───────

function OutcomeControl({ line, onChanged }: { line: RfqRequest; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState<string | null>(null)
  const replied = line.dispatches.filter(d => d.status === 'replied')

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/nexus/rfq/outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Failed'); return }
      onChanged()
    } finally { setBusy(false) }
  }

  // Decided → outcome row + reopen (support legacy won/lost rows too).
  if (line.status === 'selected' || line.status === 'won') return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-2.5" style={{ background: FIELD }}>
      <span className="text-[14px]" style={{ color: INK }}><span className="font-medium">Selected</span> · {line.won_insurer ?? 'insurer'}</span>
      <Btn level="tertiary" size="xs" onClick={() => post({ action: 'reopen', rfq_request_id: line.id })} disabled={busy} loading={busy}>Reopen</Btn>
    </div>
  )
  if (line.status === 'not_chosen' || line.status === 'lost') return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-2.5" style={{ background: FIELD }}>
      <span className="text-[14px] font-medium" style={{ color: INK }}>Not chosen</span>
      <Btn level="tertiary" size="xs" onClick={() => post({ action: 'reopen', rfq_request_id: line.id })} disabled={busy} loading={busy}>Reopen</Btn>
    </div>
  )

  // Only offer an outcome once at least one insurer has replied.
  if (replied.length === 0) return null

  return (
    <div className="flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] mr-auto" style={{ color: MUTED }}>Record the client’s decision. Logged only; nothing is sent.</span>
        <Btn level="tertiary" size="xs" onClick={() => post({ action: 'not_chosen', rfq_request_id: line.id })} disabled={busy}>None chosen</Btn>
      </div>
      <div className="flex flex-wrap gap-2">
        {replied.map(d => (
          <Btn key={d.id} level="secondary" size="xs" onClick={() => post({ action: 'select', rfq_request_id: line.id, dispatch_id: d.id })} disabled={busy}>
            Select {d.insurer_name || d.to_email}
          </Btn>
        ))}
      </div>
      {err && <span className="text-[13px]" style={{ color: BODY }}>{err}</span>}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function LinkToEngagement({ threadId }: { threadId: string | null }) {
  if (!threadId) return null
  return (
    <a href={`/engagement?lead=${threadId}`} className={linkCls} style={{ color: INK }} title="Open this conversation in Engagement">
      Open in Engagement →
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

  if (requests === null) return <div className="py-16"><Spinner label="Loading quotation requests…" /></div>
  if (requests.length === 0) return <p className="m-0 py-16 px-6 text-center text-[15px]" style={{ color: MUTED }}>No quotation lines on this case.</p>

  const anyReplied = requests.some(r => r.dispatches.some(d => d.status === 'replied'))

  return (
    <div className="px-6 py-6 pb-16 flex flex-col gap-4 max-w-[1100px]" style={{ color: INK }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
          Quotation requests <span className="ml-1 text-[13px] font-normal tabular-nums" style={{ color: FAINT }}>{requests.length}</span>
        </h2>
        <span className="text-[13px]" style={{ color: MUTED }}>
          Insured: {requests[0].insured_name || '—'} · view only, send from Engagement
        </span>
      </div>

      {anyReplied && <QuotesComparison caseId={caseId} />}

      {requests.map(r => (
        <div key={r.id} className="rounded-[16px] bg-white p-5 flex flex-col gap-3" style={{ border: `1px solid ${HAIR}` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[15px] font-medium" style={{ color: INK }}>{productLineLabel(r.product_line)}</span>
            <LinkToEngagement threadId={r.client_thread_id} />
          </div>
          {r.dispatches.length === 0 ? (
            <p className="m-0 text-[14px]" style={{ color: MUTED }}>Not yet sent to any insurer.</p>
          ) : (
            <div className="flex flex-col">
              {r.dispatches.map((d, i) => {
                const replied = d.status === 'replied'
                const waited  = daysSince(d.created_at)
                const overdue = !replied && waited >= slaDays
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px] flex-wrap" style={{ borderTop: i === 0 ? 'none' : `1px solid ${HAIR}` }}>
                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT }} aria-hidden />
                      <span className="font-medium truncate" style={{ color: INK }}>{d.insurer_name || d.to_email}</span>
                      <Chip>{replied ? 'Replied' : 'Sent'}</Chip>
                      {!replied && (
                        <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: MUTED }}>
                          {overdue ? `Waiting ${waited}d, past the ${slaDays}-day window` : `Waiting ${waited}d`}
                        </span>
                      )}
                    </div>
                    {overdue && d.thread_id
                      ? <a href={`/engagement?lead=${d.thread_id}`} className={linkCls} style={{ color: INK }}>Chase in Engagement →</a>
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
