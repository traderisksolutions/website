'use client'

// Engagement Compose Panel — Phase 3
//
// ALL business logic, hooks, and API calls are preserved verbatim from
// ComposePanel.tsx. Only the visual shell (JSX structure + CSS classes)
// has been updated. If you need to add logic, do it here.

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, ChevronDown, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/Tip'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, RagSource, SigOption, Sender } from '@/components/engagement/types'
import { fullName } from '@/components/engagement/helpers'

interface EngagementComposePanelProps {
  lead:              Lead
  thread:            { id: string; subject: string | null; status: string; last_message_at: string | null; message_count: number } | null
  messages:          RealMsg[]
  toAddress:         string
  ccList:            string[]
  bccList:           string[]
  customSubject:     string
  setToAddress:      (v: string) => void
  setCcList:         (v: string[]) => void
  setBccList:        (v: string[]) => void
  setCustomSubject:  (v: string) => void
  storedDraft?:      string | null
  storedRagDraft?:   string | null
  storedRagSources?: RagSource[]
  onRagRefresh?:     () => void
  onThreadRefresh?:  () => void
  pendingRestore?:   { body: string; generatedBy: string; stamp: number } | null
}

export function EngagementComposePanel({
  lead, thread, messages,
  toAddress, ccList, bccList, customSubject,
  setToAddress, setCcList, setBccList, setCustomSubject,
  storedDraft, storedRagDraft, storedRagSources,
  onRagRefresh, onThreadRefresh, pendingRestore,
}: EngagementComposePanelProps) {
  const lastMsg    = messages.at(-1)
  const needsReply = lastMsg?.direction === 'inbound'

  // ── All state preserved verbatim ──────────────────────────────────────────
  const [open,            setOpen]            = useState(true)
  const [draftId,         setDraftId]         = useState<string | null>(null)
  const [draftHtml,       setDraftHtml]       = useState('')
  const [draftLoaded,     setDraftLoaded]     = useState(false)
  const [draftEditorKey,  setDraftEditorKey]  = useState(0)
  const [loading,         setLoading]         = useState<'gen' | 'send' | null>(null)
  const [sent,            setSent]            = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [aiDraftChecked,  setAiDraftChecked]  = useState(false)
  const [showCc,          setShowCc]          = useState(ccList.length > 0)
  const [showBcc,         setShowBcc]         = useState(bccList.length > 0)
  const [ragSources,      setRagSources]      = useState<RagSource[]>(storedRagSources ?? [])
  const [showSources,     setShowSources]     = useState(false)

  const [signatures,      setSignatures]      = useState<SigOption[]>([])
  const [selectedSigId,   setSelectedSigId]   = useState<string>('')
  const [senders,         setSenders]         = useState<Sender[]>([])
  const [selectedFrom,    setSelectedFrom]    = useState<string>('')
  const [sigsLoaded,      setSigsLoaded]      = useState(false)

  const log = useAuditLog()

  // ── All helpers preserved verbatim ────────────────────────────────────────

  function buildSigHtml(sig: SigOption): string {
    return [
      '<br>',
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
      `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
      sig.title           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
      sig.phone           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
      sig.email           ? `<p style="margin:4px 0 0;font-size:12px;color:#666"><a href="mailto:${sig.email}" style="color:#1d4ed8;text-decoration:none">${sig.email}</a></p>` : '',
      sig.company_tagline ? `<p style="margin:4px 0 0;font-size:12px;color:#999">${sig.company_tagline}</p>` : '<p style="margin:4px 0 0;font-size:12px;color:#999">Trade Risk Solutions</p>',
    ].filter(Boolean).join('\n')
  }

  const selectedSig = signatures.find(s => s.id === selectedSigId) ?? null
  const sigHtml     = selectedSig ? buildSigHtml(selectedSig) : ''

  // ── All effects preserved verbatim ────────────────────────────────────────

  useEffect(() => {
    if (sigsLoaded) return
    setSigsLoaded(true)
    fetch('/api/signatures').then(r => r.ok ? r.json() : []).then((rows: SigOption[]) => {
      setSignatures(Array.isArray(rows) ? rows : [])
    }).catch(() => {})
    fetch('/api/email/available-senders').then(r => r.ok ? r.json() : []).then((rows: Sender[]) => {
      if (Array.isArray(rows) && rows.length > 0) {
        setSenders(rows)
        setSelectedFrom(rows[0].email)
      }
    }).catch(() => {})
  }, [sigsLoaded])

  useEffect(() => {
    if (!selectedFrom) return
    const matched = signatures.find(s => s.sending_email?.toLowerCase() === selectedFrom.toLowerCase())
    setSelectedSigId(matched?.id ?? '')
  }, [selectedFrom, signatures])

  useEffect(() => {
    setDraftId(null); setDraftHtml(''); setDraftLoaded(false)
    setDraftEditorKey(0); setSent(false); setError(null)
    setRagSources([]); setAiDraftChecked(false)
    setSelectedFrom(senders[0]?.email ?? '')
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingRestore) return
    setDraftHtml(pendingRestore.body)
    setDraftLoaded(true)
    setDraftEditorKey(k => k + 1)
    setOpen(true)
  }, [pendingRestore?.stamp]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tid = thread?.id
    if (!tid || sent) return
    let current = true
    setAiDraftChecked(false)
    fetch(`/api/engagement/draft?thread_id=${encodeURIComponent(tid)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((rows: { id: string; body: string }[]) => {
        if (!current) return
        const latest = Array.isArray(rows) ? rows[0] : null
        if (latest?.body) {
          setDraftId(latest.id)
          setDraftHtml(plainToHtml(latest.body))
          setDraftLoaded(true)
          setDraftEditorKey(k => k + 1)
        }
      })
      .catch(() => {})
      .finally(() => { if (current) setAiDraftChecked(true) })
    return () => { current = false }
  }, [thread?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aiDraftChecked || draftLoaded || sent) return
    if (storedDraft) {
      setDraftHtml(plainToHtml(storedDraft))
      setDraftLoaded(true)
      setDraftEditorKey(k => k + 1)
    }
  }, [aiDraftChecked, draftLoaded, sent, storedDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!thread?.id || !aiDraftChecked || draftLoaded || messages.length === 0 || sent) return
    if (messages.at(-1)?.direction !== 'inbound') return
    generate()
  }, [thread?.id, aiDraftChecked, draftLoaded, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (storedRagSources && !ragSources.length) {
      setRagSources(storedRagSources)
    }
  }, [storedRagSources]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── All handlers preserved verbatim ───────────────────────────────────────

  async function generate() {
    setLoading('gen'); setError(null)
    try {
      const res = await fetch('/api/engagement/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
          company: lead.company, topic: lead.topic, threadId: thread?.id ?? null,
          messages: messages.map(m => ({
            direction: m.direction, from_address: m.from_address,
            body_text: m.body_text, sent_at: m.sent_at,
          })),
        }),
      })
      const data = await res.json()
      if (res.status === 422 && data.error === 'not_an_enquiry') {
        setError('Not an insurance enquiry — no draft generated.')
        return
      }
      if (data.error) { setError(data.error); return }
      setDraftId(data.draftId)
      setDraftHtml(plainToHtml(data.content))
      setDraftEditorKey(k => k + 1)
      setOpen(true)
      log({
        action: 'draft.generated', resource_type: 'thread',
        resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email },
      })
    } catch { setError('Failed to generate draft') }
    finally { setLoading(null) }
  }

  async function handleSend() {
    const plainText = htmlToPlain(draftHtml)
    if (!plainText.trim()) { setError('Cannot send an empty message'); return }

    setLoading('send'); setError(null)
    try {
      let activeDraftId = draftId
      if (!activeDraftId) {
        const createRes = await fetch('/api/engagement/draft', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id, contactName: fullName(lead), contactEmail: lead.email,
            company: lead.company, topic: lead.topic, threadId: thread?.id ?? null,
            messages: [], manualContent: plainText,
          }),
        })
        const d = await createRes.json()
        if (d.error) { setError(d.error); return }
        activeDraftId = d.draftId
        setDraftId(activeDraftId)
      }

      await fetch('/api/engagement/draft', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId, status: 'approved', content: plainText }),
      })

      const sendRes = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId:       activeDraftId,
          htmlBody:      sigHtml ? draftHtml + sigHtml : draftHtml,
          toEmail:       toAddress || undefined,
          cc:            ccList.length  ? ccList  : undefined,
          bcc:           bccList.length ? bccList : undefined,
          customSubject: customSubject || undefined,
          fromEmail:     selectedFrom || undefined,
        }),
      })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        setError(err.error ?? 'Send failed')
        return
      }

      setSent(true)
      log({
        action: 'draft.approved', resource_type: 'thread',
        resource_id: thread?.id ?? lead.id,
        metadata: { contact: lead.email, chars: plainText.length },
      })
      onThreadRefresh?.()
    } finally { setLoading(null) }
  }

  const hasDraft = draftHtml.replace(/<[^>]+>/g, '').trim().length > 0
  const canSend  = hasDraft && !!toAddress.trim()

  // ── Sent state ─────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-t border-[--border-subtle] bg-card">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[--success]" />
          <span className="text-[12.5px] font-medium text-[--success]">Reply sent</span>
        </div>
        <button
          onClick={() => { setSent(false); setDraftHtml(''); setDraftId(null) }}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Compose another
        </button>
      </div>
    )
  }

  // ── Compose shell ──────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 border-t border-primary/25 bg-card">

      {/* ── Toggle header ── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? 'Collapse compose area' : 'Expand compose area'}
        className={cn(
          'w-full flex items-center justify-between px-5 h-10 text-left',
          'border-b border-[--border-subtle] transition-colors',
          open ? 'bg-card' : 'hover:bg-accent/20',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[12.5px] font-semibold text-foreground">Reply</span>
          {needsReply && !open && (
            <span className="text-[9.5px] font-bold px-2 py-[2px] rounded-full bg-[--warning-bg] text-[--warning]">
              Awaiting reply
            </span>
          )}
          {customSubject && open && (
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {customSubject.length > 44 ? customSubject.slice(0, 42) + '…' : customSubject}
            </span>
          )}
        </div>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className={cn('text-muted-foreground/50 transition-transform flex-shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          {/* ── Addressing fields ── */}
          <div className="pb-1">

            {/* TO */}
            <div className="flex items-center min-h-[36px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[52px] flex-shrink-0 pl-5">
                To
              </span>
              <input
                value={toAddress}
                onChange={e => setToAddress(e.target.value)}
                placeholder="recipient@example.com"
                aria-label="Recipient email address"
                className="flex-1 text-[12.5px] font-medium text-foreground bg-transparent border-none outline-none py-2 pr-4"
              />
              <button
                onClick={() => setShowCc(v => !v)}
                aria-label={showCc ? 'Hide CC field' : 'Show CC field'}
                aria-expanded={showCc}
                className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground px-2 flex-shrink-0 transition-colors"
              >
                CC
              </button>
              <button
                onClick={() => setShowBcc(v => !v)}
                aria-label={showBcc ? 'Hide BCC field' : 'Show BCC field'}
                aria-expanded={showBcc}
                className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground pr-3 pl-1 flex-shrink-0 transition-colors"
              >
                BCC
              </button>
            </div>

            {/* CC — toggleable, appears directly below To */}
            {showCc && (
              <div className="flex items-start min-h-[34px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[52px] flex-shrink-0 pl-5 pt-2">
                  CC
                </span>
                <ChipInput chips={ccList} onChange={setCcList} placeholder="Add CC…" />
              </div>
            )}

            {/* BCC — toggleable, appears below CC */}
            {showBcc && (
              <div className="flex items-start min-h-[34px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[52px] flex-shrink-0 pl-5 pt-2">
                  BCC
                </span>
                <ChipInput chips={bccList} onChange={setBccList} placeholder="Add BCC…" />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center min-h-[34px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[52px] flex-shrink-0 pl-5">
                Subj
              </span>
              <input
                value={customSubject}
                onChange={e => setCustomSubject(e.target.value)}
                aria-label="Email subject"
                className="flex-1 text-[12px] text-foreground/75 bg-transparent border-none outline-none py-2 pr-4"
              />
            </div>
          </div>

          {/* ── Editor ── */}
          <div className="px-5 pt-1">
            <RichEditor
              key={draftEditorKey}
              initialHtml={draftHtml}
              onChange={setDraftHtml}
              sigHtml={sigHtml}
              borderless
              placeholder={
                loading === 'gen'
                  ? 'Generating AI draft…'
                  : hasDraft
                    ? ''
                    : `Write your reply to ${lead.email ?? 'the client'}…`
              }
              minHeight={140}
            />
          </div>

          {/* ── Knowledge sources (RAG) ── */}
          {ragSources.length > 0 && (
            <div className="mx-4 mb-2 rounded-lg border border-[--border-subtle] overflow-hidden">
              <button
                onClick={() => setShowSources(v => !v)}
                aria-expanded={showSources}
                className="w-full flex items-center justify-between px-3.5 py-2 bg-muted/30 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  {ragSources.length} source{ragSources.length !== 1 ? 's' : ''} retrieved
                </span>
                <ChevronDown
                  size={11}
                  strokeWidth={2}
                  className={cn('text-muted-foreground/50 transition-transform', showSources && 'rotate-180')}
                />
              </button>
              {showSources && (
                <div className="divide-y divide-[--border-subtle]">
                  {ragSources.map((s, i) => (
                    <div key={i} className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium text-foreground/75">{s.file_name}</span>
                        <span className="text-[9.5px] font-bold text-[--success]">
                          {Math.round(s.similarity * 100)}%
                        </span>
                      </div>
                      <p className="text-[10.5px] text-muted-foreground/70 leading-relaxed line-clamp-2 m-0">
                        {s.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Footer: from/sig | generate | send ── */}
          <div className="flex items-center justify-between gap-3 px-4 py-3">

            {/* Left: from selector + sig indicator */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {senders.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    From
                  </span>
                  <select
                    value={selectedFrom}
                    onChange={e => setSelectedFrom(e.target.value)}
                    className="text-[11px] text-foreground border border-[--border-subtle] rounded-md px-2 py-[3px] bg-background cursor-pointer outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    {senders.map(s => (
                      <option key={s.email} value={s.email}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedSig && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                  <span className="truncate max-w-[90px]">
                    {selectedSig.name.split(' ')[0]}
                  </span>
                  <button
                    onClick={() => setSelectedSigId('')}
                    className="text-muted-foreground/35 hover:text-muted-foreground"
                  >
                    <X size={9} />
                  </button>
                </div>
              )}
            </div>

            {/* Right: error + generate + send */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {error && (
                <span className="text-[10.5px] text-[--error] max-w-[140px] truncate">{error}</span>
              )}

              {/* Generate AI Reply — subtle primary tint signals it's AI-powered */}
              <button
                onClick={generate}
                disabled={!!loading}
                className={cn(
                  'flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-lg',
                  'border border-primary/20 bg-primary/[.04] text-primary',
                  'hover:bg-primary/8 hover:border-primary/30 transition-colors',
                  loading && 'opacity-50 cursor-not-allowed',
                )}
              >
                {loading === 'gen'
                  ? <RefreshCw size={11} strokeWidth={2} className="animate-spin" />
                  : <Sparkles size={11} strokeWidth={2} />
                }
                {loading === 'gen' ? 'Generating…' : hasDraft ? 'Regenerate' : 'Generate AI reply'}
              </button>

              <Tip
                placement="left"
                text="Edit the draft then click Approve & Send. Every sent reply is automatically evaluated to improve future AI drafts."
              />

              {/* Human-in-the-loop indicator — AI drafts, human approves */}
              <span className="hidden xl:block text-[9px] text-muted-foreground/40 whitespace-nowrap">
                You approve every reply
              </span>

              {/* Approve & Send — primary CTA */}
              <button
                onClick={handleSend}
                disabled={!!loading || !canSend}
                className={cn(
                  'text-[12px] font-semibold px-5 py-2 rounded-lg',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  (loading || !canSend) && 'opacity-35 cursor-not-allowed',
                )}
              >
                {loading === 'send' ? 'Sending…' : 'Approve & Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Chip input ────────────────────────────────────────────────────────────────

function ChipInput({
  chips, onChange, placeholder,
}: { chips: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState('')

  function tryAdd(raw: string) {
    const val = raw.trim().toLowerCase().replace(/,$/, '')
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return
    if (!chips.includes(val)) onChange([...chips, val])
    setInput('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1 py-1.5 pr-3 flex-1 min-w-0">
      {chips.map(email => (
        <span
          key={email}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15"
        >
          {email}
          <button
            type="button"
            onClick={() => onChange(chips.filter(c => c !== email))}
            className="text-primary/50 hover:text-primary leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); tryAdd(input) }
          if (e.key === 'Backspace' && !input && chips.length) onChange(chips.slice(0, -1))
        }}
        onBlur={() => tryAdd(input)}
        placeholder={chips.length === 0 ? placeholder : ''}
        className="min-w-[100px] text-[12px] bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40"
      />
    </div>
  )
}
