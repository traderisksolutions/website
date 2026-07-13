'use client'

import React, { useEffect, useState } from 'react'
import { X, Loader2, Send } from 'lucide-react'
import { plainToHtml, htmlToPlain } from '@/components/RichEditor'
import { useAutocomplete, SuggestionList } from '@/components/engagement/RecipientAutocomplete'

/**
 * Standalone "new email" composer for a recipient with no existing thread — so a
 * Nexus next-step's "Draft in Engagement" always lands in Engagement (compose
 * only; the thread is created on send). Server appends the signature (signatureId).
 */

type Sender    = { email: string; label: string; type: string }
type SigOption = { id: string; name: string; title: string | null; phone: string | null; email: string | null }

export type NewEmailDraft = { toEmail: string; toName?: string; subject: string; body: string }

export function NewEmailComposeModal({ initial, onClose, onSent }: {
  initial: NewEmailDraft
  onClose: () => void
  onSent?: (threadId: string | null) => void
}) {
  const [to,       setTo]       = useState(initial.toEmail)
  const [cc,       setCc]       = useState('')
  const [subject,  setSubject]  = useState(initial.subject)
  const [body,     setBody]     = useState(initial.body)
  const [senders,  setSenders]  = useState<Sender[]>([])
  const [sigs,     setSigs]     = useState<SigOption[]>([])
  const [fromEmail, setFromEmail] = useState('')
  const [sigId,    setSigId]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Recipient typeahead — same source as the reply editor (contacts + employees).
  const toAc = useAutocomplete(to, c => setTo(c.email))
  // CC is a comma-separated list — the typeahead matches the token currently being typed
  // and appends the picked address.
  const ccTokens = cc.split(',')
  const ccQuery  = (ccTokens[ccTokens.length - 1] ?? '').trim()
  const ccAc = useAutocomplete(ccQuery, c => {
    const head = ccTokens.slice(0, -1).map(t => t.trim()).filter(Boolean)
    setCc([...head, c.email].join(', ') + ', ')
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

  async function send() {
    if (!to.trim() || !htmlToPlain(plainToHtml(body)).trim()) { setError('Recipient and a message are required.'); return }
    setSending(true); setError(null)
    try {
      const plain = body
      const draftRes = await fetch('/api/nexus/draft-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: null, body: plain, email_type: 'NEXUS', to_email: to.trim() }),
      })
      const draftData = await draftRes.json()
      if (!draftRes.ok || !draftData.draftId) throw new Error(draftData.error || 'Could not prepare the draft')

      // Personal sender → auto-CC ops (server also enforces this).
      const ccList = cc.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))

      const sendRes = await fetch('/api/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draftData.draftId, htmlBody: plainToHtml(plain), originalAiBody: plain,
          toEmail: to.trim(), cc: ccList, customSubject: subject, fromEmail: fromEmail || null,
          signatureId: sigId || null,   // server appends the signature
        }),
      })
      const sendData = await sendRes.json()
      if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')
      onSent?.(sendData.threadDbId ?? null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally { setSending(false) }
  }

  const inp = 'flex-1 text-[13px] bg-background border border-[--border-subtle] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-[--border-subtle] px-5 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">New email{initial.toName ? ` to ${initial.toName}` : ''}</h3>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">No thread yet — this starts one when you send.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-2.5">
          <label className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">To</span>
            <div ref={toAc.boxRef} className="relative flex-1 min-w-0">
              <input
                value={to}
                onChange={e => { setTo(e.target.value); toAc.reopen() }}
                onKeyDown={e => toAc.onKeyDown(e)}
                onFocus={toAc.reopen}
                onBlur={toAc.close}
                placeholder="Type a name or email…"
                autoComplete="off"
                className={`${inp} w-full focus-visible:outline-none`}
              />
              {toAc.visible && <SuggestionList items={toAc.items} highlight={toAc.highlight} onPick={c => { setTo(c.email); toAc.close() }} />}
            </div></label>
          <label className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">Cc</span>
            <div ref={ccAc.boxRef} className="relative flex-1 min-w-0">
              <input
                value={cc}
                onChange={e => { setCc(e.target.value); ccAc.reopen() }}
                onKeyDown={e => ccAc.onKeyDown(e)}
                onFocus={ccAc.reopen}
                onBlur={ccAc.close}
                placeholder={personal ? 'operations@ auto-added' : 'optional'}
                autoComplete="off"
                className={`${inp} w-full focus-visible:outline-none`}
              />
              {ccAc.visible && <SuggestionList items={ccAc.items} highlight={ccAc.highlight} onPick={c => {
                const head = cc.split(',').slice(0, -1).map(t => t.trim()).filter(Boolean)
                setCc([...head, c.email].join(', ') + ', ')
                ccAc.close()
              }} />}
            </div></label>
          <label className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} /></label>

          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-14 flex-shrink-0">From</span>
            <select value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="text-[12px] rounded-md border border-[--border-subtle] bg-background px-2 py-1.5">
              {senders.map(s => <option key={s.email} value={s.email}>{s.label}</option>)}
            </select>
            <select value={sigId} onChange={e => setSigId(e.target.value)} className="text-[12px] rounded-md border border-[--border-subtle] bg-background px-2 py-1.5">
              <option value="">No signature</option>
              {sigs.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
            </select>
          </div>

          <textarea value={body} onChange={e => setBody(e.target.value)} rows={13}
            className="w-full text-[13px] leading-relaxed bg-background border border-[--border-subtle] rounded-md px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 mt-1" />

          {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-card border-t border-[--border-subtle] px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
          <button onClick={send} disabled={sending}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-4 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
