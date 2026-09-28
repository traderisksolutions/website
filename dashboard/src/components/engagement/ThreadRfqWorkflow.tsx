'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Paperclip, Check, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { RichTextEditor } from './RichTextEditor'
import { groupedProductLines, productLineLabel } from '@/lib/product-lines'
import { stripSignature } from '@/lib/signature-html'

const OPS_EMAIL = 'operations@trade-risksol.com'

/**
 * RFQ send desk for the engagement dock.
 *
 * The main panel shows what's already gone out (status + chase) plus Suggested
 * lines (AI-detected) and manual "Add line" chips. Both open the SAME guided
 * wizard: pick line → pick insurer(s) → review one draft per insurer (recipient,
 * subject, body, attachments) → send all or individually. The first insurer send
 * materialises the Nexus file. The wizard's staged drafts live here in the parent,
 * so closing the modal parks the work — reopening resumes it.
 *
 * Presentation: ink/hairline tokens. Steps are a muted numbered underline, insurer
 * picks are outlined toggle chips, drafts sit in outlined cards, the one filled
 * button per view is ink, progress is an ink bar on #e8eaed, state is in words.
 */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'
const CTRL = '#dadce0'
const FIELD = '#f1f3f4'

const BTN_PRIMARY   = 'inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-[#202124] text-white text-[14px] font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-0'
const BTN_SECONDARY = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-white text-[#202124] text-[13.5px] font-medium whitespace-nowrap border border-[#dadce0] hover:bg-[#f8f9fa] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const BTN_TERTIARY  = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] bg-transparent text-[#202124] text-[13.5px] font-medium whitespace-nowrap border-0 hover:bg-[#f1f3f4] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
const LINK = 'bg-transparent border-0 p-0 cursor-pointer text-[13px] underline underline-offset-[3px] decoration-[#9aa0a6] hover:decoration-[#202124] disabled:cursor-default disabled:no-underline disabled:opacity-50'
const CHIP = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium cursor-pointer bg-white border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124] disabled:cursor-default'
const INPUT = 'w-full h-9 text-[13.5px] rounded-[8px] px-3 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#202124]/30'
const SELECT = 'w-full h-9 text-[13.5px] rounded-[8px] px-2.5 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#202124]/30'

type Insurer  = { contact_id: string; insurer_id: string | null; insurer_name: string; contact_name: string | null; contact_email: string }
type Dispatch = { id: string; insurer_name: string | null; to_email: string; status: string; insurer_contact_id: string | null; created_at: string; updated_at?: string }
type RfqRequest = { id: string; product_line: string; dispatches: Dispatch[]; matching_insurers: Insurer[] }
type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }
type Attachment = { id: string; filename: string; mime_type: string | null; storage_url: string; size_bytes?: number | null }

// One insurer being drafted to inside the wizard. `body` is HTML (rich editor).
type StagedInsurer = Insurer & {
  to: string; subject: string; body: string
  aiBody: string                   // the ORIGINAL AI draft (plain) — eval baseline vs the edited send
  cc: string; ccTouched: boolean
  gen: number                      // bumps when body is (re)generated → re-seeds editor
  loadingDraft: boolean; draftError: string | null
  attach: string[]                 // manually-selected attachment ids
  sending: boolean; sendError: string | null; sent: boolean
}
type StagedLine = { line: string; insurers: StagedInsurer[] }
type Step = 'line' | 'insurers' | 'review'

const STEPS: { key: Step; label: string }[] = [
  { key: 'line',     label: 'Lines' },
  { key: 'insurers', label: 'Insurers' },
  { key: 'review',   label: 'Review and send' },
]

function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function plainToHtml(t: string) { return t.split('\n').map(l => l.trim() === '' ? '<br>' : `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`).join('') }
function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim()
}
function parseEmails(s: string): string[] {
  return s.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))
}
function buildSigHtml(s: SigOption) {
  return ['<br><hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${s.name}</p>`,
    s.title ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.title}</p>` : '',
    s.phone ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.phone}</p>` : '',
    s.email ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${s.email}</p>` : '',
  ].filter(Boolean).join('')
}
function daysSince(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }

/** Detected lines per thread, so re-opening a thread never pays for the model again. */
const suggestCache = new Map<string, string[]>()

export default function ThreadRfqWorkflow({
  threadId, messageId, defaultInsured,
}: {
  threadId: string; messageId: string | null; defaultInsured: string
}) {
  const [caseId,    setCaseId]    = useState<string | null>(null)
  const [insured,   setInsured]   = useState(defaultInsured)
  const [suggested, setSuggested] = useState<string[]>([])
  const [requests,  setRequests]  = useState<RfqRequest[]>([])
  const [loading,   setLoading]   = useState(true)

  // Shared send context (fetched once).
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [senders,     setSenders]     = useState<Sender[]>([])
  const [signatures,  setSignatures]  = useState<SigOption[]>([])
  const [fromEmail,   setFromEmail]   = useState('')
  const [sigId,       setSigId]       = useState('')

  // Wizard.
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step,       setStep]       = useState<Step>('line')
  const [activeLine, setActiveLine] = useState<string | null>(null)   // line being configured in the 'insurers' step
  const [lineInsurers, setLineInsurers] = useState<Insurer[]>([])
  const [picked,     setPicked]     = useState<string[]>([])          // contact_ids checked in 'insurers' step
  const [pickedLines, setPickedLines] = useState<string[]>([])        // lines multi-selected in the 'line' step
  const [lineQueue,  setLineQueue]  = useState<string[]>([])          // lines still to configure after the active one
  const [staged,     setStaged]     = useState<StagedLine[]>([])
  const [detecting,  setDetecting]  = useState(true)

  const refresh = useCallback(async () => {
    const fr = await fetch(`/api/nexus/rfq/for-thread?thread_id=${threadId}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ case_id: null }))
    const cid = fr.case_id ?? null
    setCaseId(cid)
    if (cid) {
      const reqs = await fetch(`/api/nexus/rfq/requests?case_id=${cid}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
      setRequests(Array.isArray(reqs) ? reqs : [])
    } else {
      setRequests([])
    }
  }, [threadId])

  // The panel is usable as soon as the cheap database reads land. Working out which lines of
  // cover the client is asking for takes a model several seconds, and nothing on screen depends
  // on it — it only pre-ticks the suggestions — so it runs alongside rather than in front.
  // It used to sit inside this gate, which is why picking a thread felt so slow.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const [atts, sndrs, sigs] = await Promise.all([
        fetch(`/api/nexus/rfq/attachments?thread_id=${threadId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
        refresh(),
      ])
      if (cancelled) return
      setAttachments(Array.isArray(atts) ? atts : [])
      const sa = Array.isArray(sndrs) ? sndrs : []; setSenders(sa); if (sa.length) setFromEmail(sa[0].email)
      const ga = Array.isArray(sigs) ? sigs : []; setSignatures(ga); if (ga.length) setSigId(ga[0].id)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [threadId, refresh])

  // Line detection, off the critical path. Cached per thread so re-opening the same one is free.
  useEffect(() => {
    let cancelled = false
    const cached = suggestCache.get(threadId)
    if (cached) { setSuggested(cached); setDetecting(false); return }
    setDetecting(true)
    fetch('/api/nexus/rfq/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId, message_id: messageId, suggest: true }),
    })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(sug => {
        if (cancelled || !sug) { if (!cancelled) setDetecting(false); return }
        const lines = (sug.suggested_lines ?? []).map((l: { product_line: string }) => l.product_line)
        suggestCache.set(threadId, lines)
        setSuggested(lines)
        if (sug.insured_name && !defaultInsured) setInsured(sug.insured_name)
        setDetecting(false)
      })
    return () => { cancelled = true }
  }, [threadId, messageId, defaultInsured])

  // ── staged-insurer mutation helper ─────────────────────────────────────────
  const patchIns = useCallback((line: string, contactId: string, patch: Partial<StagedInsurer>) => {
    setStaged(prev => prev.map(l => l.line !== line ? l : {
      ...l, insurers: l.insurers.map(ins => ins.contact_id !== contactId ? ins : { ...ins, ...patch }),
    }))
  }, [])

  const generateDraft = useCallback(async (line: string, ins: Insurer) => {
    patchIns(line, ins.contact_id, { loadingDraft: true, draftError: null })
    try {
      const d = await fetch('/api/nexus/rfq/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_line: line, insured_name: insured, contact_id: ins.contact_id, client_message_id: messageId }) }).then(r => r.json())
      if (d?.error) { patchIns(line, ins.contact_id, { loadingDraft: false, draftError: d.error }); return }
      patchIns(line, ins.contact_id, { loadingDraft: false, subject: d.subject ?? '', body: plainToHtml(d.body ?? ''), aiBody: (d.body ?? '').trim(), to: d.to_email || ins.contact_email, gen: Date.now() })
    } catch (e) {
      patchIns(line, ins.contact_id, { loadingDraft: false, draftError: String(e) })
    }
  }, [insured, messageId, patchIns])

  // ── wizard navigation ───────────────────────────────────────────────────────
  function openWizardBlank() { setStep('line'); setActiveLine(null); setPicked([]); setPickedLines([]); setLineQueue([]); setWizardOpen(true) }
  function goToLineSelect()  { setPickedLines([]); setStep('line') }
  function togglePickLine(slug: string) { setPickedLines(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]) }

  async function openLineInsurers(line: string) {
    setActiveLine(line); setPicked([]); setStep('insurers'); setWizardOpen(true)
    const rows = await fetch(`/api/nexus/rfq/insurers?product_line=${line}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
    setLineInsurers(Array.isArray(rows) ? rows : [])
  }

  // Start the sequential per-line flow from the multi-selected lines.
  function beginLineQueue() {
    const [first, ...rest] = pickedLines
    if (!first) return
    setLineQueue(rest)
    openLineInsurers(first)
  }
  // Advance to the next queued line, or finish at review.
  function advanceQueue() {
    if (lineQueue.length) { const [next, ...rest] = lineQueue; setLineQueue(rest); openLineInsurers(next) }
    else setStep('review')
  }

  // Which sender is active, and whether it's the employee's personal Gmail.
  const personalSelected = senders.find(s => s.email === fromEmail)?.type === 'personal'

  // Keep the CC in sync with the send-from choice until the user edits it:
  // personal Gmail → auto-CC operations@; shared → clear. Touched cards are left alone.
  useEffect(() => {
    setStaged(prev => prev.map(l => ({ ...l, insurers: l.insurers.map(ins => {
      if (ins.ccTouched || ins.sent) return ins
      const want = personalSelected ? OPS_EMAIL : ''
      return ins.cc === want ? ins : { ...ins, cc: want }
    }) })))
  }, [personalSelected])

  function confirmInsurers() {
    if (!activeLine || picked.length === 0) return
    const chosen = lineInsurers.filter(i => picked.includes(i.contact_id))
    setStaged(prev => {
      const existing = prev.find(l => l.line === activeLine)
      const toStaged = (i: Insurer): StagedInsurer => ({ ...i, to: i.contact_email, subject: '', body: '', aiBody: '', cc: personalSelected ? OPS_EMAIL : '', ccTouched: false, gen: 0, loadingDraft: true, draftError: null, attach: [], sending: false, sendError: null, sent: false })
      if (existing) {
        const have = new Set(existing.insurers.map(i => i.contact_id))
        const merged = { ...existing, insurers: [...existing.insurers, ...chosen.filter(i => !have.has(i.contact_id)).map(toStaged)] }
        return prev.map(l => l.line === activeLine ? merged : l)
      }
      return [...prev, { line: activeLine, insurers: chosen.map(toStaged) }]
    })
    // Kick off drafts for the newly-picked insurers.
    chosen.forEach(i => generateDraft(activeLine, i))
    // Sequential multi-line flow: configure the next selected line, else review.
    advanceQueue()
  }

  async function sendInsurer(line: string, ins: StagedInsurer) {
    const plain = htmlToText(ins.body)
    if (!ins.to.trim() || !plain) return
    patchIns(line, ins.contact_id, { sending: true, sendError: null })
    try {
      const sig = signatures.find(s => s.id === sigId)
      // Strip any signature already in the body, then append exactly one (no dupes).
      const bodyHtml = stripSignature(ins.body) + (sig ? buildSigHtml(sig) : '')
      const atts = attachments.filter(a => ins.attach.includes(a.id)).map(a => ({ filename: a.filename, mime_type: a.mime_type ?? undefined, storage_url: a.storage_url }))
      const cc = parseEmails(ins.cc)

      const draftRes = await fetch('/api/nexus/draft-create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body: plain, email_type: 'RFQ_INSURER', to_email: ins.to.trim() }) })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare draft')

      const sendRes = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Eval baseline = the ORIGINAL AI draft; the sent (possibly-edited) body is the human version.
        body: JSON.stringify({ draftId: draftData.draftId, htmlBody: bodyHtml, originalAiBody: ins.aiBody || plain, toEmail: ins.to.trim(), cc, customSubject: ins.subject, fromEmail: fromEmail || null, signatureId: null, attachments: atts }) })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')

      await fetch('/api/nexus/rfq/materialize', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, insured_name: insured, product_line: line, contact_id: ins.contact_id, ai_draft_id: draftData.draftId, gmail_thread_id: sendData.gmailThreadId ?? null }) })

      patchIns(line, ins.contact_id, { sending: false, sent: true })
      refresh()
    } catch (e) {
      patchIns(line, ins.contact_id, { sending: false, sendError: e instanceof Error ? e.message : 'Send failed' })
    }
  }

  async function sendAll() {
    for (const l of staged) {
      for (const ins of l.insurers) {
        if (!ins.sent && !ins.loadingDraft && htmlToText(ins.body)) await sendInsurer(l.line, ins)
      }
    }
  }

  // Prune fully-sent lines out of the staged tray once done.
  useEffect(() => {
    setStaged(prev => prev.filter(l => l.insurers.some(i => !i.sent)))
  }, [requests]) // eslint-disable-line react-hooks/exhaustive-deps

  const stagedCount = staged.reduce((n, l) => n + l.insurers.filter(i => !i.sent).length, 0)
  const dispatchedLines = requests.filter(r => r.dispatches.length > 0)
  const openLines = new Set(staged.map(l => l.line))
  const suggestedOpen = suggested.filter(s => !openLines.has(s))

  if (loading) return (
    <div className="p-5 flex flex-col gap-4" aria-busy="true" aria-label="Loading quotation request">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3.5 w-44 rounded" />
        <div className="skeleton h-3 w-80 max-w-full rounded" />
      </div>
      <div className="flex flex-col gap-2 max-w-sm">
        <div className="skeleton h-2.5 w-24 rounded" />
        <div className="skeleton h-9 w-full rounded-[8px]" />
      </div>
      <div className="skeleton h-9 w-48 rounded-[10px]" />
    </div>
  )

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Request for quotation</h3>
          <p className="m-0 mt-1 text-[13px]" style={{ color: MUTED }}>Pick lines and insurers, review each draft, then send. The Nexus file opens on the first send.</p>
        </div>
        {caseId && (
          <a href={`/nexus?case=${caseId}`} className={cn(LINK, 'no-underline hover:underline flex-shrink-0')} style={{ color: INK }}>
            Open file in Nexus →
          </a>
        )}
      </div>

      <label className="flex flex-col gap-1.5 max-w-sm">
        <span className="text-[12.5px]" style={{ color: MUTED }}>Insured</span>
        <input value={insured} onChange={e => setInsured(e.target.value)} placeholder="Company or person seeking cover"
          className={INPUT} style={{ border: `1px solid ${CTRL}`, color: INK }} />
      </label>

      {/* Resume banner */}
      {stagedCount > 0 && !wizardOpen && (
        <button type="button" onClick={() => { setStep('review'); setWizardOpen(true) }}
          className="flex items-center justify-between gap-3 rounded-[10px] px-3.5 py-2.5 text-left bg-white cursor-pointer hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]"
          style={{ border: `1px solid ${CTRL}` }}>
          <span className="text-[13.5px]" style={{ color: INK }}>{stagedCount} draft{stagedCount !== 1 ? 's' : ''} staged, not sent</span>
          <span className="text-[13px] font-medium flex-shrink-0" style={{ color: INK }}>Resume →</span>
        </button>
      )}

      {/* Already sent */}
      {dispatchedLines.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Sent so far</span>
          {dispatchedLines.map(r => <SentLine key={r.id} request={r} onChange={refresh} />)}
        </div>
      )}

      {/* Suggested lines. While the model is still reading the email you can already start a
          request by hand — the suggestions only save you a click. */}
      {detecting && suggestedOpen.length === 0 && (
        <span className="flex items-center gap-2 text-[13px]" style={{ color: FAINT }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: INK }} aria-hidden />
          Reading the email to suggest which cover to quote
        </span>
      )}
      {suggestedOpen.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px]" style={{ color: MUTED }}>Suggested from this email</span>
          <div className="flex flex-wrap items-center gap-2">
            {suggestedOpen.map(line => (
              <button key={line} type="button" onClick={() => openLineInsurers(line)}
                className={cn(CHIP, 'hover:bg-[#f8f9fa]')} style={{ borderColor: CTRL, color: INK }}>
                <Plus size={12} aria-hidden /> {productLineLabel(line)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual start: the one filled button on the desk */}
      <button type="button" onClick={openWizardBlank} className={cn(BTN_PRIMARY, 'self-start')}>
        <Plus size={15} aria-hidden /> New quotation request
      </button>

      <RfqWizard
        open={wizardOpen} onOpenChange={setWizardOpen}
        step={step} setStep={setStep}
        activeLine={activeLine} lineInsurers={lineInsurers}
        picked={picked} setPicked={setPicked}
        pickedLines={pickedLines} togglePickLine={togglePickLine} beginLineQueue={beginLineQueue}
        queueRemaining={lineQueue.length} onAddAnotherLine={goToLineSelect}
        confirmInsurers={confirmInsurers}
        staged={staged} patchIns={patchIns} regenerate={generateDraft}
        attachments={attachments} senders={senders} signatures={signatures}
        fromEmail={fromEmail} setFromEmail={setFromEmail} sigId={sigId} setSigId={setSigId}
        sendInsurer={sendInsurer} sendAll={sendAll} stagedCount={stagedCount}
      />
    </div>
  )
}

// ── Already-sent line (status + chase) ────────────────────────────────────────

function SentLine({ request, onChange }: { request: RfqRequest; onChange: () => void }) {
  const [chasingId, setChasingId] = useState<string | null>(null)
  async function chase(id: string) {
    setChasingId(id)
    try { await fetch('/api/nexus/rfq/chase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispatch_id: id }) }); onChange() }
    finally { setChasingId(null) }
  }
  const total = request.dispatches.length
  const replied = request.dispatches.filter(d => d.status === 'replied').length
  return (
    <div className="rounded-[12px] bg-white p-3.5 flex flex-col gap-2" style={{ border: `1px solid ${HAIR}` }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] font-medium" style={{ color: INK }}>{productLineLabel(request.product_line)}</span>
        <span className="text-[12.5px] tabular-nums flex-shrink-0" style={{ color: MUTED }}>{replied} of {total} replied</span>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col">
        {request.dispatches.map((d, i) => {
          const hasReplied = d.status === 'replied'
          const waited = daysSince(d.updated_at || d.created_at)
          return (
            <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]" style={{ borderTop: i > 0 ? `1px solid ${HAIR}` : undefined }}>
              <span className="min-w-0 truncate" style={{ color: INK }}>{d.insurer_name || d.to_email}</span>
              <span className="flex items-center gap-3 flex-shrink-0" style={{ color: MUTED }}>
                <span>{hasReplied ? 'Replied' : `Sent · ${waited} day${waited === 1 ? '' : 's'} ago`}</span>
                {!hasReplied && (
                  <button type="button" onClick={() => chase(d.id)} disabled={chasingId === d.id} className={LINK} style={{ color: INK }}>
                    {chasingId === d.id ? 'Chasing…' : 'Chase'}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Wizard modal ──────────────────────────────────────────────────────────────

/** The three steps as a muted numbered underline: the current one is ink with an ink rule. */
function StepBar({ step }: { step: Step }) {
  const idx = STEPS.findIndex(s => s.key === step)
  return (
    <ol className="m-0 p-0 list-none flex items-center gap-5 text-[13px]" aria-label="Steps" style={{ borderBottom: `1px solid ${HAIR}` }}>
      {STEPS.map((s, i) => {
        const current = i === idx
        return (
          <li key={s.key} aria-current={current ? 'step' : undefined}
            className={cn('flex items-center gap-1.5 pb-2 -mb-px', current && 'font-medium')}
            style={{ color: current ? INK : i < idx ? BODY : FAINT, borderBottom: `2px solid ${current ? INK : 'transparent'}` }}>
            <span className="tabular-nums">{i + 1}</span>
            <span>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function RfqWizard(p: {
  open: boolean; onOpenChange: (v: boolean) => void
  step: Step; setStep: (s: Step) => void
  activeLine: string | null; lineInsurers: Insurer[]
  picked: string[]; setPicked: React.Dispatch<React.SetStateAction<string[]>>
  pickedLines: string[]; togglePickLine: (slug: string) => void; beginLineQueue: () => void
  queueRemaining: number; onAddAnotherLine: () => void
  confirmInsurers: () => void
  staged: StagedLine[]; patchIns: (line: string, contactId: string, patch: Partial<StagedInsurer>) => void
  regenerate: (line: string, ins: Insurer) => void
  attachments: Attachment[]; senders: Sender[]; signatures: SigOption[]
  fromEmail: string; setFromEmail: (v: string) => void; sigId: string; setSigId: (v: string) => void
  sendInsurer: (line: string, ins: StagedInsurer) => void; sendAll: () => void; stagedCount: number
}) {
  const stagedLines = new Set(p.staged.map(l => l.line))

  function toggle(id: string) { p.setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] max-h-[calc(88vh/var(--ui-zoom))] overflow-hidden flex flex-col gap-4">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[18px] font-medium tracking-[-0.01em]" style={{ color: INK }}>
            {p.step === 'line' ? 'New quotation request' : p.step === 'insurers'
              ? `Insurers for ${p.activeLine ? productLineLabel(p.activeLine) : 'this line'}`
              : 'Review and send'}
          </DialogTitle>
          <DialogDescription className="text-[13px]" style={{ color: MUTED }}>
            {p.step === 'line' ? 'Select the lines of insurance the client is asking to quote. Insurers are picked for each line in turn.'
              : p.step === 'insurers' ? `One draft is prepared per insurer.${p.queueRemaining > 0 ? ` ${p.queueRemaining} more line${p.queueRemaining === 1 ? '' : 's'} to configure after this one.` : ''}`
              : 'Check the recipient, content and attachments on each draft, then send all or one at a time.'}
          </DialogDescription>
        </DialogHeader>

        <StepBar step={p.step} />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* Step 1 — pick lines (grouped like the website navbar) */}
          {p.step === 'line' && (
            <div className="flex flex-col gap-5">
              {groupedProductLines().map(g => (
                <div key={g.key} className="flex flex-col gap-2.5">
                  <span className="text-[13.5px] font-medium" style={{ color: INK }}>{g.label}</span>
                  {g.sections.map(sec => (
                    <div key={sec.section} className="flex flex-col gap-1.5">
                      <span className="text-[12.5px]" style={{ color: MUTED }}>{sec.section}</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sec.lines.map(pl => {
                          const done = stagedLines.has(pl.slug)
                          const sel  = p.pickedLines.includes(pl.slug)
                          return (
                            <button key={pl.slug} type="button" onClick={() => !done && p.togglePickLine(pl.slug)} disabled={done} aria-pressed={sel}
                              className={cn('flex items-center gap-2.5 text-left text-[13.5px] rounded-[10px] px-3 py-2.5 bg-white transition-colors cursor-pointer',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]',
                                done ? 'cursor-default' : 'hover:bg-[#f8f9fa]')}
                              style={{ border: `1px solid ${sel ? INK : CTRL}`, color: done ? FAINT : INK, background: done ? FIELD : undefined }}>
                              <span className="flex-shrink-0 w-4 h-4 rounded-[4px] flex items-center justify-center" aria-hidden
                                style={{ border: `1px solid ${sel ? INK : DOT}`, background: sel ? INK : '#fff', color: '#fff' }}>
                                {sel && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span className="min-w-0 truncate">{pl.label}</span>
                              {done && <span className="ml-auto flex-shrink-0 text-[12.5px]" style={{ color: FAINT }}>Staged</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Step 2 — pick insurers as outlined toggle chips */}
          {p.step === 'insurers' && (
            <div className="flex flex-col gap-3">
              {p.lineInsurers.length === 0 ? (
                <p className="m-0 text-[13.5px] py-8 text-center" style={{ color: MUTED }}>
                  No insurers cover this line yet. Add them under Settings, Insurer directory.
                </p>
              ) : (
                <>
                  <p className="m-0 text-[12.5px]" style={{ color: MUTED }}>{p.picked.length} of {p.lineInsurers.length} selected</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Insurers">
                    {p.lineInsurers.map(i => {
                      const on = p.picked.includes(i.contact_id)
                      return (
                        <button key={i.contact_id} type="button" onClick={() => toggle(i.contact_id)} aria-pressed={on}
                          title={[i.contact_name, i.contact_email].filter(Boolean).join(' · ')}
                          className={cn(CHIP, 'h-auto min-h-8 py-1.5', on ? 'hover:opacity-90' : 'hover:bg-[#f8f9fa]')}
                          style={on ? { background: INK, borderColor: INK, color: '#fff' } : { borderColor: CTRL, color: INK }}>
                          {on && <Check size={12} strokeWidth={2.5} aria-hidden />}
                          <span className="flex flex-col items-start leading-tight text-left">
                            <span>{i.insurer_name}</span>
                            <span className="text-[12px] font-normal" style={{ color: on ? 'rgba(255,255,255,0.75)' : MUTED }}>{i.contact_name ? `${i.contact_name} · ` : ''}{i.contact_email}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3 — review drafts */}
          {p.step === 'review' && (
            <div className="flex flex-col gap-5">
              {p.stagedCount > 0 && (
                <div className="rounded-[12px] p-3.5 flex flex-col sm:flex-row gap-3" style={{ border: `1px solid ${HAIR}` }}>
                  <label className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <span className="text-[12.5px]" style={{ color: MUTED }}>From</span>
                    <select value={p.fromEmail} onChange={e => p.setFromEmail(e.target.value)} className={SELECT} style={{ border: `1px solid ${CTRL}`, color: INK }}>
                      {p.senders.map(s => <option key={s.email} value={s.email}>{(s.type === 'shared' ? 'Shared · ' : 'You · ') + s.email}</option>)}
                    </select>
                    {p.senders.find(s => s.email === p.fromEmail)?.type === 'personal' && (
                      <span className="text-[12.5px]" style={{ color: MUTED }}>operations@ is copied so the thread appears in Engagement.</span>
                    )}
                  </label>
                  <label className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <span className="text-[12.5px]" style={{ color: MUTED }}>Signature</span>
                    <select value={p.sigId} onChange={e => p.setSigId(e.target.value)} className={SELECT} style={{ border: `1px solid ${CTRL}`, color: INK }}>
                      {p.signatures.length === 0 && <option value="">No signature</option>}
                      {p.signatures.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {p.stagedCount === 0 && <p className="m-0 text-[13.5px] py-8 text-center" style={{ color: MUTED }}>Nothing staged yet.</p>}
              {p.staged.map(l => (
                <div key={l.line} className="flex flex-col gap-2.5">
                  <span className="text-[13.5px] font-medium" style={{ color: INK }}>{productLineLabel(l.line)}</span>
                  {l.insurers.map(ins => (
                    <DraftCard key={ins.contact_id} line={l.line} ins={ins}
                      attachments={p.attachments}
                      sigHtml={(() => { const s = p.signatures.find(x => x.id === p.sigId); return s ? buildSigHtml(s) : '' })()}
                      patchIns={p.patchIns} regenerate={p.regenerate} onSend={() => p.sendInsurer(l.line, ins)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer nav: one filled button per step */}
        <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
          <div className="flex items-center gap-2">
            {p.step === 'insurers' && (
              <button type="button" onClick={() => p.setStep(p.staged.length ? 'review' : 'line')} className={BTN_TERTIARY}>
                <ChevronLeft size={14} aria-hidden /> Back
              </button>
            )}
            {p.step === 'review' && (
              <button type="button" onClick={p.onAddAnotherLine} className={BTN_SECONDARY}>
                <Plus size={13} aria-hidden /> Add another line
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {p.step === 'line' && (
              <button type="button" onClick={p.beginLineQueue} disabled={p.pickedLines.length === 0} className={BTN_PRIMARY}>
                Next{p.pickedLines.length ? ` · ${p.pickedLines.length} line${p.pickedLines.length === 1 ? '' : 's'}` : ''}
              </button>
            )}
            {p.step === 'insurers' && (
              <button type="button" onClick={p.confirmInsurers} disabled={p.picked.length === 0} className={BTN_PRIMARY}>
                {p.queueRemaining > 0
                  ? 'Prepare drafts · next line'
                  : `Prepare ${p.picked.length || ''} draft${p.picked.length === 1 ? '' : 's'} and review`}
              </button>
            )}
            {p.step === 'review' && p.stagedCount > 0 && (
              <button type="button" onClick={p.sendAll} className={BTN_PRIMARY}>
                Send all ({p.stagedCount})
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── One insurer draft card ────────────────────────────────────────────────────

/** A draft being written: an ink bar on a hairline track, no percentage (there is no signal). */
function DraftingBar({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1.5 py-2" role="progressbar" aria-label={label}>
      <span className="text-[12.5px] flex items-center gap-1.5" style={{ color: FAINT }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: INK }} aria-hidden />
        {label}
      </span>
      <div className="relative h-1 w-full overflow-hidden rounded-full" style={{ background: HAIR }}>
        <span className="absolute top-0 h-full rounded-full animate-trs-indeterminate" style={{ background: INK, opacity: 0.7 }} />
      </div>
    </div>
  )
}

function DraftCard({
  line, ins, attachments, sigHtml, patchIns, regenerate, onSend,
}: {
  line: string; ins: StagedInsurer; attachments: Attachment[]
  sigHtml: string
  patchIns: (line: string, contactId: string, patch: Partial<StagedInsurer>) => void
  regenerate: (line: string, ins: Insurer) => void
  onSend: () => void
}) {
  const [showAttach, setShowAttach] = useState(false)
  const [ccOpen, setCcOpen] = useState(!!ins.cc.trim())
  const set = (patch: Partial<StagedInsurer>) => patchIns(line, ins.contact_id, patch)
  const toggleAttach = (id: string) => set({ attach: ins.attach.includes(id) ? ins.attach.filter(x => x !== id) : [...ins.attach, id] })
  const fieldLabel = 'text-[12.5px] w-14 flex-shrink-0'

  if (ins.sent) {
    return (
      <div className="rounded-[12px] px-3.5 py-2.5 flex items-center gap-2.5 text-[13.5px]" style={{ border: `1px solid ${HAIR}`, background: FIELD, color: BODY }}>
        <Check size={14} strokeWidth={2.5} aria-hidden style={{ color: INK }} />
        <span><b className="font-medium" style={{ color: INK }}>Sent</b> to {ins.insurer_name} <span style={{ color: MUTED }}>({ins.to})</span></span>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] bg-white p-3.5 flex flex-col gap-2.5" style={{ border: `1px solid ${CTRL}` }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-medium min-w-0 truncate" style={{ color: INK }}>
          {ins.insurer_name}{ins.contact_name ? <span className="font-normal" style={{ color: MUTED }}> · {ins.contact_name}</span> : null}
        </span>
        {!ins.loadingDraft && (
          <button type="button" onClick={() => regenerate(line, ins)} className={cn(LINK, 'flex-shrink-0')} style={{ color: MUTED }}>Regenerate</button>
        )}
      </div>

      {ins.loadingDraft ? (
        <DraftingBar label="Drafting…" />
      ) : ins.draftError ? (
        <p className="m-0 text-[13px]" style={{ color: BODY }} role="alert">Draft failed: {ins.draftError}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 flex-1 min-w-0">
              <span className={fieldLabel} style={{ color: MUTED }}>To</span>
              <input value={ins.to} onChange={e => set({ to: e.target.value })} className={INPUT} style={{ border: `1px solid ${CTRL}`, color: INK }} />
            </label>
            {!ccOpen && (
              <button type="button" onClick={() => setCcOpen(true)} className={cn(LINK, 'flex-shrink-0')} style={{ color: MUTED }}>
                Cc{ins.cc.trim() ? ` (${parseEmails(ins.cc).length})` : ''}
              </button>
            )}
          </div>
          {ccOpen && (
            <label className="flex items-center gap-2">
              <span className={fieldLabel} style={{ color: MUTED }}>Cc</span>
              <input value={ins.cc} onChange={e => set({ cc: e.target.value, ccTouched: true })} placeholder="Comma-separated emails" className={INPUT} style={{ border: `1px solid ${CTRL}`, color: INK }} />
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className={fieldLabel} style={{ color: MUTED }}>Subject</span>
            <input value={ins.subject} onChange={e => set({ subject: e.target.value })} className={INPUT} style={{ border: `1px solid ${CTRL}`, color: INK }} />
          </label>
          <RichTextEditor html={ins.body} resetKey={ins.gen} onChange={html => set({ body: html })} />

          {/* Signature preview — exactly what gets appended on send (no duplicates) */}
          {sigHtml ? (
            <div className="rounded-[10px] px-3 py-2.5" style={{ background: FIELD }}>
              <p className="m-0 mb-1 text-[12px]" style={{ color: MUTED }}>Signature appended on send</p>
              <div className="text-[13px]" style={{ color: BODY }} dangerouslySetInnerHTML={{ __html: sigHtml }} />
            </div>
          ) : (
            <p className="m-0 text-[12.5px]" style={{ color: FAINT }}>No signature selected. Nothing is appended.</p>
          )}

          {/* Attachments — manual add */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => setShowAttach(v => !v)} aria-expanded={showAttach} className={cn(LINK, 'self-start inline-flex items-center gap-1.5')} style={{ color: INK }}>
                <Paperclip size={12} aria-hidden /> Attachments{ins.attach.length > 0 ? ` (${ins.attach.length})` : ''}
              </button>
              {showAttach && (
                <div className="flex flex-col gap-1.5 pl-1">
                  {attachments.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: BODY }}>
                      <input type="checkbox" checked={ins.attach.includes(a.id)} onChange={() => toggleAttach(a.id)} className="accent-[#202124]" />
                      <span className="truncate">{a.filename}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {ins.sendError && <p className="m-0 text-[13px]" style={{ color: BODY }} role="alert">{ins.sendError}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={onSend} disabled={ins.sending || !ins.to.trim() || !htmlToText(ins.body)} className={BTN_SECONDARY}>
              {ins.sending ? 'Sending…' : `Send to ${ins.insurer_name}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
