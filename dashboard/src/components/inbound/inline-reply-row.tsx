'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Check, Send, X } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Tip } from '@/components/Tip'
import { RichEditor, plainToHtml } from '@/components/RichEditor'
import { Btn, Chip, inputCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
import { displayName, messagePreview } from './helpers'
import type { Lead } from './types'

const INK = '#202124'
const MUTED = '#5f6368'

// ── Types local to the reply workflow ─────────────────────────────────────────

type InboundSender = {
  email: string; label: string; type: 'shared' | 'personal'; verified: boolean
}

type InboundSigOption = {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null; sending_email: string | null
}

// Outbound email markup (what the recipient sees), not dashboard UI — colours here are the
// signature's own styling and stay as they are.
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
  const selectCls = cn(inputCls, 'h-9 text-[13px] flex-1 cursor-pointer')

  if (sent) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-3" style={{ background: '#f8f9fa', borderBottom: '1px solid #e8eaed' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Check size={14} className="flex-shrink-0" style={{ color: INK }} />
              <span className="text-[13.5px]" style={{ color: '#3c4043' }}>Reply sent to {lead.email}</span>
              <a
                href={`/engagement?lead=${lead.id}`}
                className="text-[13.5px] no-underline hover:underline underline-offset-4"
                style={{ color: INK }}
              >
                View in Engagement →
              </a>
            </div>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse reply panel"
              className="bg-transparent border-0 p-0 cursor-pointer"
              style={{ color: MUTED }}
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
      <td colSpan={6} className="px-4 py-4" style={{ background: '#f8f9fa', borderBottom: '1px solid #e8eaed' }}>
        <div className="flex flex-col gap-3">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium flex items-center gap-1" style={{ color: INK }}>
              AI reply draft
              <Tip text="Drafted from TRS FAQ documents only, no pricing. Review and edit before sending." />
            </span>
            <div className="flex items-center gap-3">
              {hasDraft && (
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={generating}
                  className="bg-transparent border-0 cursor-pointer text-[13px] p-0 underline underline-offset-4 disabled:opacity-50"
                  style={{ color: MUTED }}
                >
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse reply panel"
                className="bg-transparent border-0 p-0 cursor-pointer"
                style={{ color: MUTED }}
              >
                <ChevronUp size={14} />
              </button>
            </div>
          </div>

          {!hasDraft && !generating ? (
            <div className="flex items-center gap-3 flex-wrap">
              <Btn level="primary" onClick={generateDraft} disabled={generating}>Generate reply</Btn>
              {sendError && <span className="text-[13px]" style={{ color: MUTED }}>{sendError}</span>}
            </div>
          ) : generating && !hasDraft ? (
            <div className="text-[13px]" style={{ color: MUTED }}>Generating…</div>
          ) : (
            <>
              {/* Rich editor */}
              <div className="overflow-hidden rounded-[10px] bg-white" style={{ border: '1px solid #dadce0' }}>
                <RichEditor
                  key={draftEditorKey}
                  initialHtml={draftHtml}
                  onChange={setDraftHtml}
                  sigHtml={sigHtml}
                  minHeight={160}
                />
              </div>

              {/* FROM + Signature row */}
              <div className="flex flex-col gap-2">
                {senders.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] w-[64px] flex-shrink-0" style={{ color: MUTED }}>From</span>
                    <select
                      value={selectedFromEmail}
                      onChange={e => setSelectedFromEmail(e.target.value)}
                      aria-label="Send from email address"
                      className={selectCls}
                    >
                      {senders.map(s => (
                        <option key={s.email} value={s.email}>{s.label} &lt;{s.email}&gt;</option>
                      ))}
                    </select>
                  </div>
                )}
                {signatures.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] w-[64px] flex-shrink-0" style={{ color: MUTED }}>Signature</span>
                    {selectedSig ? (
                      <>
                        <Chip className="max-w-[260px] overflow-hidden text-ellipsis">
                          {selectedSig.name}{selectedSig.title ? ` · ${selectedSig.title}` : ''}
                        </Chip>
                        <button
                          type="button"
                          onClick={() => setSelectedSigId('')}
                          aria-label="Remove signature"
                          className="w-6 h-6 inline-flex items-center justify-center rounded-[6px] hover:bg-[#f1f3f4] bg-transparent border-0 cursor-pointer p-0"
                          style={{ color: MUTED }}
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <select
                        value={selectedSigId}
                        onChange={e => setSelectedSigId(e.target.value)}
                        aria-label="Choose email signature"
                        className={selectCls}
                      >
                        <option value="">No signature</option>
                        {signatures.map(s => (
                          <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* To + Send row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[12.5px] flex items-center gap-1.5 flex-wrap" style={{ color: MUTED }}>
                  To {lead.email}
                  {selectedFromEmail && selectedFromEmail !== 'operations@trade-risksol.com' && (
                    <Chip>cc operations@</Chip>
                  )}
                  <Tip text="Sent via Gmail. From a personal address, operations@ is copied so replies stay in the shared thread." />
                </span>
                <div className="flex items-center gap-3">
                  {sendError && <span className="text-[13px]" style={{ color: MUTED }}>{sendError}</span>}
                  <Btn level="primary" onClick={sendReply} disabled={sending || !hasDraft} loading={sending}>
                    {!sending && <Send size={12} />} {sending ? 'Sending…' : 'Send reply'}
                  </Btn>
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
      type="button"
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse reply panel' : 'Draft and send reply'}
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 rounded-[8px] cursor-pointer transition-colors',
        isExpanded ? 'bg-[#f1f3f4] hover:bg-[#e8eaed]' : 'bg-white hover:bg-[#f8f9fa]',
      )}
      style={{ border: '1px solid #dadce0', color: INK }}
      title={isExpanded ? 'Collapse' : 'Draft and send reply'}
    >
      {isExpanded ? <ChevronDown size={14} /> : <Send size={14} />}
    </button>
  )
}
