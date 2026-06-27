'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Check, Send, Sparkles } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Tip } from '@/components/Tip'
import { RichEditor, plainToHtml } from '@/components/RichEditor'
import { displayName, messagePreview } from './helpers'
import type { Lead } from './types'

// ── Types local to the reply workflow ─────────────────────────────────────────

type InboundSender = {
  email: string; label: string; type: 'shared' | 'personal'; verified: boolean
}

type InboundSigOption = {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null; sending_email: string | null
}

function buildSigHtml(sig: InboundSigOption): string {
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

// ── Component ─────────────────────────────────────────────────────────────────

interface InlineReplyRowProps {
  lead: Lead
  onStatus: (id: string, status: string) => void
  onCollapse: () => void
}

export function InlineReplyRow({ lead, onStatus, onCollapse }: InlineReplyRowProps) {
  const router = useRouter()
  const log    = useAuditLog()
  const msg    = messagePreview(lead)

  const alreadySent = lead.status !== 'new' && lead.status !== 'dropped'
  const [draftHtml,      setDraftHtml]      = useState('')
  const [draftEditorKey, setDraftEditorKey] = useState(0)
  const [draftId,        setDraftId]        = useState<string | null>(null)
  const [generating,     setGenerating]     = useState(false)
  const [sending,        setSending]        = useState(false)
  const [sendError,      setSendError]      = useState<string | null>(null)
  const [sent,           setSent]           = useState(alreadySent)
  const hasLoadedRef = useRef(false)

  const [senders,           setSenders]           = useState<InboundSender[]>([])
  const [selectedFromEmail, setSelectedFromEmail] = useState<string>('')
  const [signatures,        setSignatures]        = useState<InboundSigOption[]>([])
  const [selectedSigId,     setSelectedSigId]     = useState<string>('')

  const selectedSig = signatures.find(s => s.id === selectedSigId) ?? null
  const sigHtml     = selectedSig ? buildSigHtml(selectedSig) : ''

  // Load senders + signatures once on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/email/available-senders').then(r => r.ok ? r.json() : []),
      fetch('/api/signatures').then(r => r.ok ? r.json() : []),
    ]).then(([senderRows, sigRows]: [InboundSender[], InboundSigOption[]]) => {
      const ss = Array.isArray(senderRows) ? senderRows : []
      if (ss.length > 0) { setSenders(ss); setSelectedFromEmail(ss[0].email) }
      setSignatures(Array.isArray(sigRows) ? sigRows : [])
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select signature tied to the chosen FROM address
  useEffect(() => {
    if (!selectedFromEmail) return
    const matched = signatures.find(s => s.sending_email?.toLowerCase() === selectedFromEmail.toLowerCase())
    setSelectedSigId(matched?.id ?? '')
  }, [selectedFromEmail, signatures])

  // Auto-load existing draft once on mount
  useEffect(() => {
    if (hasLoadedRef.current || sent) return
    if (!lead.ai_draft_id || !lead.email) return
    hasLoadedRef.current = true
    setGenerating(true)
    fetch(`/api/inbound/auto-draft?leadId=${lead.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { content: string | null; draftId: string | null } | null) => {
        if (d?.content) {
          setDraftHtml(plainToHtml(d.content))
          setDraftId(d.draftId)
          setDraftEditorKey(k => k + 1)
        }
      })
      .catch(() => {})
      .finally(() => setGenerating(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generateDraft() {
    setGenerating(true); setSendError(null)
    try {
      const res  = await fetch('/api/inbound/auto-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, force: true }),
      })
      const data = await res.json()
      if (data.content) {
        setDraftHtml(plainToHtml(data.content))
        setDraftId(data.draftId ?? null)
        setDraftEditorKey(k => k + 1)
        log({ action: 'draft.generated', resource_type: 'inbound_lead', resource_id: lead.id, metadata: { contact: displayName(lead) } })
      } else {
        setSendError(data.error ?? 'Failed to generate draft')
      }
    } catch { setSendError('Network error') }
    finally { setGenerating(false) }
  }

  async function sendReply() {
    const finalHtml = sigHtml ? draftHtml + sigHtml : draftHtml
    if (!lead.email || !finalHtml.replace(/<[^>]+>/g, '').trim()) return
    setSending(true); setSendError(null)
    try {
      const res  = await fetch('/api/inbound/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id, name: displayName(lead), email: lead.email,
          company: lead.company, topic: lead.topic,
          originalMessage: msg,
          htmlBody:  finalHtml,
          fromEmail: selectedFromEmail || undefined,
          draftId:   draftId ?? null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSent(true)
        onStatus(lead.id, 'contacted')
        log({ action: 'draft.approved', resource_type: 'inbound_lead', resource_id: lead.id, metadata: { contact: displayName(lead), chars: finalHtml.length } })
        router.push(`/engagement?lead=${lead.id}`)
      } else {
        setSendError(data.error ?? 'Send failed')
      }
    } catch { setSendError('Network error') }
    finally { setSending(false) }
  }

  const hasDraft = draftHtml.replace(/<[^>]+>/g, '').trim().length > 0

  if (sent) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Check size={14} className="text-emerald-600 flex-shrink-0" />
              <span className="text-[12px] text-emerald-700 font-medium">Reply sent to {lead.email}</span>
              <a
                href={`/engagement?lead=${lead.id}`}
                className="text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1 no-underline hover:bg-emerald-500/15"
              >
                View in Engagement Agent →
              </a>
            </div>
            <button
              onClick={onCollapse}
              aria-label="Collapse reply panel"
              className="bg-transparent border-0 p-0 cursor-pointer text-emerald-400 hover:text-emerald-600"
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={9} className="px-4 py-4 border-b" style={{ background: 'var(--primary-light-bg)' }}>
        <div className="flex flex-col gap-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.06em] flex items-center gap-1.5"
              style={{ color: 'var(--primary-hex)' }}
            >
              <Sparkles size={11} /> AI Reply Draft
              <Tip text="Draft generated from TRS FAQ docs only — no pricing included. Review and edit before sending." />
            </span>
            <div className="flex items-center gap-2">
              {hasDraft && (
                <button
                  onClick={generateDraft}
                  disabled={generating}
                  className="bg-transparent border-0 cursor-pointer text-[11px] p-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
              <button
                onClick={onCollapse}
                aria-label="Collapse reply panel"
                className="bg-transparent border-0 p-0 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <ChevronUp size={14} />
              </button>
            </div>
          </div>

          {!hasDraft && !generating ? (
            <div className="flex items-center gap-3">
              <button
                onClick={generateDraft}
                disabled={generating}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border-0 cursor-pointer"
                style={{ background: 'var(--primary-hex)', color: '#fff' }}
              >
                <Sparkles size={12} /> Generate Reply
              </button>
              {sendError && <span className="text-[11px] text-destructive">{sendError}</span>}
            </div>
          ) : generating && !hasDraft ? (
            <div className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Sparkles size={12} /> Generating…
            </div>
          ) : (
            <>
              {/* Rich editor */}
              <div style={{ border: '1px solid var(--primary-light-border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <RichEditor
                  key={draftEditorKey}
                  initialHtml={draftHtml}
                  onChange={setDraftHtml}
                  sigHtml={sigHtml}
                  minHeight={160}
                />
              </div>

              {/* FROM + Signature row */}
              <div className="flex flex-col gap-1.5">
                {senders.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-[46px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>From</span>
                    <select
                      value={selectedFromEmail}
                      onChange={e => setSelectedFromEmail(e.target.value)}
                      aria-label="Send from email address"
                      className="flex-1 text-[12px] rounded-md cursor-pointer"
                      style={{ padding: '4px 8px', border: '1px solid hsl(var(--border))', background: '#fff', color: 'var(--text-secondary)' }}
                    >
                      {senders.map(s => (
                        <option key={s.email} value={s.email}>{s.label} &lt;{s.email}&gt;</option>
                      ))}
                    </select>
                  </div>
                )}
                {signatures.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-[46px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Sig</span>
                    {selectedSig ? (
                      <>
                        <span
                          className="text-[11px] rounded-md px-2 py-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]"
                          style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', color: 'var(--text-secondary)' }}
                        >
                          {selectedSig.name}{selectedSig.title ? ` · ${selectedSig.title}` : ''}
                        </span>
                        <button
                          onClick={() => setSelectedSigId('')}
                          aria-label="Remove signature"
                          style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <select
                        value={selectedSigId}
                        onChange={e => setSelectedSigId(e.target.value)}
                        aria-label="Choose email signature"
                        className="flex-1 text-[12px] rounded-md cursor-pointer"
                        style={{ padding: '4px 8px', border: '1px solid hsl(var(--border))', background: '#fff', color: 'var(--text-secondary)' }}
                      >
                        <option value="">— No signature —</option>
                        {signatures.map(s => (
                          <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* To + Send row */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  To: {lead.email}
                  {selectedFromEmail && selectedFromEmail !== 'operations@trade-risksol.com' && (
                    <span
                      className="ml-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'hsl(var(--muted))', color: 'var(--text-muted)' }}
                    >
                      CC: operations@
                    </span>
                  )}
                  <Tip text="Sent via Gmail. When sending from a personal address, operations@ is auto-CC'd so lead replies stay in the shared thread." />
                </span>
                <div className="flex items-center gap-2">
                  {sendError && <span className="text-[11px] text-destructive">{sendError}</span>}
                  <button
                    onClick={sendReply}
                    disabled={sending || !hasDraft}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border-0 cursor-pointer disabled:opacity-50"
                    style={{ background: sending ? 'var(--primary-light-bg)' : 'var(--primary-hex)', color: sending ? 'var(--primary-hex)' : '#fff' }}
                  >
                    <Send size={12} /> {sending ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </td>
    </tr>
  )
}

// ── Collapse trigger for expanded rows ────────────────────────────────────────
// Exported so the table row can open/collapse the inline reply without knowing internals.

export function ReplyExpandButton({
  isExpanded, onClick,
}: {
  isExpanded: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse reply panel' : 'Draft and send reply'}
      className={`inline-flex items-center justify-center cursor-pointer p-1 rounded transition-colors ${
        isExpanded
          ? 'border border-border text-primary hover:bg-muted/50'
          : 'bg-muted/50 border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      title={isExpanded ? 'Collapse' : 'Draft & send reply'}
    >
      {isExpanded ? <ChevronDown size={14} /> : <Send size={14} />}
    </button>
  )
}
