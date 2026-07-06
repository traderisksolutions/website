'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRODUCT_LINES, productLineLabel } from '@/lib/product-lines'

/**
 * Inline RFQ workflow for the engagement dock — the "doing" side.
 * Stage lines + insurers before any Nexus case exists; the FIRST insurer send
 * materialises the Nexus file (via /api/nexus/rfq/materialize). Later sends
 * attach. Sent insurers show status + a Chase button. Sense-making (quote
 * comparison, roadmap) lives in the Nexus file, reachable via the link.
 */

type Insurer  = { contact_id: string; insurer_id: string | null; insurer_name: string; contact_name: string | null; contact_email: string }
type Dispatch = { id: string; insurer_name: string | null; to_email: string; status: string; insurer_contact_id: string | null; created_at: string; updated_at?: string }
type RfqRequest = { id: string; product_line: string; dispatches: Dispatch[]; matching_insurers: Insurer[] }
type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }

function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function plainToHtml(t: string) { return t.split('\n').map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`).join('') }
function buildSigHtml(s: SigOption) {
  return ['<br><hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${s.name}</p>`,
    s.title ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.title}</p>` : '',
    s.phone ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.phone}</p>` : '',
    s.email ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.email}</p>` : '',
  ].filter(Boolean).join('')
}
function daysSince(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }

export default function ThreadRfqWorkflow({
  threadId, messageId, defaultInsured,
}: {
  threadId: string; messageId: string | null; defaultInsured: string
}) {
  const [caseId,   setCaseId]   = useState<string | null>(null)
  const [insured,  setInsured]  = useState(defaultInsured)
  const [lines,    setLines]    = useState<string[]>([])
  const [suggested, setSuggested] = useState<Set<string>>(new Set())
  const [requests, setRequests] = useState<RfqRequest[]>([])
  const [loading,  setLoading]  = useState(true)

  const refresh = useCallback(async () => {
    const fr = await fetch(`/api/nexus/rfq/for-thread?thread_id=${threadId}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ case_id: null }))
    const cid = fr.case_id ?? null
    setCaseId(cid)
    if (cid) {
      const reqs = await fetch(`/api/nexus/rfq/requests?case_id=${cid}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
      const arr: RfqRequest[] = Array.isArray(reqs) ? reqs : []
      setRequests(arr)
      setLines(prev => Array.from(new Set([...prev, ...arr.map(r => r.product_line)])))
    } else {
      setRequests([])
    }
  }, [threadId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const sug = await fetch('/api/nexus/rfq/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, message_id: messageId, suggest: true }),
      }).then(r => r.ok ? r.json() : null).catch(() => null)
      if (!cancelled && sug) {
        const slugs: string[] = (sug.suggested_lines ?? []).map((l: { product_line: string }) => l.product_line)
        setSuggested(new Set(slugs))
        setLines(prev => Array.from(new Set([...prev, ...slugs])))
        if (sug.insured_name && !defaultInsured) setInsured(sug.insured_name)
      }
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [threadId, messageId, defaultInsured, refresh])

  const reqByLine = new Map(requests.map(r => [r.product_line, r]))
  const addable   = PRODUCT_LINES.filter(p => !lines.includes(p.slug))

  if (loading) return <div className="p-5 text-[12px] text-muted-foreground">Loading RFQ…</div>

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Request for Quotation</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Pick lines &amp; insurers, then send. The Nexus file opens on your first send.
          </p>
        </div>
        {caseId && (
          <a
            href={`/nexus?case=${caseId}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline flex-shrink-0"
          >
            Open file in Nexus <ExternalLink size={11} />
          </a>
        )}
      </div>

      <label className="flex flex-col gap-1.5 max-w-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Insured / client</span>
        <input
          value={insured}
          onChange={e => setInsured(e.target.value)}
          placeholder="Company or person seeking cover"
          className="text-[12px] rounded-md border border-[--border-subtle] bg-background px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/20"
        />
      </label>

      {lines.length === 0 && <p className="text-[11.5px] text-muted-foreground/70">No lines yet — add one below.</p>}

      {lines.map(line => (
        <LineSection
          key={line}
          threadId={threadId}
          messageId={messageId}
          insured={insured}
          line={line}
          request={reqByLine.get(line)}
          onChange={refresh}
        />
      ))}

      {addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mr-1">Add line</span>
          {addable.map(p => (
            <button
              key={p.slug}
              onClick={() => setLines(prev => [...prev, p.slug])}
              className="flex items-center gap-1 text-[11px] rounded-full border border-[--border-subtle] px-2 py-0.5 text-muted-foreground hover:bg-muted"
            >
              <Plus size={10} /> {productLineLabel(p.slug)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── One product line ──────────────────────────────────────────────────────────

function LineSection({
  threadId, messageId, insured, line, request, onChange,
}: {
  threadId: string; messageId: string | null; insured: string; line: string
  request?: RfqRequest; onChange: () => void
}) {
  const [insurers, setInsurers] = useState<Insurer[]>(request?.matching_insurers ?? [])
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [chasingId, setChasingId] = useState<string | null>(null)

  useEffect(() => {
    if (request) { setInsurers(request.matching_insurers); return }
    let cancelled = false
    fetch(`/api/nexus/rfq/insurers?product_line=${line}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(rows => { if (!cancelled) setInsurers(Array.isArray(rows) ? rows : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [line, request])

  async function chase(id: string) {
    setChasingId(id)
    try { await fetch('/api/nexus/rfq/chase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispatch_id: id }) }); onChange() }
    finally { setChasingId(null) }
  }

  const dispatches = request?.dispatches ?? []
  const dispatchedIds = new Set(dispatches.map(d => d.insurer_contact_id))
  const available = insurers.filter(i => !dispatchedIds.has(i.contact_id))

  return (
    <div className="rounded-lg border border-[--border-subtle] bg-card p-3.5 flex flex-col gap-2.5">
      <span className="text-[12.5px] font-semibold text-foreground">{productLineLabel(line)}</span>

      {dispatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {dispatches.map(d => {
            const replied = d.status === 'replied'
            const waited  = daysSince(d.updated_at || d.created_at)
            return (
              <span key={d.id} className={cn('inline-flex items-center gap-1 text-[10.5px] rounded-full pl-2 pr-1 py-0.5 border',
                replied ? 'text-indigo-700 bg-indigo-50 border-indigo-200 font-semibold' : 'text-emerald-700 bg-emerald-50 border-emerald-200')}>
                {replied ? '↩ replied' : '✓ sent'} · {d.insurer_name || d.to_email}
                {!replied && <span className="opacity-70">· ⏳{waited}d</span>}
                {!replied && (
                  <button onClick={() => chase(d.id)} disabled={chasingId === d.id}
                    className="ml-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold bg-white/70 hover:bg-white border border-current/20 disabled:opacity-50">
                    {chasingId === d.id ? '…' : 'Chase'}
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {available.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70">
            {insurers.length === 0 ? <>No insurers cover this line — add them in <span className="font-medium">Settings → Insurer Directory</span>.</> : 'All matching insurers contacted.'}
          </p>
        ) : available.map(ins => (
          <div key={ins.contact_id} className="flex flex-col">
            <div className="flex items-center justify-between gap-3 rounded-md border border-[--border-subtle] px-3 py-2">
              <div className="min-w-0">
                <span className="text-[12px] font-medium text-foreground">{ins.insurer_name}</span>
                <span className="text-[11px] text-muted-foreground ml-2">{ins.contact_name ? `${ins.contact_name} · ` : ''}{ins.contact_email}</span>
              </div>
              <button
                onClick={() => setActiveContactId(activeContactId === ins.contact_id ? null : ins.contact_id)}
                className={cn('text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors flex-shrink-0',
                  activeContactId === ins.contact_id ? 'border-primary text-primary bg-primary/5' : 'border-[--border-subtle] text-foreground hover:bg-muted')}
              >
                {activeContactId === ins.contact_id ? 'Close' : 'Draft & send'}
              </button>
            </div>
            {activeContactId === ins.contact_id && (
              <InsurerComposer
                threadId={threadId} messageId={messageId} insured={insured} line={line} insurer={ins}
                onClose={() => setActiveContactId(null)}
                onSent={() => { setActiveContactId(null); onChange() }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Draft + send + materialise (first send opens the Nexus file) ──────────────

function InsurerComposer({
  threadId, messageId, insured, line, insurer, onClose, onSent,
}: {
  threadId: string; messageId: string | null; insured: string; line: string
  insurer: Insurer; onClose: () => void; onSent: () => void
}) {
  const [loading, setLoading]   = useState(true)
  const [genError, setGenError] = useState<string | null>(null)
  const [to, setTo]             = useState(insurer.contact_email)
  const [subject, setSubject]   = useState('')
  const [body, setBody]         = useState('')
  const [sending, setSending]   = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [senders, setSenders]   = useState<Sender[]>([])
  const [fromEmail, setFromEmail] = useState('')
  const [signatures, setSignatures] = useState<SigOption[]>([])
  const [sigId, setSigId]       = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/nexus/rfq/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_line: line, insured_name: insured, contact_id: insurer.contact_id, client_message_id: messageId }) }).then(r => r.json()),
      fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([draft, sndrs, sigs]) => {
      if (cancelled) return
      if (draft?.error) { setGenError(draft.error); setLoading(false); return }
      setSubject(draft.subject ?? ''); setBody(draft.body ?? '')
      if (draft.to_email) setTo(draft.to_email)
      const sa = Array.isArray(sndrs) ? sndrs : []; setSenders(sa); if (sa.length) setFromEmail(sa[0].email)
      const ga = Array.isArray(sigs) ? sigs : []; setSignatures(ga); if (ga.length) setSigId(ga[0].id)
      setLoading(false)
    }).catch(e => { if (!cancelled) { setGenError(String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [line, insured, insurer.contact_id, messageId])

  async function send() {
    if (!to.trim() || !body.trim()) return
    setSending(true); setSendError(null)
    try {
      const sig = signatures.find(s => s.id === sigId)
      const bodyHtml = plainToHtml(body) + (sig ? buildSigHtml(sig) : '')

      const draftRes = await fetch('/api/nexus/draft-create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body, email_type: 'RFQ_INSURER', to_email: to.trim() }) })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare draft')

      const sendRes = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draftData.draftId, htmlBody: bodyHtml, originalAiBody: body, toEmail: to.trim(), customSubject: subject, fromEmail: fromEmail || null, signatureId: sigId || null }) })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')

      // Materialise: opens the Nexus file on the first send; attaches on later ones.
      await fetch('/api/nexus/rfq/materialize', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, insured_name: insured, product_line: line, contact_id: insurer.contact_id, ai_draft_id: draftData.draftId, gmail_thread_id: sendData.gmailThreadId ?? null }) })

      onSent()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  const inp = 'w-full text-[12px] border border-[--border-subtle] rounded-md px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-primary/20'

  return (
    <div className="mt-2 rounded-md border border-[--border-subtle] bg-muted/30 p-3 flex flex-col gap-2">
      {loading ? (
        <p className="text-[12px] text-muted-foreground py-4 text-center">Drafting email to {insurer.insurer_name}…</p>
      ) : genError ? (
        <div className="flex items-center justify-between"><p className="text-[12px] text-destructive">Draft failed: {genError}</p><button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Close</button></div>
      ) : (
        <>
          {senders.length > 1 && (
            <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">From</span>
              <select value={fromEmail} onChange={e => setFromEmail(e.target.value)} className={inp}>{senders.map(s => <option key={s.email} value={s.email}>{s.label || s.email}</option>)}</select></label>
          )}
          <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">To</span><input value={to} onChange={e => setTo(e.target.value)} className={inp} /></label>
          <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Subject</span><input value={subject} onChange={e => setSubject(e.target.value)} className={inp} /></label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
            className="w-full text-[12px] leading-relaxed border border-[--border-subtle] rounded-md px-2.5 py-2 bg-background outline-none focus:ring-1 focus:ring-primary/20 resize-y font-sans" />
          {signatures.length > 0 && (
            <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Sign</span>
              <select value={sigId} onChange={e => setSigId(e.target.value)} className={inp}>{signatures.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></label>
          )}
          {sendError && <p className="text-[11px] text-destructive">{sendError}</p>}
          <div className="flex items-center gap-2 justify-end">
            <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded-md border border-[--border-subtle] text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={send} disabled={sending || !to.trim() || !body.trim()} className="text-[11px] font-semibold px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              {sending ? 'Sending…' : `Send to ${insurer.insurer_name}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
