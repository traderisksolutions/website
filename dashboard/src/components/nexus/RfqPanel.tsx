'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { productLineLabel } from '@/lib/product-lines'

// ── Types (shape returned by /api/nexus/rfq/requests) ─────────────────────────

interface MatchingInsurer {
  contact_id:    string
  insurer_id:    string | null
  insurer_name:  string
  contact_name:  string | null
  contact_email: string
}
interface Dispatch {
  id:                 string
  insurer_name:       string | null
  to_email:           string
  status:             string
  insurer_contact_id: string | null
  created_at:         string
  updated_at?:        string
}
interface RfqRequest {
  id:                string
  product_line:      string
  insured_name:      string | null
  summary:           string | null
  key_details:       string | null
  status:            string
  client_thread_id:  string | null
  matching_insurers: MatchingInsurer[]
  dispatches:        Dispatch[]
}

type Attachment = { id: string; filename: string; mime_type: string | null; size_bytes: number | null; storage_url: string }
type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }

// ── Helpers (mirrors nexus page compose path) ─────────────────────────────────

function plainToHtml(text: string): string {
  return text
    .split('\n')
    .map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`)
    .join('')
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function buildSigHtml(sig: SigOption): string {
  return [
    '<br><hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
    sig.title ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
    sig.phone ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
    sig.email ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.email}</p>` : '',
  ].filter(Boolean).join('')
}

// ── Inline composer for a single insurer ──────────────────────────────────────

function InsurerDraftComposer({
  request, insurer, onClose, onSent,
}: {
  request:  RfqRequest
  insurer:  MatchingInsurer
  onClose:  () => void
  onSent:   () => void
}) {
  const [loading,  setLoading]  = useState(true)
  const [genError, setGenError] = useState<string | null>(null)
  const [to,       setTo]       = useState(insurer.contact_email)
  const [subject,  setSubject]  = useState('')
  const [body,     setBody]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [senders,    setSenders]    = useState<Sender[]>([])
  const [fromEmail,  setFromEmail]  = useState('')
  const [signatures, setSignatures] = useState<SigOption[]>([])
  const [sigId,      setSigId]      = useState('')

  // Attachments on the client thread — employee picks which to forward (unticked by default).
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachSel,   setAttachSel]   = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const attUrl = request.client_thread_id
      ? `/api/nexus/rfq/attachments?thread_id=${request.client_thread_id}`
      : null
    Promise.all([
      fetch('/api/nexus/rfq/draft', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rfq_request_id: request.id, contact_id: insurer.contact_id }),
      }).then(r => r.json()),
      fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      attUrl ? fetch(attUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []) : Promise.resolve([]),
    ]).then(([draft, sndrs, sigs, atts]) => {
      if (!cancelled) setAttachments(Array.isArray(atts) ? atts : [])
      if (cancelled) return
      if (draft?.error) { setGenError(draft.error); setLoading(false); return }
      setSubject(draft.subject ?? '')
      setBody(draft.body ?? '')
      if (draft.to_email) setTo(draft.to_email)
      const sndrArr = Array.isArray(sndrs) ? sndrs : []
      setSenders(sndrArr)
      if (sndrArr.length) setFromEmail(sndrArr[0].email)
      const sigArr = Array.isArray(sigs) ? sigs : []
      setSignatures(sigArr)
      if (sigArr.length) setSigId(sigArr[0].id)
      setLoading(false)
    }).catch(e => { if (!cancelled) { setGenError(String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [request.id, insurer.contact_id, request.client_thread_id])

  async function handleSend() {
    if (!to.trim() || !body.trim()) return
    setSending(true); setSendError(null)
    try {
      const sig      = signatures.find(s => s.id === sigId)
      const bodyHtml = plainToHtml(body) + (sig ? buildSigHtml(sig) : '')

      // 1. Create the draft record (also resolves/creates the insurer contact).
      const draftRes = await fetch('/api/nexus/draft-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body, email_type: 'RFQ_INSURER', to_email: to.trim() }),
      })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare draft')

      // 2. Send it.
      const sendRes = await fetch('/api/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:        draftData.draftId,
          htmlBody:       bodyHtml,
          originalAiBody: body,
          toEmail:        to.trim(),
          customSubject:  subject,
          fromEmail:      fromEmail || null,
          signatureId:    sigId || null,
          attachments:    attachments
            .filter(a => attachSel.has(a.id))
            .map(a => ({ filename: a.filename, mime_type: a.mime_type, storage_url: a.storage_url })),
        }),
      })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')

      // 3. Record the dispatch — gmail_thread_id lets ingest link the reply back to
      //    the case and flag it. Non-blocking for the UI outcome.
      fetch('/api/nexus/rfq/dispatch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rfq_request_id:  request.id,
          contact_id:      insurer.contact_id,
          ai_draft_id:     draftData.draftId,
          gmail_thread_id: sendData.gmailThreadId ?? null,
        }),
      }).catch(() => {})

      setSent(true)
      setTimeout(onSent, 1200)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  if (sent) {
    return (
      <div className="mt-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-3 text-center">
        <p className="text-[12px] font-semibold text-emerald-700">Sent to {insurer.insurer_name}</p>
      </div>
    )
  }

  const inp = 'w-full text-[12px] border border-[--border-subtle] rounded-md px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-primary/20'

  return (
    <div className="mt-2 rounded-md border border-[--border-subtle] bg-muted/30 p-3 flex flex-col gap-2">
      {loading ? (
        <p className="text-[12px] text-muted-foreground py-4 text-center">Drafting email to {insurer.insurer_name}…</p>
      ) : genError ? (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-destructive">Draft failed: {genError}</p>
          <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Close</button>
        </div>
      ) : (
        <>
          {senders.length > 1 && (
            <label className="flex items-center gap-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">From</span>
              <select value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={inp}>
                {senders.map(s => <option key={s.email} value={s.email}>{s.label || s.email}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">To</span>
            <input value={to} onChange={e => setTo(e.target.value)} className={inp} />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={9}
            className="w-full text-[12px] leading-relaxed border border-[--border-subtle] rounded-md px-2.5 py-2 bg-background outline-none focus:ring-1 focus:ring-primary/20 resize-y font-sans"
          />
          {signatures.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Sign</span>
              <select value={sigId} onChange={e => setSigId(e.target.value)} className={inp}>
                {signatures.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
              </select>
            </label>
          )}

          {/* Attach client documents — pick which to forward to the insurer */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60">Attach client documents</span>
              <div className="flex flex-col gap-1">
                {attachments.map(a => {
                  const on = attachSel.has(a.id)
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAttachSel(prev => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
                      className="flex items-center gap-2 text-left text-[11.5px] rounded-md px-2 py-1.5 border border-[--border-subtle] hover:bg-muted transition-colors"
                    >
                      <span className={cn('flex items-center justify-center w-3.5 h-3.5 rounded border flex-shrink-0', on ? 'bg-primary border-primary text-white' : 'border-[--border-subtle]')}>
                        {on && <Check size={9} strokeWidth={3} />}
                      </span>
                      <span className="truncate flex-1">📎 {a.filename}</span>
                      {a.size_bytes != null && <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{Math.round(a.size_bytes / 1024)} KB</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {sendError && <p className="text-[11px] text-destructive">{sendError}</p>}
          <div className="flex items-center gap-2 justify-end">
            <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-md border border-[--border-subtle] text-muted-foreground hover:text-foreground">Cancel</button>
            <button
              onClick={handleSend}
              disabled={sending || !to.trim() || !body.trim()}
              className="text-[11px] font-semibold px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? 'Sending…' : `Send to ${insurer.insurer_name}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── One request line ──────────────────────────────────────────────────────────

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function RequestCard({ request, onChange }: { request: RfqRequest; onChange: () => void }) {
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [chasingId,       setChasingId]       = useState<string | null>(null)

  async function chase(dispatchId: string) {
    setChasingId(dispatchId)
    try {
      await fetch('/api/nexus/rfq/chase', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dispatch_id: dispatchId }),
      })
      onChange()
    } finally { setChasingId(null) }
  }

  const dispatchedContactIds = new Set(request.dispatches.map(d => d.insurer_contact_id))
  const available = request.matching_insurers.filter(i => !dispatchedContactIds.has(i.contact_id))

  return (
    <div className="rounded-lg border border-[--border-subtle] bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">{productLineLabel(request.product_line)}</span>
            {request.status === 'dispatched' && (
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Dispatched</span>
            )}
          </div>
          {request.summary && <p className="text-[12px] text-muted-foreground mt-1">{request.summary}</p>}
          {request.key_details && (
            <p className="text-[11.5px] text-muted-foreground/70 mt-1 leading-relaxed whitespace-pre-wrap">{request.key_details}</p>
          )}
        </div>
      </div>

      {/* Already contacted — replied highlighted; unreplied show a waiting clock + Chase */}
      {request.dispatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {request.dispatches.map(d => {
            const replied = d.status === 'replied'
            const waited  = daysSince(d.updated_at || d.created_at)
            const stale   = !replied && waited >= 3
            return (
              <span
                key={d.id}
                title={replied ? 'Insurer replied' : `RFQ sent — awaiting reply (${waited}d)`}
                className={cn(
                  'inline-flex items-center gap-1 text-[10.5px] rounded-full pl-2 pr-1 py-0.5 border',
                  replied
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200 font-semibold'
                    : stale
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200',
                )}
              >
                {replied ? '↩ replied' : '✓ sent'} · {d.insurer_name || d.to_email}
                {!replied && <span className="opacity-70">· ⏳{waited}d</span>}
                {!replied && (
                  <button
                    onClick={() => chase(d.id)}
                    disabled={chasingId === d.id}
                    className="ml-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold bg-white/70 hover:bg-white border border-current/20 disabled:opacity-50"
                    title="Send a manual follow-up chaser"
                  >
                    {chasingId === d.id ? '…' : 'Chase'}
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Insurer picker */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Send RFQ to insurers {available.length > 0 && `(${available.length} available)`}
        </p>
        {available.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground/70">
            {request.matching_insurers.length === 0
              ? <>No insurers cover this line yet — add them in <span className="font-medium">Settings → Insurer Directory</span>.</>
              : 'All matching insurers have been contacted.'}
          </p>
        ) : (
          available.map(ins => (
            <div key={ins.contact_id} className="flex flex-col">
              <div className="flex items-center justify-between gap-3 rounded-md border border-[--border-subtle] px-3 py-2">
                <div className="min-w-0">
                  <span className="text-[12px] font-medium text-foreground">{ins.insurer_name}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">
                    {ins.contact_name ? `${ins.contact_name} · ` : ''}{ins.contact_email}
                  </span>
                </div>
                <button
                  onClick={() => setActiveContactId(activeContactId === ins.contact_id ? null : ins.contact_id)}
                  className={cn(
                    'text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors flex-shrink-0',
                    activeContactId === ins.contact_id
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-[--border-subtle] text-foreground hover:bg-muted',
                  )}
                >
                  {activeContactId === ins.contact_id ? 'Close' : 'Draft email'}
                </button>
              </div>
              {activeContactId === ins.contact_id && (
                <InsurerDraftComposer
                  request={request}
                  insurer={ins}
                  onClose={() => setActiveContactId(null)}
                  onSent={() => { setActiveContactId(null); onChange() }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Quote comparison ──────────────────────────────────────────────────────────

type Quote = {
  insurer_name: string; product_line: string
  premium: string | null; excess: string | null; key_terms: string[]; validity: string | null; summary: string | null
}

function QuotesComparison({ caseId }: { caseId: string }) {
  const [quotes,  setQuotes]  = useState<Quote[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function compare() {
    setLoading(true)
    try {
      const res = await fetch('/api/nexus/rfq/quotes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ case_id: caseId }),
      })
      setQuotes(res.ok ? await res.json() : [])
    } finally { setLoading(false) }
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-indigo-900">Quote comparison</span>
        <button
          onClick={compare}
          disabled={loading}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50"
        >
          {loading ? 'Reading replies…' : quotes ? 'Refresh' : 'Compare quotes'}
        </button>
      </div>
      {quotes && quotes.length === 0 && (
        <p className="text-[11.5px] text-muted-foreground">No insurer replies to compare yet.</p>
      )}
      {quotes && quotes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <th className="py-1.5 pr-3 font-semibold">Insurer</th>
                <th className="py-1.5 pr-3 font-semibold">Line</th>
                <th className="py-1.5 pr-3 font-semibold">Premium</th>
                <th className="py-1.5 pr-3 font-semibold">Excess</th>
                <th className="py-1.5 pr-3 font-semibold">Validity</th>
                <th className="py-1.5 font-semibold">Key terms</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr key={i} className="border-t border-indigo-200/50 align-top">
                  <td className="py-2 pr-3 font-medium text-foreground">{q.insurer_name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.product_line}</td>
                  <td className="py-2 pr-3 font-semibold text-foreground">{q.premium ?? '—'}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.excess ?? '—'}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{q.validity ?? '—'}</td>
                  <td className="py-2 text-muted-foreground">
                    {q.key_terms.length > 0 ? q.key_terms.join(' · ') : (q.summary ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function RfqPanel({ caseId }: { caseId: string }) {
  const [requests, setRequests] = useState<RfqRequest[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/nexus/rfq/requests?case_id=${caseId}`, { cache: 'no-store' })
    if (res.ok) setRequests(await res.json())
    else setRequests([])
  }, [caseId])

  useEffect(() => { load() }, [load])

  if (requests === null) return <div className="p-6 text-[12px] text-muted-foreground">Loading quotation requests…</div>
  if (requests.length === 0) return <div className="p-6 text-[12px] text-muted-foreground/60">No quotation lines detected for this case.</div>

  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-foreground">Quotation Requests</h3>
        <span className="text-[11px] text-muted-foreground/60">
          {requests.length} line{requests.length !== 1 ? 's' : ''} · insured: {requests[0].insured_name || '—'}
        </span>
      </div>
      {requests.some(r => r.dispatches.some(d => d.status === 'replied')) && (
        <QuotesComparison caseId={caseId} />
      )}
      {requests.map(r => <RequestCard key={r.id} request={r} onChange={load} />)}
    </div>
  )
}
