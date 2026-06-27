'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check, MessageCircle } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { ChannelBadge } from './channel-badge'
import { StatusDropdown } from './status-dropdown'
import { fullName, displayName, channelOf, messagePreview, fmtDate } from './helpers'
import type { Lead } from './types'

interface LeadDetailPanelProps {
  lead: Lead
  onStatus: (id: string, status: string) => void
  onClose: () => void
  onNotesSave: (id: string, notes: string) => void
}

export function LeadDetailPanel({ lead, onStatus, onClose, onNotesSave }: LeadDetailPanelProps) {
  const [copied,    setCopied]    = useState<string | null>(null)
  const [notesText, setNotesText] = useState(lead.notes ?? '')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNotesText(lead.notes ?? '') }, [lead.id])

  const ch  = channelOf(lead)
  const msg = messagePreview(lead)

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="detail-section flex items-start justify-between gap-2 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <ChannelBadge source={lead.source} />
            <StatusBadge status={lead.status as AppStatus} />
          </div>
          <p className="text-[14px] font-semibold text-foreground m-0 leading-tight">
            {displayName(lead)}
          </p>
          {lead.company && (
            <p className="text-[12px] text-muted-foreground mt-0.5 mb-0">{lead.company}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Status */}
      <div className="detail-section">
        <p className="detail-section-label">
          Status{' '}
          <Tip
            placement="right"
            text="Update this as the conversation progresses — from New to Contacted once you've replied, through to Converted when a policy is placed."
          />
        </p>
        <StatusDropdown lead={lead} onChange={onStatus} />
      </div>

      {/* Contact info */}
      <div className="detail-section">
        <p className="detail-section-label">Contact</p>
        <div className="flex flex-col gap-2.5">
          {(lead.first_name || lead.last_name) && (
            <DetailField label="Name" value={fullName(lead)} />
          )}
          {lead.email && (
            <div className="detail-field">
              <p className="detail-field-label">Email</p>
              <button
                onClick={() => copy(lead.email!, 'email')}
                aria-label={`Copy email address: ${lead.email}`}
                className="flex items-center gap-1.5 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left"
              >
                <span className="detail-field-value overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px] block">
                  {lead.email}
                </span>
                {copied === 'email'
                  ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                  : <Copy size={10}  className="text-muted-foreground/30 flex-shrink-0" />
                }
              </button>
            </div>
          )}
          {lead.phone && (
            <div className="detail-field">
              <p className="detail-field-label">Phone / WhatsApp</p>
              <button
                onClick={() => copy(lead.phone!, 'phone')}
                aria-label={`Copy phone: ${lead.phone}`}
                className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
              >
                <span className="detail-field-value">{lead.phone}</span>
                {copied === 'phone'
                  ? <Check size={11} className="text-emerald-500 flex-shrink-0" />
                  : <Copy size={10}  className="text-muted-foreground/30 flex-shrink-0" />
                }
              </button>
            </div>
          )}
          {ch === 'whatsapp' && lead.phone && (
            <a
              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 no-underline w-fit"
            >
              <MessageCircle size={12} /> Open in WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Lead info */}
      <div className="detail-section">
        <p className="detail-section-label">Lead Info</p>
        <div className="flex flex-col gap-2.5">
          {lead.topic        && <DetailField label="Topic"      value={lead.topic} />}
          {lead.department   && <DetailField label="Department" value={lead.department} />}
          {lead.contact_type && <DetailField label="Type"       value={lead.contact_type} />}
          <DetailField label="Source"   value={lead.source.replace(/_/g, ' ')} />
          <DetailField label="Received" value={fmtDate(lead.created_at)} />
          {lead.page_url && <DetailField label="Page" value={lead.page_url} small />}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className="detail-section">
          <p className="detail-section-label">Original Message</p>
          <p className="text-[12px] text-foreground/80 whitespace-pre-wrap leading-[1.65] bg-muted/40 rounded-lg px-3 py-2.5 m-0">
            {msg}
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="detail-section flex-1">
        <p className="detail-section-label">
          Internal Notes{' '}
          <Tip
            placement="right"
            text="Only visible to your TRS team — the contact never sees these. Use this to record context like which insurer to quote, a follow-up date, or notes from a call."
          />
        </p>
        <textarea
          value={notesText}
          onChange={e => setNotesText(e.target.value)}
          onBlur={() => onNotesSave(lead.id, notesText)}
          placeholder="Add notes…"
          rows={4}
          aria-label="Internal notes for this lead"
          className="w-full box-border text-[12px] text-foreground leading-[1.6] border border-border rounded-lg px-2.5 py-2 resize-none bg-muted/30 outline-none font-sans focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

// ── Internal atoms ────────────────────────────────────────────────────────────

function DetailField({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="detail-field">
      <p className="detail-field-label">{label}</p>
      <p className={`detail-field-value break-all m-0${small ? ' text-[11px]' : ''}`}>{value}</p>
    </div>
  )
}
