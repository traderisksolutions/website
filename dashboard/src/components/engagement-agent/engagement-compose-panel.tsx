'use client'

// Engagement Compose Panel — the reply editor rendered in the reader's foot by ThreadView.
//
// ALL business logic, hooks, and API calls are preserved verbatim from the previous shell
// (draft load/generate/send, attachments, signatures, senders, pendingRestore, resize hook).
// Only the presentation is rebuilt, to the approved mail-workspace mock: everything sits on the
// 1040 measure — top bar, To/Cc/Bcc/Subject rows, the grouped toolbar, the editor, the footer.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Paperclip, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { createClient } from '@/lib/supabase/client'
import { useAuditLog } from '@/hooks/useAuditLog'
import type { Lead, RealMsg, RagSource, SigOption, Sender } from '@/components/engagement/types'
import { fullName } from '@/components/engagement/helpers'
import { useAutocomplete, SuggestionList } from '@/components/engagement/RecipientAutocomplete'
import { InlineProgress, useFauxProgress } from '@/components/engagement/InlineProgress'
import { useResizableComposerHeight } from '@/hooks/useResizableComposerHeight'
import {
  TbGroup, TbButton, TbMenu, TbMenuItem, TbMenuLabel, FieldRow, RecipientChip, QuietSelect, AttachmentChip,
  BTN_PRIMARY, BTN_TERTIARY, INK, BODY, MUTED, FAINT,
} from '@/components/engagement-agent/compose-toolbar'

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
  /** Folds the composer back to one line (rendered by the thread view). */
  onMinimise?:       () => void
  /** Fires when the editor is resized, so the thread view can re-measure its scroll affordances. */
  onHeightChange?:   () => void
}

export function EngagementComposePanel({
  lead, thread, messages,
  toAddress, ccList, bccList, customSubject,
  setToAddress, setCcList, setBccList, setCustomSubject,
  replyAll, onToggleReplyAll,
  storedDraft, storedRagDraft, storedRagSources,
  onRagRefresh, onThreadRefresh, onAnalyze, pendingRestore, onMinimise, onHeightChange,
}: EngagementComposePanelProps) {

  // ── All state preserved verbatim ──────────────────────────────────────────
  const [draftId,         setDraftId]         = useState<string | null>(null)
  const [draftHtml,       setDraftHtml]       = useState('')
  // What the draft route actually drew on from the customer profile (policies/history/notes) —
  // built deterministically server-side, never LLM-self-reported — shown so staff can verify a
  // draft rather than blindly trust or ignore it.
  const [contextUsed,     setContextUsed]     = useState<string[]>([])
  const [draftLoaded,     setDraftLoaded]     = useState(false)
  const [draftEditorKey,  setDraftEditorKey]  = useState(0)
  const [loading,         setLoading]         = useState<'gen' | 'send' | null>(null)
  const [sent,            setSent]            = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [errorOpen,       setErrorOpen]       = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const [aiDraftChecked,  setAiDraftChecked]  = useState(false)
  const [showCc,          setShowCc]          = useState(ccList.length > 0)
  const [showBcc,         setShowBcc]         = useState(bccList.length > 0)
  // The To row shows the recipient as a chip; clicking it opens the editable field. Starts
  // collapsed — the recipient is virtually always pre-filled from the thread/lead.
  const [headerExpanded,  setHeaderExpanded]  = useState(false)
  const [ragSources,      setRagSources]      = useState<RagSource[]>(storedRagSources ?? [])
  const [showSources,     setShowSources]     = useState(false)
  // Full screen: the panel takes the whole reader column (ThreadView's EaWorkspaceColumn is the
  // positioned ancestor), the editor body flexes to fill it. Esc leaves.
  const [fullscreen,      setFullscreen]      = useState(false)
  // A phone pane is shorter than the panel's own chrome, so the anchored layout has nothing left
  // to show. Open full-pane there instead; Minimise and Escape still fold it away.
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 640) setFullscreen(true) }, [])

  // Editor height — drag-resizable via the handle below it, persisted across the session.
  const { height: editorHeight, min: editorMin, max: editorMax, step: editorStep, startDrag: startEditorDrag, nudge: nudgeEditor, setAbsolute: setEditorHeight } = useResizableComposerHeight()
  // The thread view sizes its "Draft" affordance off this panel's height.
  useEffect(() => { onHeightChange?.() }, [editorHeight, fullscreen]) // eslint-disable-line react-hooks/exhaustive-deps
  // The editor fits its content, within the drag limits — unless somebody has dragged it, in
  // which case their height is left alone.
  //
  // It used to only ever grow, and the height is persisted to localStorage, so one long draft
  // stretched the editor and every thread opened afterwards kept that height. A two-paragraph
  // reply then sat at the top of a tall empty box with a hundred-odd pixels of nothing under it,
  // for the rest of that browser profile's life.
  const editorHeightRef = useRef(editorHeight)
  editorHeightRef.current = editorHeight
  const userResizedRef = useRef(false)
  const onEditorContentHeight = useCallback((contentH: number) => {
    const needed = Math.max(editorMin, Math.min(editorMax, contentH + 8))   // a little slack under the caret
    if (userResizedRef.current) {
      // A deliberate height is never fought; the editor may still grow past it as they type.
      if (needed > editorHeightRef.current) setEditorHeight(needed)
      return
    }
    if (needed !== editorHeightRef.current) setEditorHeight(needed)
  }, [editorMin, editorMax, setEditorHeight])

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

  // Close the expanded error detail on an outside click.
  useEffect(() => {
    if (!errorOpen) return
    const h = (e: MouseEvent) => {
      if (errorRef.current && !errorRef.current.contains(e.target as Node)) setErrorOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [errorOpen])

  // Collapse the error detail whenever the error itself changes or clears.
  useEffect(() => { setErrorOpen(false) }, [error])

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
    setDraftEditorKey(0); setSent(false); setError(null); setContextUsed([])
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
      setAttachMenuOpen(false)   // collapse the attach menu once done
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

  // Drafting no longer happens on open. It used to fire whenever the composer was opened on a
  // thread whose last message was inbound, which spent a model call every time somebody opened
  // a reply box to read it. "Generate response" in the bar above is a deliberate click, and it
  // reads far more (the company record and every other thread), so doing it unasked is both
  // dearer and less likely to be wanted.

  useEffect(() => {
    if (storedRagSources && !ragSources.length) {
      setRagSources(storedRagSources)
    }
  }, [storedRagSources]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── All handlers preserved verbatim ───────────────────────────────────────

  // generate() lived here and called /api/engagement/draft. Drafting moved to the
  // "Generate response" control above this composer, which runs the client-relationship
  // agent over the whole company file and writes its result in through pendingRestore.

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

  const contactName = fullName(lead)
  const toName = toAddress && lead.email && toAddress.trim().toLowerCase() === lead.email.toLowerCase() && contactName ? contactName : toAddress
  const selectedSender = senders.find(s => s.email === selectedFrom)

  // ── Sent state ─────────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="w-full max-w-[1040px] mx-auto flex items-center justify-between gap-3 px-6 lg:px-10 h-12" style={{ color: INK }}>
        <span className="text-[14px] font-medium">Reply sent</span>
        <button
          type="button"
          onClick={() => { setSent(false); setDraftHtml(''); setDraftId(null); setContextUsed([]) }}
          className={BTN_TERTIARY}
        >
          Compose another
        </button>
      </div>
    )
  }

  // ── Compose shell ──────────────────────────────────────────────────────────
  return (
    <div
      className={cn('flex flex-col bg-white', fullscreen && 'absolute inset-0 z-20 overflow-hidden')}
      onKeyDown={e => {
        // Esc leaves full screen. It does not minimise: minimising unmounts the panel and the
        // reply edits with it, which is too costly for a key that is easy to hit by accident.
        if (e.key === 'Escape' && fullscreen && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setFullscreen(false) }
      }}
      aria-label="Reply"
    >
      <div className={cn('w-full max-w-[1040px] mx-auto flex flex-col min-h-0 [--re-gutter:24px] lg:[--re-gutter:40px]', fullscreen && 'flex-1')}>

        {/* ── Top bar: Reply · save state · spacer · Minimise ── */}
        <div className="flex items-center gap-2.5 px-[var(--re-gutter)] h-12 flex-shrink-0">
          <h3 className="m-0 text-[15px] font-medium" style={{ color: INK }}>Reply</h3>
          {/* No draft autosave exists in this panel — drafts are written on send — so no "Saved" state is shown. */}
          <span className="flex-1" />
          {onMinimise && (
            <button type="button" onClick={onMinimise} title="Minimise" aria-label="Minimise the reply" className={cn(BTN_TERTIARY, 'h-8 px-2.5')}>
              Minimise
            </button>
          )}
        </div>

        {/* ── To ── */}
        <FieldRow label="To" tall htmlFor="compose-to" right={
          <>
            {onToggleReplyAll && (
              <button
                type="button"
                onClick={onToggleReplyAll}
                aria-pressed={replyAll}
                title={replyAll ? 'Replying to everyone. Click to reply to the sender only' : 'Replying to the sender only. Click to reply to everyone'}
                className={cn('h-7 px-2 rounded-[6px] bg-transparent border-0 cursor-pointer text-[12.5px] hover:bg-[#f1f3f4]', replyAll && 'bg-[#f1f3f4] font-medium')}
                style={{ color: replyAll ? INK : FAINT }}
              >
                Reply all
              </button>
            )}
            {!showCc && <button type="button" onClick={() => setShowCc(true)} aria-label="Add Cc" className="h-7 px-1.5 rounded-[6px] bg-transparent border-0 cursor-pointer text-[12.5px] hover:bg-[#f1f3f4]" style={{ color: FAINT }}>Cc</button>}
            {!showCc && !showBcc && <span aria-hidden>·</span>}
            {!showBcc && <button type="button" onClick={() => setShowBcc(true)} aria-label="Add Bcc" className="h-7 px-1.5 rounded-[6px] bg-transparent border-0 cursor-pointer text-[12.5px] hover:bg-[#f1f3f4]" style={{ color: FAINT }}>Bcc</button>}
          </>
        }>
          {headerExpanded || !toAddress ? (
            <ToAutocompleteInput id="compose-to" value={toAddress} onChange={setToAddress} placeholder="Type a name or email…"
              onDone={() => { if (toAddress.trim()) setHeaderExpanded(false) }} autoFocus={headerExpanded} />
          ) : (
            <RecipientChip name={toName} email={toAddress} onClick={() => setHeaderExpanded(true)} title={`${toAddress} · click to change`} />
          )}
        </FieldRow>

        {/* ── Cc / Bcc — revealed from the To row ── */}
        {showCc && (
          <FieldRow label="Cc" tall right={
            <button type="button" onClick={() => { setShowCc(false); setCcList([]) }} aria-label="Remove Cc" title="Remove Cc" className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
          }>
            <ChipInput chips={ccList} onChange={setCcList} placeholder="Add Cc…" />
          </FieldRow>
        )}
        {showBcc && (
          <FieldRow label="Bcc" tall right={
            <button type="button" onClick={() => { setShowBcc(false); setBccList([]) }} aria-label="Remove Bcc" title="Remove Bcc" className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><X size={13} /></button>
          }>
            <ChipInput chips={bccList} onChange={setBccList} placeholder="Add Bcc…" />
          </FieldRow>
        )}

        {/* ── Subject · From · Signature ── */}
        <FieldRow label="Subject" htmlFor="compose-subject" right={
          (senders.length > 0 || signatures.length > 0) ? (
            <>
              {senders.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span>From</span>
                  <QuietSelect label="From" value={selectedFrom} onChange={setSelectedFrom}>
                    {senders.map(s => <option key={s.email} value={s.email}>{s.label}</option>)}
                  </QuietSelect>
                </span>
              )}
              {senders.length > 0 && signatures.length > 0 && <span aria-hidden>·</span>}
              {signatures.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span>Signature:</span>
                  <QuietSelect label="Signature" value={selectedSigId} onChange={setSelectedSigId}>
                    <option value="">None</option>
                    {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </QuietSelect>
                </span>
              )}
            </>
          ) : undefined
        }>
          <input
            id="compose-subject"
            value={customSubject}
            onChange={e => setCustomSubject(e.target.value)}
            aria-label="Email subject"
            placeholder="Subject"
            className="w-full text-[14px] bg-transparent border-none outline-none py-1 placeholder:text-[#80868b]"
            style={{ color: INK }}
          />
        </FieldRow>

        {/* Why this draft looks the way it does — deterministic, not LLM-self-reported (see
            api/engagement/draft/route.ts) — so staff can verify rather than trust blindly. */}
        {hasDraft && contextUsed.length > 0 && (
          <div className="px-[var(--re-gutter)] pt-2 flex flex-wrap items-center gap-1.5 flex-shrink-0">
            <span className="text-[12.5px] mr-0.5" style={{ color: MUTED }}>Drafted from</span>
            {contextUsed.map((c, i) => (
              <span key={i} className="text-[11.5px] font-medium px-2 py-0.5 rounded-[6px] bg-[#f1f3f4]" style={{ color: BODY }}>{c}</span>
            ))}
          </div>
        )}

        {/* ── Toolbar + editor. Outside full screen the body is a fixed, drag-resizable box (the
             handle below); in full screen it flexes to fill the reader. ── */}
        <RichEditor
          key={draftEditorKey}
          initialHtml={draftHtml}
          onChange={setDraftHtml}
          sigHtml={sigHtml}
          borderless
          variant="reading"
          placeholder={hasDraft ? '' : `Write your reply to ${contactName || lead.email || 'the client'}…`}
          minHeight={140}
          onContentHeightChange={onEditorContentHeight}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(v => !v)}
          className={cn('min-h-0', fullscreen && 'flex-1')}
          bodyClassName={cn('overflow-y-auto', fullscreen && 'flex-1 min-h-0')}
          bodyStyle={fullscreen ? undefined : { height: 'var(--engagement-composer-h, 180px)' }}
          toolbarExtras={
            <>
              <TbGroup label="Attach">
                <TbMenu label={uploading ? 'Uploading…' : 'Attach files'} open={attachMenuOpen} onOpenChange={setAttachMenuOpen} caret={threadFiles.length > 0} width={260}
                  trigger={<><Paperclip size={15} /> {uploading ? 'Uploading…' : 'Attach'}</>}>
                  {close => (
                    <>
                      <TbMenuItem onSelect={() => { fileInputRef.current?.click(); close() }}>Upload from computer</TbMenuItem>
                      {threadFiles.length > 0 && (
                        <>
                          <TbMenuLabel>From this thread</TbMenuLabel>
                          {threadFiles.map(f => {
                            const on = attachments.some(a => a.storage_url === f.storage_url)
                            return <TbMenuItem key={f.storage_url} active={on} onSelect={() => toggleThreadFile(f)}>{f.filename}</TbMenuItem>
                          })}
                        </>
                      )}
                    </>
                  )}
                </TbMenu>
              </TbGroup>
              {/* No house-template picker exists in this panel yet, so there is no Template menu. */}
              {/* The Assist menu's "Generate AI reply" lived here. Drafting is now one control,
                  "Generate response", in the bar above this composer — it reads the company
                  record and the client's other threads, not just this one, and writes the result
                  straight into this editor. Two buttons that both produced a draft, from
                  different amounts of context, was the thing worth removing. */}
            </>
          }
        />

        {/* ── Editor resize handle (not in full screen) ── */}
        {!fullscreen && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the reply editor"
            aria-valuenow={editorHeight}
            aria-valuemin={editorMin}
            aria-valuemax={editorMax}
            tabIndex={0}
            onPointerDown={e => { e.preventDefault(); userResizedRef.current = true; startEditorDrag(e.clientY, editorHeight) }}
            onKeyDown={e => {
              if (e.key === 'ArrowUp')        { e.preventDefault(); userResizedRef.current = true; nudgeEditor(-editorStep) }
              else if (e.key === 'ArrowDown') { e.preventDefault(); userResizedRef.current = true; nudgeEditor(editorStep) }
              else if (e.key === 'Home')      { e.preventDefault(); userResizedRef.current = true; setEditorHeight(editorMin) }
              else if (e.key === 'End')       { e.preventDefault(); userResizedRef.current = true; setEditorHeight(editorMax) }
            }}
            className="h-2 cursor-row-resize flex items-center justify-center group focus-visible:outline-none flex-shrink-0"
          >
            <div className="w-10 h-px bg-[#e8eaed] group-hover:bg-[#9aa0a6] group-hover:h-0.5 group-focus-visible:bg-[#202124] group-focus-visible:h-0.5 transition-all" />
          </div>
        )}

        {/* ── Knowledge sources (RAG) ── */}
        {ragSources.length > 0 && (
          <div className="mx-[var(--re-gutter)] mb-2 rounded-[10px] border border-[#e8eaed] overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowSources(v => !v)}
              aria-expanded={showSources}
              className="w-full flex items-center justify-between px-3.5 h-9 bg-white text-left border-0 cursor-pointer hover:bg-[#f8f9fa]"
            >
              <span className="text-[12.5px]" style={{ color: MUTED }}>
                {ragSources.length} source{ragSources.length !== 1 ? 's' : ''} retrieved
              </span>
              <ChevronDown size={13} strokeWidth={2} className={cn('transition-transform', showSources && 'rotate-180')} style={{ color: '#9aa0a6' }} />
            </button>
            {showSources && (
              <div className="divide-y divide-[#e8eaed] border-t border-[#e8eaed]">
                {ragSources.map((s, i) => (
                  <div key={i} className="px-3.5 py-2.5">
                    <div className="flex items-center justify-between mb-1 gap-3">
                      <span className="text-[13px] font-medium truncate" style={{ color: INK }}>{s.file_name}</span>
                      <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>{Math.round(s.similarity * 100)}%</span>
                    </div>
                    <p className="text-[12.5px] leading-relaxed line-clamp-2 m-0" style={{ color: MUTED }}>{s.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Attachments tray ── */}
        {attachments.length > 0 && (
          <div className="px-[var(--re-gutter)] pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {attachments.map(a => <AttachmentChip key={a.storage_url} name={a.filename} onRemove={() => removeAttachment(a.storage_url)} />)}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => uploadLocalFiles(e.target.files)} aria-hidden tabIndex={-1} />

        {/* ── Footer: note or error · spacer · Approve & Send ── */}
        <div className="flex items-center gap-2 px-[var(--re-gutter)] pt-2 pb-4 flex-shrink-0">
          {error ? (
            <div className="relative min-w-0" ref={errorRef}>
              <button
                type="button"
                onClick={() => setErrorOpen(v => !v)}
                title="Show the full error"
                aria-expanded={errorOpen}
                className="text-[12.5px] max-w-[360px] truncate cursor-pointer bg-transparent border-0 p-0 text-left underline decoration-dotted underline-offset-2"
                style={{ color: BODY }}
              >
                {error}
              </button>
              {errorOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-[380px] max-w-[80vw] max-h-[260px] overflow-auto rounded-[10px] border border-[#e8eaed] bg-white p-3 shadow-[0_8px_24px_rgba(32,33,36,0.12)]">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12px]" style={{ color: MUTED }}>Error detail</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => navigator.clipboard?.writeText(error)} className="text-[12px] font-medium bg-transparent border-0 p-0 cursor-pointer hover:underline" style={{ color: INK }}>Copy</button>
                      <button type="button" onClick={() => setErrorOpen(false)} aria-label="Close error detail" className="bg-transparent border-0 p-0 cursor-pointer" style={{ color: MUTED }}><X size={12} strokeWidth={2} /></button>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[12.5px]" style={{ color: BODY }}>{error}</div>
                </div>
              )}
            </div>
          ) : (
            <span className="text-[12.5px] truncate" style={{ color: FAINT }}>Signature and quoted message are added on send</span>
          )}
          <span className="flex-1" />
          {/* Approve & Send — the one filled primary in the panel */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!!loading || !canSend}
            className={BTN_PRIMARY}
          >
            {loading === 'send' ? 'Sending…' : 'Approve & Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── To field with recipient autocomplete (#2) ──────────────────────────────────

function ToAutocompleteInput({
  value, onChange, placeholder, onDone, autoFocus, id,
}: { value: string; onChange: (v: string) => void; placeholder: string; onDone?: () => void; autoFocus?: boolean; id?: string }) {
  const ac = useAutocomplete(value, c => onChange(c.email))
  return (
    <div ref={ac.boxRef} className="relative flex-1 min-w-[160px]">
      <input
        id={id}
        value={value}
        onChange={e => { onChange(e.target.value); ac.reopen() }}
        onKeyDown={e => {
          if (ac.onKeyDown(e)) { e.stopPropagation(); return }
          if (e.key === 'Enter') { e.preventDefault(); onDone?.() }
        }}
        onFocus={ac.reopen}
        onBlur={() => { ac.close(); onDone?.() }}
        placeholder={placeholder}
        aria-label="Recipient email address"
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full text-[14px] bg-transparent border-none outline-none focus-visible:outline-none py-1 pr-4 placeholder:text-[#80868b]"
        style={{ color: INK }}
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
    <div ref={ac.boxRef} className="relative flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
      {chips.map(email => (
        <RecipientChip key={email} name={email} email={email} onRemove={() => onChange(chips.filter(c => c !== email))} />
      ))}
      <input
        value={input}
        onChange={e => { setInput(e.target.value); ac.reopen() }}
        onKeyDown={e => {
          if (ac.onKeyDown(e)) { e.stopPropagation(); return }
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); tryAdd(input) }
          if (e.key === 'Backspace' && !input && chips.length) onChange(chips.slice(0, -1))
        }}
        onFocus={ac.reopen}
        onBlur={() => { ac.close(); tryAdd(input) }}
        placeholder={chips.length === 0 ? placeholder : ''}
        aria-label={placeholder}
        autoComplete="off"
        className="min-w-[120px] flex-1 text-[14px] bg-transparent border-none outline-none focus-visible:outline-none py-1 placeholder:text-[#80868b]"
        style={{ color: INK }}
      />
      {ac.visible && <SuggestionList items={ac.items} highlight={ac.highlight} onPick={c => pick(c.email)} />}
    </div>
  )
}
