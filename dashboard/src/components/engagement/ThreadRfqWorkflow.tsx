'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, ExternalLink, Sparkles, Paperclip, Check, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { RichTextEditor } from './RichTextEditor'
import { groupedProductLines, productLineLabel } from '@/lib/product-lines'

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
 */

type Insurer  = { contact_id: string; insurer_id: string | null; insurer_name: string; contact_name: string | null; contact_email: string }
type Dispatch = { id: string; insurer_name: string | null; to_email: string; status: string; insurer_contact_id: string | null; created_at: string; updated_at?: string }
type RfqRequest = { id: string; product_line: string; dispatches: Dispatch[]; matching_insurers: Insurer[] }
type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }
type Attachment = { id: string; filename: string; mime_type: string | null; storage_url: string; size_bytes?: number | null }

// One insurer being drafted to inside the wizard. `body` is HTML (rich editor).
type StagedInsurer = Insurer & {
  to: string; subject: string; body: string
  cc: string; ccTouched: boolean
  gen: number                      // bumps when body is (re)generated → re-seeds editor
  loadingDraft: boolean; draftError: string | null
  attach: string[]                 // manually-selected attachment ids
  sending: boolean; sendError: string | null; sent: boolean
}
type StagedLine = { line: string; insurers: StagedInsurer[] }

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
  const [step,       setStep]       = useState<'line' | 'insurers' | 'review'>('line')
  const [activeLine, setActiveLine] = useState<string | null>(null)   // line being configured in the 'insurers' step
  const [lineInsurers, setLineInsurers] = useState<Insurer[]>([])
  const [picked,     setPicked]     = useState<string[]>([])          // contact_ids checked in 'insurers' step
  const [staged,     setStaged]     = useState<StagedLine[]>([])

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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const [sug, atts, sndrs, sigs] = await Promise.all([
        fetch('/api/nexus/rfq/start', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId, message_id: messageId, suggest: true }) }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/nexus/rfq/attachments?thread_id=${threadId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      ])
      if (cancelled) return
      if (sug) {
        setSuggested((sug.suggested_lines ?? []).map((l: { product_line: string }) => l.product_line))
        if (sug.insured_name && !defaultInsured) setInsured(sug.insured_name)
      }
      setAttachments(Array.isArray(atts) ? atts : [])
      const sa = Array.isArray(sndrs) ? sndrs : []; setSenders(sa); if (sa.length) setFromEmail(sa[0].email)
      const ga = Array.isArray(sigs) ? sigs : []; setSignatures(ga); if (ga.length) setSigId(ga[0].id)
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [threadId, messageId, defaultInsured, refresh])

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
      patchIns(line, ins.contact_id, { loadingDraft: false, subject: d.subject ?? '', body: plainToHtml(d.body ?? ''), to: d.to_email || ins.contact_email, gen: Date.now() })
    } catch (e) {
      patchIns(line, ins.contact_id, { loadingDraft: false, draftError: String(e) })
    }
  }, [insured, messageId, patchIns])

  // ── wizard navigation ───────────────────────────────────────────────────────
  function openWizardBlank() { setStep('line'); setActiveLine(null); setPicked([]); setWizardOpen(true) }

  async function openLineInsurers(line: string) {
    setActiveLine(line); setPicked([]); setStep('insurers'); setWizardOpen(true)
    const rows = await fetch(`/api/nexus/rfq/insurers?product_line=${line}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
    setLineInsurers(Array.isArray(rows) ? rows : [])
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
      const toStaged = (i: Insurer): StagedInsurer => ({ ...i, to: i.contact_email, subject: '', body: '', cc: personalSelected ? OPS_EMAIL : '', ccTouched: false, gen: 0, loadingDraft: true, draftError: null, attach: [], sending: false, sendError: null, sent: false })
      if (existing) {
        const have = new Set(existing.insurers.map(i => i.contact_id))
        const merged = { ...existing, insurers: [...existing.insurers, ...chosen.filter(i => !have.has(i.contact_id)).map(toStaged)] }
        return prev.map(l => l.line === activeLine ? merged : l)
      }
      return [...prev, { line: activeLine, insurers: chosen.map(toStaged) }]
    })
    // Kick off drafts for the newly-picked insurers.
    chosen.forEach(i => generateDraft(activeLine, i))
    setStep('review')
  }

  async function sendInsurer(line: string, ins: StagedInsurer) {
    const plain = htmlToText(ins.body)
    if (!ins.to.trim() || !plain) return
    patchIns(line, ins.contact_id, { sending: true, sendError: null })
    try {
      const sig = signatures.find(s => s.id === sigId)
      const bodyHtml = ins.body + (sig ? buildSigHtml(sig) : '')
      const atts = attachments.filter(a => ins.attach.includes(a.id)).map(a => ({ filename: a.filename, mime_type: a.mime_type ?? undefined, storage_url: a.storage_url }))
      const cc = parseEmails(ins.cc)

      const draftRes = await fetch('/api/nexus/draft-create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body: plain, email_type: 'RFQ_INSURER', to_email: ins.to.trim() }) })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare draft')

      const sendRes = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draftData.draftId, htmlBody: bodyHtml, originalAiBody: plain, toEmail: ins.to.trim(), cc, customSubject: ins.subject, fromEmail: fromEmail || null, signatureId: sigId || null, attachments: atts }) })
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

  if (loading) return <div className="p-5 text-[12px] text-muted-foreground">Loading RFQ…</div>

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Request for Quotation</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Pick a line &amp; insurers, review each draft, then send. The Nexus file opens on your first send.</p>
        </div>
        {caseId && (
          <a href={`/nexus?case=${caseId}`} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline flex-shrink-0">
            Open file in Nexus <ExternalLink size={11} />
          </a>
        )}
      </div>

      <label className="flex flex-col gap-1.5 max-w-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Insured / client</span>
        <input value={insured} onChange={e => setInsured(e.target.value)} placeholder="Company or person seeking cover"
          className="text-[12px] rounded-md border border-[--border-subtle] bg-background px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/20" />
      </label>

      {/* Resume banner */}
      {stagedCount > 0 && !wizardOpen && (
        <button onClick={() => { setStep('review'); setWizardOpen(true) }}
          className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left">
          <span className="text-[12px] font-medium text-primary">RFQ in progress — {stagedCount} draft{stagedCount !== 1 ? 's' : ''} staged</span>
          <span className="text-[11px] font-semibold text-primary">Resume →</span>
        </button>
      )}

      {/* Already sent */}
      {dispatchedLines.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Sent so far</span>
          {dispatchedLines.map(r => <SentLine key={r.id} request={r} onChange={refresh} />)}
        </div>
      )}

      {/* Suggested lines */}
      {suggestedOpen.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            <Sparkles size={11} className="text-primary" /> Suggested from this email
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestedOpen.map(line => (
              <button key={line} onClick={() => openLineInsurers(line)}
                className="flex items-center gap-1 text-[11px] rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-medium text-primary hover:bg-primary/10">
                <Plus size={10} /> {productLineLabel(line)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual start */}
      <button onClick={openWizardBlank}
        className="self-start flex items-center gap-1.5 text-[11.5px] font-semibold rounded-md border border-[--border-subtle] px-3 py-1.5 text-foreground hover:bg-muted">
        <Plus size={12} /> New quotation request
      </button>

      <RfqWizard
        open={wizardOpen} onOpenChange={setWizardOpen}
        step={step} setStep={setStep}
        activeLine={activeLine} lineInsurers={lineInsurers}
        picked={picked} setPicked={setPicked}
        onPickLine={openLineInsurers} confirmInsurers={confirmInsurers}
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
  return (
    <div className="rounded-lg border border-[--border-subtle] bg-card p-3 flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-foreground">{productLineLabel(request.product_line)}</span>
      <div className="flex flex-wrap gap-1.5">
        {request.dispatches.map(d => {
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
    </div>
  )
}

// ── Wizard modal ──────────────────────────────────────────────────────────────

function RfqWizard(p: {
  open: boolean; onOpenChange: (v: boolean) => void
  step: 'line' | 'insurers' | 'review'; setStep: (s: 'line' | 'insurers' | 'review') => void
  activeLine: string | null; lineInsurers: Insurer[]
  picked: string[]; setPicked: React.Dispatch<React.SetStateAction<string[]>>
  onPickLine: (line: string) => void; confirmInsurers: () => void
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
      <DialogContent className="sm:max-w-[1000px] max-h-[calc(88vh/var(--ui-zoom))] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {p.step === 'line' ? 'New quotation request' : p.step === 'insurers'
              ? `Select insurers — ${p.activeLine ? productLineLabel(p.activeLine) : ''}`
              : 'Review & send'}
          </DialogTitle>
          <DialogDescription>
            {p.step === 'line' ? 'Which line of insurance is the client asking to quote?'
              : p.step === 'insurers' ? 'Pick the insurers to request a quote from. One draft is prepared per insurer.'
              : 'Check the recipient, content and attachments on each, then send all or individually.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {/* Step 1 — pick a line (grouped like the website navbar) */}
          {p.step === 'line' && (
            <div className="flex flex-col gap-4">
              {groupedProductLines().map(g => (
                <div key={g.key} className="flex flex-col gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">{g.label}</span>
                  {g.sections.map(sec => (
                    <div key={sec.section} className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">{sec.section}</span>
                      <div className="grid grid-cols-2 gap-2">
                        {sec.lines.map(pl => {
                          const done = stagedLines.has(pl.slug)
                          return (
                            <button key={pl.slug} onClick={() => p.onPickLine(pl.slug)} disabled={done}
                              className={cn('text-left text-[12.5px] rounded-md border px-3 py-2.5 transition-colors',
                                done ? 'border-[--border-subtle] bg-muted/40 text-muted-foreground/60 cursor-default'
                                     : 'border-[--border-subtle] hover:border-primary/50 hover:bg-primary/5')}>
                              {pl.label}{done && ' ✓'}
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

          {/* Step 2 — pick insurers */}
          {p.step === 'insurers' && (
            <div className="flex flex-col gap-2">
              {p.lineInsurers.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-6 text-center">
                  No insurers cover this line yet — add them in <span className="font-medium">Settings → Insurer Directory</span>.
                </p>
              ) : p.lineInsurers.map(i => {
                const on = p.picked.includes(i.contact_id)
                return (
                  <button key={i.contact_id} onClick={() => toggle(i.contact_id)}
                    className={cn('flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                      on ? 'border-primary bg-primary/5' : 'border-[--border-subtle] hover:bg-muted')}>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground">{i.insurer_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{i.contact_name ? `${i.contact_name} · ` : ''}{i.contact_email}</p>
                    </div>
                    <span className={cn('h-4 w-4 rounded flex items-center justify-center border flex-shrink-0', on ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')}>
                      {on && <Check size={12} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Step 3 — review drafts */}
          {p.step === 'review' && (
            <div className="flex flex-col gap-4">
              {p.stagedCount === 0 && <p className="text-[12px] text-muted-foreground py-6 text-center">Nothing staged yet.</p>}
              {p.staged.map(l => (
                <div key={l.line} className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{productLineLabel(l.line)}</span>
                  {l.insurers.map(ins => (
                    <DraftCard key={ins.contact_id} line={l.line} ins={ins}
                      attachments={p.attachments}
                      patchIns={p.patchIns} regenerate={p.regenerate} onSend={() => p.sendInsurer(l.line, ins)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 border-t border-[--border-subtle] pt-3 mt-1">
          <div className="flex items-center gap-2">
            {p.step === 'insurers' && (
              <button onClick={() => p.setStep(p.staged.length ? 'review' : 'line')} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                <ChevronLeft size={13} /> Back
              </button>
            )}
            {p.step === 'review' && (
              <button onClick={() => p.setStep('line')} className="flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline">
                <Plus size={12} /> Add another line
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Shared from/signature pickers on review */}
            {p.step === 'review' && p.senders.length > 1 && (
              <select value={p.fromEmail} onChange={e => p.setFromEmail(e.target.value)} className="text-[11px] rounded-md border border-[--border-subtle] bg-background px-2 py-1 max-w-[160px]">
                {p.senders.map(s => <option key={s.email} value={s.email}>{s.label || s.email}</option>)}
              </select>
            )}
            {p.step === 'review' && p.signatures.length > 0 && (
              <select value={p.sigId} onChange={e => p.setSigId(e.target.value)} className="text-[11px] rounded-md border border-[--border-subtle] bg-background px-2 py-1 max-w-[150px]">
                {p.signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {p.step === 'insurers' && (
              <button onClick={p.confirmInsurers} disabled={p.picked.length === 0}
                className="text-[11.5px] font-semibold px-4 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                Prepare {p.picked.length || ''} draft{p.picked.length === 1 ? '' : 's'}
              </button>
            )}
            {p.step === 'review' && p.stagedCount > 0 && (
              <button onClick={p.sendAll} className="text-[11.5px] font-semibold px-4 py-1.5 rounded-md bg-primary text-primary-foreground">
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

function DraftCard({
  line, ins, attachments, patchIns, regenerate, onSend,
}: {
  line: string; ins: StagedInsurer; attachments: Attachment[]
  patchIns: (line: string, contactId: string, patch: Partial<StagedInsurer>) => void
  regenerate: (line: string, ins: Insurer) => void
  onSend: () => void
}) {
  const [showAttach, setShowAttach] = useState(false)
  const [ccOpen, setCcOpen] = useState(!!ins.cc.trim())
  const set = (patch: Partial<StagedInsurer>) => patchIns(line, ins.contact_id, patch)
  const inp = 'w-full text-[12px] border border-[--border-subtle] rounded-md px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-primary/20'
  const toggleAttach = (id: string) => set({ attach: ins.attach.includes(id) ? ins.attach.filter(x => x !== id) : [...ins.attach, id] })

  if (ins.sent) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2 text-[12px] text-emerald-700 font-semibold">
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white"><Check size={11} strokeWidth={3} /></span>
        Done · sent to {ins.insurer_name} <span className="font-normal text-emerald-700/70">({ins.to})</span>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-[--border-subtle] bg-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-foreground">{ins.insurer_name}{ins.contact_name ? <span className="text-muted-foreground font-normal"> · {ins.contact_name}</span> : null}</span>
        {!ins.loadingDraft && (
          <button onClick={() => regenerate(line, ins)} className="text-[10.5px] text-muted-foreground hover:text-foreground">Regenerate</button>
        )}
      </div>

      {ins.loadingDraft ? (
        <p className="text-[12px] text-muted-foreground py-3 text-center">Drafting…</p>
      ) : ins.draftError ? (
        <p className="text-[11.5px] text-destructive">Draft failed: {ins.draftError}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 flex-1"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">To</span>
              <input value={ins.to} onChange={e => set({ to: e.target.value })} className={inp} /></label>
            {!ccOpen && (
              <button onClick={() => setCcOpen(true)} className="text-[10.5px] font-semibold text-muted-foreground hover:text-foreground flex-shrink-0">
                Cc{ins.cc.trim() ? ` (${parseEmails(ins.cc).length})` : ''}
              </button>
            )}
          </div>
          {ccOpen && (
            <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Cc</span>
              <input value={ins.cc} onChange={e => set({ cc: e.target.value, ccTouched: true })} placeholder="comma-separated emails" className={inp} /></label>
          )}
          <label className="flex items-center gap-2"><span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 flex-shrink-0">Subject</span>
            <input value={ins.subject} onChange={e => set({ subject: e.target.value })} className={inp} /></label>
          <RichTextEditor html={ins.body} resetKey={ins.gen} onChange={html => set({ body: html })} />

          {/* Attachments — manual add */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1">
              <button onClick={() => setShowAttach(v => !v)} className="self-start flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <Paperclip size={11} /> Attachments{ins.attach.length > 0 ? ` (${ins.attach.length})` : ''}
              </button>
              {showAttach && (
                <div className="flex flex-col gap-1 pl-1">
                  {attachments.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                      <input type="checkbox" checked={ins.attach.includes(a.id)} onChange={() => toggleAttach(a.id)} className="accent-primary" />
                      <span className="truncate">{a.filename}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {ins.sendError && <p className="text-[11px] text-destructive">{ins.sendError}</p>}
          <div className="flex justify-end">
            <button onClick={onSend} disabled={ins.sending || !ins.to.trim() || !htmlToText(ins.body)}
              className="text-[11px] font-semibold px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              {ins.sending ? 'Sending…' : `Send to ${ins.insurer_name}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
