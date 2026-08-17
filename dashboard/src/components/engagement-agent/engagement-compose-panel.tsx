'use client'

// Engagement Compose Panel — Phase 3
//
// ALL business logic, hooks, and API calls are preserved verbatim from
// ComposePanel.tsx. Only the visual shell (JSX structure + CSS classes)
// has been updated. If you need to add logic, do it here.

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, ChevronDown, Sparkles, Paperclip, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { createClient } from '@/lib/supabase/client'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, RagSource, SigOption, Sender } from '@/components/engagement/types'
import { fullName } from '@/components/engagement/helpers'
import { useAutocomplete, SuggestionList } from '@/components/engagement/RecipientAutocomplete'
import { InlineProgress, useFauxProgress } from '@/components/engagement/InlineProgress'

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
  replyAll?:         boolean
  onToggleReplyAll?: () => void
  storedDraft?:      string | null
  storedRagDraft?:   string | null
  storedRagSources?: RagSource[]
  onRagRefresh?:     () => void
  onThreadRefresh?:  () => void
  /** Run one AI-analysis pass (updates the AI Analysis tab + history) before drafting. */
  onAnalyze?:        () => Promise<void>
  pendingRestore?:   { body: string; generatedBy: string; stamp: number } | null
}

export function EngagementComposePanel({
  lead, thread, messages,
  toAddress, ccList, bccList, customSubject,
  setToAddress, setCcList, setBccList, setCustomSubject,
  replyAll, onToggleReplyAll,
  storedDraft, storedRagDraft, storedRagSources,
  onRagRefresh, onThreadRefresh, onAnalyze, pendingRestore,
}: EngagementComposePanelProps) {

  // ── All state preserved verbatim ──────────────────────────────────────────
  const [draftId,         setDraftId]         = useState<string | null>(null)
  const [draftHtml,       setDraftHtml]       = useState('')
  const [draftLoaded,     setDraftLoaded]     = useState(false)
  const [draftEditorKey,  setDraftEditorKey]  = useState(0)
  const [loading,         setLoading]         = useState<'gen' | 'send' | null>(null)
  const [genStep,         setGenStep]         = useState<'analyze' | 'draft' | null>(null)
  const [sent,            setSent]            = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [aiDraftChecked,  setAiDraftChecked]  = useState(false)
  const [showCc,          setShowCc]          = useState(ccList.length > 0)
  const [showBcc,         setShowBcc]         = useState(bccList.length > 0)
  // Gmail/Superhuman-style collapsed header: "To: name ▾" by default, expands to editable
  // To/Cc/Bcc fields on click. Starts collapsed — the recipient is virtually always
  // pre-filled from the thread/lead, so showing three stacked input rows up front is noise.
  const [headerExpanded,  setHeaderExpanded]  = useState(false)
  const [ragSources,      setRagSources]      = useState<RagSource[]>(storedRagSources ?? [])
  const [showSources,     setShowSources]     = useState(false)

  const [signatures,      setSignatures]      = useState<SigOption[]>([])
  const [selectedSigId,   setSelectedSigId]   = useState<string>('')
  const [senders,         setSenders]         = useState<Sender[]>([])
  const [selectedFrom,    setSelectedFrom]    = useState<string>('')
  const [sigsLoaded,      setSigsLoaded]      = useState(false)

  // ── Attachments: files to attach on this reply (local uploads + re-attached thread files) ──
  type Att = { filename: string; mime_type?: string; storage_url: string; size_bytes?: number }
  const [attachments,   setAttachments]   = useState<Att[]>([])
  const [threadFiles,   setThreadFiles]   = useState<Att[]>([])
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The AI/RAG draft as generated, captured before the human edits it — sent as originalAiBody
  // so the eval compares the true AI output vs the sent version (esp. for RAG-origin drafts).
  const aiOriginalRef = useRef<string>('')

  const log = useAuditLog()

  // Reveal the CC row whenever it gets populated (e.g. Reply All fills it after mount).
  useEffect(() => { if (ccList.length > 0) setShowCc(true) }, [ccList.length])

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
  const genPct      = useFauxProgress(loading === 'gen')   // determinate % for the progress bar

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
    setAttachments([]); setAttachMenuOpen(false)
    setHeaderExpanded(false)
    aiOriginalRef.current = ''
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the thread's stored files (for re-attaching) + clear selected attachments on switch.
  useEffect(() => {
    setAttachments([]); setAttachMenuOpen(false); setThreadFiles([])
    const tid = thread?.id
    if (!tid) return
    let ok = true
    fetch(`/api/nexus/rfq/attachments?thread_id=${encodeURIComponent(tid)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: Att[]) => { if (ok) setThreadFiles(Array.isArray(rows) ? rows : []) })
      .catch(() => {})
    return () => { ok = false }
  }, [thread?.id])

  async function uploadLocalFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const supabase = createClient()
      for (const file of Array.from(files)) {
        // 1. Get a signed upload URL, then 2. upload the file DIRECTLY to Supabase Storage
        //    (bypasses Vercel's ~4.5MB request-body limit — no size cap on our side).
        const uu = await fetch('/api/email/attachments/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        })
        const ud = await uu.json().catch(() => null) as { path?: string; token?: string; error?: string } | null
        if (!uu.ok || !ud?.path || !ud?.token) { setError(ud?.error ?? `Could not start upload for ${file.name}`); continue }

        const { error: upErr } = await supabase.storage
          .from('email-attachments')
          .uploadToSignedUrl(ud.path, ud.token, file, { contentType: file.type || 'application/octet-stream' })
        if (upErr) { setError(`Upload failed for ${file.name}: ${upErr.message}`); continue }

        const att: Att = { filename: file.name, mime_type: file.type || 'application/octet-stream', storage_url: ud.path }
        setAttachments(prev => prev.some(a => a.storage_url === att.storage_url) ? prev : [...prev, att])
      }
    } finally {
      setUploading(false)
      setAttachMenuOpen(false)   // collapse the "Upload from computer" menu once done
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  function toggleThreadFile(f: Att) {
    setAttachments(prev => prev.some(a => a.storage_url === f.storage_url)
      ? prev.filter(a => a.storage_url !== f.storage_url)
      : [...prev, f])
  }
  function removeAttachment(url: string) {
    setAttachments(prev => prev.filter(a => a.storage_url !== url))
  }

  useEffect(() => {
    if (!pendingRestore) return
    setDraftHtml(pendingRestore.body)
    aiOriginalRef.current = htmlToPlain(pendingRestore.body)
    setDraftLoaded(true)
    setDraftEditorKey(k => k + 1)
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
          aiOriginalRef.current = latest.body
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
      aiOriginalRef.current = storedDraft
      setDraftLoaded(true)
      setDraftEditorKey(k => k + 1)
    }
  }, [aiDraftChecked, draftLoaded, sent, storedDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!thread?.id || !aiDraftChecked || draftLoaded || messages.length === 0 || sent) return
    if (messages.at(-1)?.direction !== 'inbound') return
    generate({ analyze: false })   // auto-draft on open: draft only, no paid analysis pass
  }, [thread?.id, aiDraftChecked, draftLoaded, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (storedRagSources && !ragSources.length) {
      setRagSources(storedRagSources)
    }
  }, [storedRagSources]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── All handlers preserved verbatim ───────────────────────────────────────

  async function generate(opts?: { analyze?: boolean }) {
    const runAnalysis = opts?.analyze ?? true   // manual click analyses; auto-draft skips it
    setLoading('gen'); setError(null)
    try {
      // #3 — one AI-analysis pass first (updates AI Analysis tab + history), then draft.
      if (runAnalysis && onAnalyze && thread?.id) {
        setGenStep('analyze')
        try { await onAnalyze() } catch { /* draft anyway */ }
      }
      setGenStep('draft')
      const res = await fetch('/api/engagement/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Resolve the contact from the actual recipient in the To field — the lead
          // may have no email (e.g. an internal forwarded thread) even when To is set.
          leadId: lead.id, contactName: fullName(lead), contactEmail: toAddress.trim() || lead.email,
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
      aiOriginalRef.current = data.content
      setDraftEditorKey(k => k + 1)
      log({
        action: 'draft.generated', resource_type: 'thread',
        resource_id: thread?.id ?? lead.id, metadata: { contact: lead.email },
      })
    } catch { setError('Failed to generate draft') }
    finally { setLoading(null); setGenStep(null) }
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
            // Use the To field as the recipient — the lead may have no email even when a
            // valid address is typed in To (internal forwarded threads, ad-hoc replies).
            leadId: lead.id, contactName: fullName(lead), contactEmail: toAddress.trim() || lead.email,
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
          attachments:   attachments.length ? attachments : undefined,
          originalAiBody: aiOriginalRef.current.trim() || undefined,
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
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 rounded-t-xl border border-[--border-subtle] bg-card shadow-[0_-4px_24px_-8px_rgba(16,24,40,0.14)]">
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
    <div className="flex-shrink-0 flex flex-col h-full rounded-t-xl border border-[--border-subtle] bg-card shadow-[0_-4px_24px_-8px_rgba(16,24,40,0.14)] overflow-hidden">

      {/* ── Addressing header ── */}
      <div className="flex-shrink-0 border-b border-[--border-subtle]">

        {!headerExpanded ? (
          /* Collapsed summary line — Gmail/Superhuman style: "To: recipient ▾  Cc/Bcc" */
          <button
            type="button"
            onClick={() => setHeaderExpanded(true)}
            aria-expanded={false}
            className="w-full flex items-center gap-2.5 px-6 py-3.5 text-left hover:bg-muted/30 transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 flex-shrink-0">
              To
            </span>
            <span className="text-[12.5px] font-medium text-foreground truncate flex-1 min-w-0">
              {toAddress || <span className="text-muted-foreground/50 font-normal">Add recipient…</span>}
            </span>
            {(ccList.length > 0 || bccList.length > 0) && (
              <span className="text-[10.5px] text-muted-foreground/60 flex-shrink-0">
                {[ccList.length > 0 ? `Cc ${ccList.length}` : null, bccList.length > 0 ? `Bcc ${bccList.length}` : null]
                  .filter(Boolean).join(' · ')}
              </span>
            )}
            {!ccList.length && !bccList.length && (
              <span className="text-[10.5px] text-muted-foreground/45 flex-shrink-0">Cc/Bcc</span>
            )}
            <ChevronDown size={13} strokeWidth={2} className="text-muted-foreground/40 flex-shrink-0" />
          </button>
        ) : (
          <div className="pb-2 pt-1">

            {/* TO */}
            <div className="flex items-center min-h-[40px] px-6 gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[40px] flex-shrink-0">
                To
              </span>
              <ToAutocompleteInput value={toAddress} onChange={setToAddress} placeholder="Type a name or email…" />
              {onToggleReplyAll && (
                <button
                  onClick={onToggleReplyAll}
                  title={replyAll ? 'Replying to everyone — click for sender only' : 'Replying to sender only — click to Reply All'}
                  aria-pressed={replyAll}
                  className={cn(
                    'text-[10px] font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors',
                    replyAll ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted',
                  )}
                >
                  {replyAll ? 'Reply all ✓' : 'Reply all'}
                </button>
              )}
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  aria-label="Show CC field"
                  className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted rounded px-2 py-1 flex-shrink-0 transition-colors"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  onClick={() => setShowBcc(true)}
                  aria-label="Show BCC field"
                  className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted rounded px-2 py-1 flex-shrink-0 transition-colors"
                >
                  Bcc
                </button>
              )}
              <button
                onClick={() => setHeaderExpanded(false)}
                title="Collapse address fields"
                aria-label="Collapse address fields"
                className="text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted rounded p-1 flex-shrink-0 transition-colors"
              >
                <ChevronDown size={13} strokeWidth={2} className="rotate-180" />
              </button>
            </div>

            {/* CC — toggleable, appears directly below To */}
            {showCc && (
              <div className="flex items-start min-h-[36px] px-6 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[40px] flex-shrink-0 pt-2">
                  Cc
                </span>
                <ChipInput chips={ccList} onChange={setCcList} placeholder="Add CC…" />
                <button
                  onClick={() => { setShowCc(false); setCcList([]) }}
                  aria-label="Hide CC field"
                  className="text-muted-foreground/40 hover:text-muted-foreground p-1 mt-1 flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* BCC — toggleable, appears below CC */}
            {showBcc && (
              <div className="flex items-start min-h-[36px] px-6 gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[40px] flex-shrink-0 pt-2">
                  Bcc
                </span>
                <ChipInput chips={bccList} onChange={setBccList} placeholder="Add BCC…" />
                <button
                  onClick={() => { setShowBcc(false); setBccList([]) }}
                  aria-label="Hide BCC field"
                  className="text-muted-foreground/40 hover:text-muted-foreground p-1 mt-1 flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Subject — always visible, compact */}
        <div className="flex items-center min-h-[38px] px-6 border-t border-[--border-subtle]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55 w-[40px] flex-shrink-0">
            Subj
          </span>
          <input
            value={customSubject}
            onChange={e => setCustomSubject(e.target.value)}
            aria-label="Email subject"
            className="flex-1 text-[12px] text-foreground/75 bg-transparent border-none outline-none py-2"
          />
        </div>
      </div>

      {(
        <>
          {/* ── Editor ── */}
          <div className="px-6 py-3 flex-1 min-h-0 overflow-y-auto">
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
              minHeight={200}
              onAttachClick={() => fileInputRef.current?.click()}
            />
          </div>

          {/* ── Knowledge sources (RAG) ── */}
          {ragSources.length > 0 && (
            <div className="mx-6 mb-2 rounded-lg border border-[--border-subtle] overflow-hidden">
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

          {/* ── Attachments (local upload + re-attach thread files) ── */}
          <div className="px-6 pb-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {attachments.map(a => (
                  <span key={a.storage_url} className="inline-flex items-center gap-1 text-[10.5px] bg-muted/60 border border-[--border-subtle] rounded-md pl-2 pr-1 py-[3px]">
                    <Paperclip size={9} className="text-muted-foreground/60" />
                    <span className="max-w-[160px] truncate text-foreground/75">{a.filename}</span>
                    <button onClick={() => removeAttachment(a.storage_url)} aria-label={`Remove ${a.filename}`} className="text-muted-foreground/50 hover:text-foreground">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative inline-block">
              <button
                onClick={() => setAttachMenuOpen(v => !v)}
                className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <Paperclip size={11} /> {uploading ? 'Uploading…' : 'Attach'}
              </button>

              {attachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 z-30 w-64 rounded-lg border border-[--border-subtle] bg-card p-1 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.28)]">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[11.5px] text-foreground/85 hover:bg-muted/60 flex items-center gap-1.5"
                  >
                    <Upload size={11} /> Upload from computer
                  </button>
                  {threadFiles.length > 0 && (
                    <>
                      <div className="px-2.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">From this thread</div>
                      {threadFiles.map(f => {
                        const on = attachments.some(a => a.storage_url === f.storage_url)
                        return (
                          <button
                            key={f.storage_url}
                            onClick={() => toggleThreadFile(f)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md text-[11.5px] hover:bg-muted/60 flex items-center gap-1.5"
                          >
                            <span className={cn('w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 text-[8px]', on ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')}>{on ? '✓' : ''}</span>
                            <span className="truncate text-foreground/80">{f.filename}</span>
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              )}

              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => uploadLocalFiles(e.target.files)} />
            </div>
          </div>

          {/* ── Footer: from/sig | generate | send ── */}
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3.5 border-t border-[--border-subtle] bg-muted/20">

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

              {signatures.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    Sig
                  </span>
                  <select
                    value={selectedSigId}
                    onChange={e => setSelectedSigId(e.target.value)}
                    className="text-[11px] text-foreground border border-[--border-subtle] rounded-md px-2 py-[3px] bg-background cursor-pointer outline-none focus:ring-1 focus:ring-primary/30 max-w-[150px]"
                  >
                    <option value="">No signature</option>
                    {signatures.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Right: error + generate + send */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {error && (
                <span title={error} className="text-[10.5px] text-[--error] max-w-[220px] truncate cursor-help">{error}</span>
              )}

              {/* Generate AI Reply — secondary: subtle outline, no fill */}
              <button
                onClick={() => generate()}
                disabled={!!loading}
                className={cn(
                  'flex items-center gap-1.5 text-[11.5px] font-medium px-3.5 h-9 rounded-lg',
                  'border border-primary/20 bg-primary/[.04] text-primary',
                  'hover:bg-primary/8 hover:border-primary/30 transition-colors',
                  loading && 'opacity-50 cursor-not-allowed',
                )}
              >
                {loading === 'gen'
                  ? <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                  : <Sparkles size={12} strokeWidth={2} />
                }
                {loading === 'gen'
                  ? (genStep === 'analyze' ? 'Analysing…' : 'Drafting…')
                  : hasDraft ? 'Regenerate' : 'Generate AI reply'}
              </button>

              {/* Approve & Send — the one primary CTA, visually heaviest control in the panel */}
              <button
                onClick={handleSend}
                disabled={!!loading || !canSend}
                className={cn(
                  'text-[12.5px] font-semibold px-6 h-9 rounded-lg shadow-sm',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  (loading || !canSend) && 'opacity-35 cursor-not-allowed',
                )}
              >
                {loading === 'send' ? 'Sending…' : 'Approve & Send'}
              </button>
            </div>
          </div>

          {/* Progress bar under the buttons while a reply is being generated (#3) */}
          {loading === 'gen' && (
            <div className="flex-shrink-0 px-6 pb-3 -mt-1">
              <InlineProgress value={genPct} label={genStep === 'analyze' ? 'Analysing thread…' : 'Drafting reply…'} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── To field with recipient autocomplete (#2) ──────────────────────────────────

function ToAutocompleteInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ac = useAutocomplete(value, c => onChange(c.email))
  return (
    <div ref={ac.boxRef} className="relative flex-1">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); ac.reopen() }}
        onKeyDown={e => ac.onKeyDown(e)}
        onFocus={ac.reopen}
        onBlur={ac.close}
        placeholder={placeholder}
        aria-label="Recipient email address"
        autoComplete="off"
        className="w-full text-[12.5px] font-medium text-foreground bg-transparent border-none outline-none focus-visible:outline-none py-2 pr-4"
      />
      {ac.visible && <SuggestionList items={ac.items} highlight={ac.highlight} onPick={c => { onChange(c.email); ac.close() }} />}
    </div>
  )
}

// ── Chip input (CC / BCC) with the same recipient autocomplete ──────────────────

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

  function pick(email: string) {
    const val = email.trim().toLowerCase()
    if (val && !chips.includes(val)) onChange([...chips, val])
    setInput('')
  }

  const ac = useAutocomplete(input, c => pick(c.email))

  return (
    <div ref={ac.boxRef} className="relative flex flex-wrap items-center gap-1 py-1.5 pr-3 flex-1 min-w-0">
      {chips.map(email => (
        <span
          key={email}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-[6px] bg-primary/8 text-primary border border-primary/15"
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
        onChange={e => { setInput(e.target.value); ac.reopen() }}
        onKeyDown={e => {
          if (ac.onKeyDown(e)) return
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); tryAdd(input) }
          if (e.key === 'Backspace' && !input && chips.length) onChange(chips.slice(0, -1))
        }}
        onFocus={ac.reopen}
        onBlur={() => { ac.close(); tryAdd(input) }}
        placeholder={chips.length === 0 ? placeholder : ''}
        autoComplete="off"
        className="min-w-[100px] text-[12px] bg-transparent border-none outline-none focus-visible:outline-none text-foreground placeholder:text-muted-foreground/40"
      />
      {ac.visible && <SuggestionList items={ac.items} highlight={ac.highlight} onPick={c => pick(c.email)} />}
    </div>
  )
}
