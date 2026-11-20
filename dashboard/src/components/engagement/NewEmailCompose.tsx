'use client'

import { toProblem } from '@/lib/email/recipients'
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { RichEditor, plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { useAutocomplete, SuggestionList } from '@/components/engagement/RecipientAutocomplete'
import { useConfirm } from '@/components/ui/confirm'
import { X, Trash2, Signature } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { addCompanyContact } from '@/app/companies/[id]/actions'
import {
  FieldRow, RecipientChip, QuietSelect, AttachmentChip, TbMenu, TbMenuItem, externalDomain,
} from '@/components/engagement-agent/compose-toolbar'

/**
 * Standalone "new email" composer for a recipient with no existing thread — so a
 * Nexus next-step's "Draft in Engagement" always lands in Engagement (compose
 * only; the thread is created on send). Server appends the signature (signatureId).
 *
 * Presentation (20 Nov 2026): the whole reading pane, not a modal — real work is a full page.
 * To/Cc/Subject rows, the same grouped toolbar and Quill editor as the reply panel, Save draft ·
 * Send in the footer. Data flow unchanged: drafts are still stored as plain text (the drafts list
 * previews `body` as text), so the editor's HTML is flattened on save and re-expanded on reopen;
 * the send carries the editor's HTML as-is.
 */

type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }

type EmailAttachmentRef = { filename: string; mime_type?: string; storage_url: string }
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

export function NewEmailCompose({ initial, onClose, onSent }: {
  initial: NewEmailDraft
  onClose: () => void
  onSent?: (threadId: string | null) => void
}) {
  const [to,       setTo]       = useState(initial.toEmail)
  // The To field becomes a chip only once committed (Enter, a suggestion, or leaving the field), never while typing.
  const [toDone,   setToDone]   = useState(Boolean(initial.toEmail.trim()))
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
  const [fullscreen, setFullscreen] = useState(false)
  const contentRef = useRef<HTMLElement>(null)

  // Recipient typeahead — same source as the reply editor (contacts + employees).
  const toAc = useAutocomplete(to, c => { setTo(c.email); setToDone(true) })
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
    const toIssue = toProblem(to)
    if (toIssue) { setError(toIssue); return }
    setSending(true); setError(null)
    try {
      // The original AI-drafted text (before any broker edits) — captured from `initial`,
      // which never changes after mount, NOT from the live body which reflects edits.
      // Sending the edited text as its own "original" would make the eval comparison
      // self-referential (draft vs itself) and produce no learning signal.
      const draftRes = await fetch('/api/nexus/draft-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body: body.trim() ? body : initial.body, email_type: 'NEXUS', to_email: to.trim() }),
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
          addCompanyContact(initial.companyId!, { email, name: email === to.trim() ? initial.toName ?? undefined : undefined, role: 'stakeholder' }).catch(() => {})
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
  const confirmBox = useConfirm()
  async function requestClose() {
    // Esc and Close leave the pane, behind one confirm when there are unsaved changes.
    if (dirty && !(await confirmBox({ title: 'Discard this email?', body: 'Unsaved changes will be lost.', action: 'Discard', danger: true }))) return
    onClose()
  }

  const external = externalDomain(to)
  const toName = to.trim() === initial.toEmail.trim() && initial.toName ? initial.toName : to
  const savedState = savingDraft ? 'Saving…' : draftSaved ? 'Draft saved' : null

  return (
    <section
      ref={contentRef}
      aria-label="New email"
      tabIndex={-1}
      // Esc leaves the pane; an open toolbar menu closes itself first.
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        if (contentRef.current?.querySelector('[role="menu"]')) return
        e.preventDefault()
        if (fullscreen) setFullscreen(false); else void requestClose()
      }}
      className={cn(
        'flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-white text-trs-ink focus:outline-none',
        fullscreen && 'fixed inset-0 z-50',
        '[--re-gutter:16px]',
      )}
    >
          {/* ── Header: New email · Draft saved · From · Close ── */}
          <div className="flex items-center gap-2 px-[var(--re-gutter)] h-12 flex-shrink-0 border-b border-trs-line">
            <h1 className="m-0 text-heading font-medium text-trs-ink">New email</h1>
            <span className="flex-1" />
            {savedState && <span className="text-small mr-1 text-trs-subtle" role="status">{savedState}</span>}
            {senders.length > 0 && (
              <span className="inline-flex items-center gap-1 min-w-0 text-small text-trs-muted">
                <span>From</span>
                <QuietSelect label="From" value={fromEmail} onChange={setFromEmail}>
                  {senders.map(s => <option key={s.email} value={s.email}>{s.label}</option>)}
                </QuietSelect>
              </span>
            )}
            <Btn level="tertiary" size="xs" onClick={requestClose} className="w-8 px-0" aria-label="Close" title="Close (Esc)"><X size={16} /></Btn>
          </div>

          {/* ── To ── */}
          <FieldRow label="To" htmlFor="new-email-to">
            {toDone && to.trim() ? (
              <RecipientChip name={toName} email={to} onRemove={() => { setTo(''); setToDone(false) }} />
            ) : (
              <div ref={toAc.boxRef} className="relative flex-1 min-w-[160px]">
                <input
                  id="new-email-to"
                  value={to}
                  onChange={e => { setTo(e.target.value.replace(/^mailto:/i, '')); toAc.reopen() }}
                  onKeyDown={e => {
                    if (toAc.onKeyDown(e)) { e.stopPropagation(); return }
                    if (e.key === 'Enter') { e.preventDefault(); setTo(to.trim()); setToDone(Boolean(to.trim())) }
                  }}
                  onFocus={toAc.reopen}
                  onBlur={() => { toAc.close(); setTo(to.trim()); setToDone(Boolean(to.trim())) }}
                  placeholder="Add people…"
                  aria-label="Recipient email address"
                  autoComplete="off"
                  autoFocus
                  className="w-full text-body bg-transparent border-none outline-none focus-visible:outline-none py-1 text-trs-ink placeholder:text-trs-subtle"
                />
                {toAc.visible && <SuggestionList items={toAc.items} highlight={toAc.highlight} onPick={c => { setTo(c.email); setToDone(true); toAc.close() }} />}
              </div>
            )}
          </FieldRow>

          {/* ── Cc. A personal sender auto-Ccs operations@ on the server. ── */}
          <FieldRow label="Cc" htmlFor="new-email-cc">
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
                  className="w-full text-body bg-transparent border-none outline-none focus-visible:outline-none py-1 text-trs-ink placeholder:text-trs-subtle"
                />
                {ccAc.visible && <SuggestionList items={ccAc.items} highlight={ccAc.highlight} onPick={c => { setCc([...ccChips, c.email].join(', ') + ', '); ccAc.close() }} />}
              </div>
            </FieldRow>

          {/* ── Subject ── */}
          <FieldRow label="Subject" htmlFor="new-email-subject">
            <input
              id="new-email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full text-body bg-transparent border-none outline-none py-1 text-trs-ink placeholder:text-trs-subtle"
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
            toolbarExtras={sigs.length > 0 ? (
              // Signature: the same choice as before, moved from the Subject row.
              <TbMenu label="Signature" text={false} caret={false} width={240} trigger={<Signature size={16} />}>
                {close => (
                  <>
                    <TbMenuItem active={sigId === ''} onSelect={() => { setSigId(''); close() }}>None</TbMenuItem>
                    {sigs.map(s => <TbMenuItem key={s.id} active={sigId === s.id} onSelect={() => { setSigId(s.id); close() }}>{s.name}{s.title ? ` · ${s.title}` : ''}</TbMenuItem>)}
                  </>
                )}
              </TbMenu>
            ) : undefined}
          />

          {initial.attachment && (
            <div className="px-[var(--re-gutter)] pt-2 flex flex-wrap gap-1.5 flex-shrink-0">
              <AttachmentChip name={initial.attachment.filename} />
            </div>
          )}

          {/* ── Footer: Send · Save draft · external note or error · Discard ── */}
          <div className="flex items-center gap-1 px-[var(--re-gutter)] pt-2 pb-3 flex-shrink-0">
            <Btn level="primary" onClick={send} disabled={sending} className="mr-1">
              {sending ? 'Sending…' : 'Send'}
            </Btn>
            <Btn level="tertiary" size="xs" onClick={saveAsDraft} disabled={savingDraft || sending}>
              {savingDraft ? 'Saving…' : 'Save draft'}
            </Btn>
            <span className="flex-1 min-w-2" />
            {error ? (
              <span className="text-small min-w-0 truncate text-trs-neg" role="alert">{error}</span>
            ) : external ? (
              <span className="text-small min-w-0 truncate text-trs-subtle">External recipient · {external}</span>
            ) : null}
            <Btn level="tertiary" size="xs" onClick={requestClose} className="w-8 px-0 flex-shrink-0" aria-label="Discard" title="Discard"><Trash2 size={15} /></Btn>
          </div>
    </section>
  )
}
