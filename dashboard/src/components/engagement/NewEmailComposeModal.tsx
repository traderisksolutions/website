'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { useAutocomplete, SuggestionList } from '@/components/engagement/RecipientAutocomplete'
import {
  FieldRow, RecipientChip, QuietSelect, AttachmentChip, externalDomain,
  BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, INK, BODY, FAINT,
} from '@/components/engagement-agent/compose-toolbar'

/**
 * Standalone "new email" composer for a recipient with no existing thread — so a
 * Nexus next-step's "Draft in Engagement" always lands in Engagement (compose
 * only; the thread is created on send). Server appends the signature (signatureId).
 *
 * Presentation: the approved "New email" dialog — centred, 880 wide, To/Cc/Subject rows, the
 * same grouped toolbar and Quill editor as the reply panel, Save draft · Send in the footer.
 * Data flow unchanged: drafts are still stored as plain text (the drafts list previews `body`
 * as text), so the editor's HTML is flattened on save and re-expanded on reopen; the send
 * carries the editor's HTML as-is.
 */

type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }

export type EmailAttachmentRef = { filename: string; mime_type?: string; storage_url: string }
export type NewEmailDraft = {
  toEmail: string; toName?: string; cc?: string; subject: string; body: string; attachment?: EmailAttachmentRef
  /** When set (e.g. sending a debit note), whatever address ends up in To/Cc at send time gets
   *  saved/linked to this company in Active Contacts — best-effort, never blocks the send. */
  companyId?: string
  /** Set when reopening a previously saved draft (see /api/engagement/drafts) — "Save as draft"
   *  updates this same row instead of creating a duplicate, and it's cleaned up once actually sent. */
  draftId?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Cc is kept as the comma-separated string the API stores. These split it into committed
 *  chips (every token before the last comma) and the token still being typed. */
function splitCc(cc: string): { chips: string[]; current: string } {
  const tokens = cc.split(',')
  const current = tokens.length > 0 ? tokens[tokens.length - 1] : ''
  const chips = tokens.slice(0, -1).map(t => t.trim()).filter(Boolean)
  return { chips, current: current.replace(/^\s+/, '') }
}
function joinCc(chips: string[], current: string): string {
  return chips.length ? `${chips.join(', ')}, ${current}` : current
}

export function NewEmailComposeModal({ initial, onClose, onSent }: {
  initial: NewEmailDraft
  onClose: () => void
  onSent?: (threadId: string | null) => void
}) {
  const [to,       setTo]       = useState(initial.toEmail)
  const [cc,       setCc]       = useState(initial.cc ?? '')
  const [subject,  setSubject]  = useState(initial.subject)
  // The editor works in HTML. A reopened draft (plain text) is expanded; an HTML body is kept.
  const [bodyHtml, setBodyHtml] = useState(() => initial.body.trim().startsWith('<') ? initial.body : plainToHtml(initial.body))
  const [senders,  setSenders]  = useState<Sender[]>([])
  const [sigs,     setSigs]     = useState<SigOption[]>([])
  const [fromEmail, setFromEmail] = useState('')
  const [sigId,    setSigId]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftId,  setDraftId]  = useState(initial.draftId)
  const [draftSaved, setDraftSaved] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showCc,   setShowCc]   = useState(!!(initial.cc ?? '').trim())
  const [fullscreen, setFullscreen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Recipient typeahead — same source as the reply editor (contacts + employees).
  const toAc = useAutocomplete(to, c => setTo(c.email))
  // CC is a comma-separated list — the typeahead matches the token currently being typed
  // and appends the picked address.
  const { chips: ccChips, current: ccQuery } = splitCc(cc)
  const ccAc = useAutocomplete(ccQuery, c => {
    setCc([...ccChips, c.email].join(', ') + ', ')
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/email/available-senders', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/signatures', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([snd, sg]) => {
      const s = Array.isArray(snd) ? snd : []; setSenders(s); if (s[0]) setFromEmail(s[0].email)
      const g = Array.isArray(sg) ? sg : [];   setSigs(g);   if (g[0]) setSigId(g[0].id)
    })
  }, [])

  const personal = senders.find(s => s.email === fromEmail)?.type === 'personal'
  const body = htmlToPlain(bodyHtml)

  async function saveAsDraft() {
    if (!to.trim()) { setError('A recipient is required to save a draft.'); return }
    setSavingDraft(true); setError(null); setDraftSaved(false)
    try {
      const res = await fetch('/api/engagement/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, toEmail: to.trim(), toName: initial.toName, cc, subject, body, attachment: initial.attachment, companyId: initial.companyId }),
      })
      const data = await res.json()
      if (!res.ok || !data.id) throw new Error(data.error || 'Could not save the draft')
      setDraftId(data.id); setDraftSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the draft')
    } finally { setSavingDraft(false) }
  }

  async function send() {
    if (!to.trim() || !body.trim()) { setError('Recipient and a message are required.'); return }
    setSending(true); setError(null)
    try {
      // The original AI-drafted text (before any broker edits) — captured from `initial`,
      // which never changes after mount, NOT from the live body which reflects edits.
      // Sending the edited text as its own "original" would make the eval comparison
      // self-referential (draft vs itself) and produce no learning signal.
      const draftRes = await fetch('/api/nexus/draft-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body: initial.body, email_type: 'NEXUS', to_email: to.trim() }),
      })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare the draft')

      // Personal sender → auto-CC ops (server also enforces this).
      const ccList = cc.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))

      const sendRes = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draftData.draftId, htmlBody: bodyHtml, originalAiBody: initial.body,
          toEmail: to.trim(), cc: ccList, customSubject: subject, fromEmail: fromEmail || null,
          signatureId: sigId || null,   // server appends the signature
          attachments: initial.attachment ? [initial.attachment] : undefined,
        }),
      })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')

      if (initial.companyId) {
        const addresses = [to.trim(), ...ccList].filter(e => e.includes('@'))
        void Promise.all(addresses.map(email =>
          fetch(`/api/companies/${initial.companyId}/contacts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name: email === to.trim() ? initial.toName : undefined, role: 'stakeholder' }),
          }).catch(() => {})
        ))
      }

      if (draftId) void fetch(`/api/engagement/drafts/${draftId}`, { method: 'DELETE' }).catch(() => {})

      onSent?.(sendData.threadDbId ?? null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  // Anything typed since open (or since the last save) that would be lost on close.
  const dirty = !draftSaved && (
    to.trim() !== initial.toEmail.trim() || subject !== initial.subject || (cc.trim() !== (initial.cc ?? '').trim()) ||
    body.trim() !== htmlToPlain(plainToHtml(initial.body)).trim()
  )
  function requestClose() {
    // A backdrop click never closes (an accidental click used to silently discard the whole
    // email). Esc and Close do, behind one confirm when there are unsaved changes.
    if (dirty && !window.confirm('Discard this email? Unsaved changes will be lost.')) return
    onClose()
  }

  const external = externalDomain(to)
  const toName = to.trim() === initial.toEmail.trim() && initial.toName ? initial.toName : to
  const savedState = savingDraft ? 'Saving…' : draftSaved ? 'Draft saved' : null

  return (
    <DialogPrimitive.Root open onOpenChange={o => { if (!o) requestClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#202124]/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
          // Radix's Esc listener runs before an open toolbar menu's own: when a menu is open,
          // leave Esc to the menu (it closes itself) instead of closing the whole dialog.
          onEscapeKeyDown={e => {
            e.preventDefault()
            if (contentRef.current?.querySelector('[role="menu"]')) return
            if (fullscreen) setFullscreen(false); else requestClose()
          }}
          // Focus the To field when it is empty; otherwise the dialog itself, so typing starts
          // where the user clicks rather than on the Close button Radix would pick.
          onOpenAutoFocus={e => { e.preventDefault(); if (to.trim()) contentRef.current?.focus() }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-white border border-[#e8eaed] shadow-[0_24px_60px_rgba(32,33,36,0.18)] focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-200',
            fullscreen
              ? 'inset-3 rounded-[16px]'
              : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[880px] max-h-[calc(100vh-48px)] rounded-[16px]',
            '[--re-gutter:16px] sm:[--re-gutter:24px]',
          )}
          style={{ color: INK }}
        >
          {/* ── Bar: New email · Draft saved · Close ── */}
          <div className="flex items-center gap-2.5 px-[var(--re-gutter)] pt-4 pb-2.5 flex-shrink-0">
            <DialogPrimitive.Title className="m-0 text-[18px] font-medium tracking-[-0.01em]" style={{ color: INK }}>New email</DialogPrimitive.Title>
            <span className="flex-1" />
            {savedState && <span className="text-[12.5px] mr-1" style={{ color: FAINT }} role="status">{savedState}</span>}
            <button type="button" onClick={requestClose} className={cn(BTN_TERTIARY, 'h-8 px-2.5')} aria-label="Close" title="Close (Esc)">Close</button>
          </div>

          {/* ── To ── */}
          <FieldRow label="To" tall htmlFor="new-email-to" right={
            !showCc ? <button type="button" onClick={() => setShowCc(true)} aria-label="Add Cc" className="h-7 px-1.5 rounded-[6px] bg-transparent border-0 cursor-pointer text-[12.5px] hover:bg-[#f1f3f4]" style={{ color: FAINT }}>Cc</button> : undefined
          }>
            {to.trim() ? (
              <RecipientChip name={toName} email={to} onRemove={() => setTo('')} />
            ) : (
              <div ref={toAc.boxRef} className="relative flex-1 min-w-[160px]">
                <input
                  id="new-email-to"
                  value={to}
                  onChange={e => { setTo(e.target.value); toAc.reopen() }}
                  onKeyDown={e => {
                    if (toAc.onKeyDown(e)) { e.stopPropagation(); return }
                    if (e.key === 'Enter') { e.preventDefault(); setTo(to.trim()) }
                  }}
                  onFocus={toAc.reopen}
                  onBlur={() => { toAc.close(); setTo(to.trim()) }}
                  placeholder="Add people…"
                  aria-label="Recipient email address"
                  autoComplete="off"
                  autoFocus
                  className="w-full text-[14px] bg-transparent border-none outline-none focus-visible:outline-none py-1 placeholder:text-[#80868b]"
                  style={{ color: INK }}
                />
                {toAc.visible && <SuggestionList items={toAc.items} highlight={toAc.highlight} onPick={c => { setTo(c.email); toAc.close() }} />}
              </div>
            )}
          </FieldRow>

          {/* ── Cc — revealed from the To row. A personal sender auto-Ccs operations@ on the server. ── */}
          {showCc && (
            <FieldRow label="Cc" tall htmlFor="new-email-cc">
              {ccChips.map((email, i) => (
                <RecipientChip key={`${email}-${i}`} name={email} email={email} onRemove={() => setCc(joinCc(ccChips.filter((_, j) => j !== i), ccQuery))} />
              ))}
              <div ref={ccAc.boxRef} className="relative flex-1 min-w-[140px]">
                <input
                  id="new-email-cc"
                  value={ccQuery}
                  onChange={e => { setCc(joinCc(ccChips, e.target.value)); ccAc.reopen() }}
                  onKeyDown={e => {
                    if (ccAc.onKeyDown(e)) { e.stopPropagation(); return }
                    if ((e.key === 'Enter' || e.key === ',') && EMAIL_RE.test(ccQuery.trim())) { e.preventDefault(); setCc([...ccChips, ccQuery.trim()].join(', ') + ', ') }
                    if (e.key === 'Backspace' && !ccQuery && ccChips.length) setCc(joinCc(ccChips.slice(0, -1), ''))
                  }}
                  onFocus={ccAc.reopen}
                  onBlur={() => { ccAc.close(); if (EMAIL_RE.test(ccQuery.trim())) setCc([...ccChips, ccQuery.trim()].join(', ') + ', ') }}
                  placeholder={ccChips.length === 0 ? (personal ? 'operations@ is added on send' : 'Add Cc…') : ''}
                  aria-label="Cc"
                  autoComplete="off"
                  className="w-full text-[14px] bg-transparent border-none outline-none focus-visible:outline-none py-1 placeholder:text-[#80868b]"
                  style={{ color: INK }}
                />
                {ccAc.visible && <SuggestionList items={ccAc.items} highlight={ccAc.highlight} onPick={c => { setCc([...ccChips, c.email].join(', ') + ', '); ccAc.close() }} />}
              </div>
            </FieldRow>
          )}

          {/* ── Subject · From · Signature ── */}
          <FieldRow label="Subject" htmlFor="new-email-subject" right={
            (senders.length > 0 || sigs.length > 0) ? (
              <>
                {senders.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span>From</span>
                    <QuietSelect label="From" value={fromEmail} onChange={setFromEmail}>
                      {senders.map(s => <option key={s.email} value={s.email}>{s.label}</option>)}
                    </QuietSelect>
                  </span>
                )}
                {senders.length > 0 && sigs.length > 0 && <span aria-hidden>·</span>}
                {sigs.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span>Signature:</span>
                    <QuietSelect label="Signature" value={sigId} onChange={setSigId}>
                      <option value="">None</option>
                      {sigs.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
                    </QuietSelect>
                  </span>
                )}
              </>
            ) : undefined
          }>
            <input
              id="new-email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full text-[14px] bg-transparent border-none outline-none py-1 placeholder:text-[#80868b]"
              style={{ color: INK }}
            />
          </FieldRow>

          {/* ── Toolbar + editor (same kit as the reply panel) ── */}
          <RichEditor
            initialHtml={bodyHtml}
            onChange={setBodyHtml}
            borderless
            variant="reading"
            placeholder={`Write your email${initial.toName ? ` to ${initial.toName}` : ''}…`}
            minHeight={260}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(v => !v)}
            className="flex-1 min-h-0"
            bodyClassName="flex-1 min-h-0 overflow-y-auto"
          />

          {initial.attachment && (
            <div className="px-[var(--re-gutter)] pt-2 flex flex-wrap gap-1.5 flex-shrink-0">
              <AttachmentChip name={initial.attachment.filename} />
            </div>
          )}

          {/* ── Footer: external note or error · Save draft · Send ── */}
          <div className="flex items-center gap-2 px-[var(--re-gutter)] pt-2.5 pb-4 flex-shrink-0 flex-wrap">
            {error ? (
              <span className="text-[12.5px] min-w-0 truncate" role="alert" style={{ color: BODY }}>{error}</span>
            ) : external ? (
              <span className="text-[12.5px] min-w-0 truncate" style={{ color: FAINT }}>External recipient · {external}</span>
            ) : null}
            <span className="flex-1" />
            <button type="button" onClick={saveAsDraft} disabled={savingDraft || sending} className={BTN_SECONDARY}>
              {savingDraft ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" onClick={send} disabled={sending} className={cn(BTN_PRIMARY, 'h-9 text-[13.5px]')}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
