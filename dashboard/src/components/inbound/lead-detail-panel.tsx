'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'
import { textareaCls } from '@/components/crm/primitives'
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

const INK = '#202124'
const MUTED = '#5f6368'

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

  const copyIcon = (key: string) => copied === key
    ? <Check size={12} className="flex-shrink-0" style={{ color: INK }} />
    : <Copy size={12} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />

  return (
    <div className="flex flex-col h-full" style={{ color: INK }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 flex-shrink-0" style={{ borderBottom: '1px solid #e8eaed' }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <ChannelBadge source={lead.source} />
            <StatusBadge status={lead.status as AppStatus} />
          </div>
          <p className="text-[16px] font-medium tracking-[-0.01em] m-0 leading-tight" style={{ color: INK }}>
            {displayName(lead)}
          </p>
          {lead.company && (
            <p className="text-[13px] mt-0.5 mb-0" style={{ color: MUTED }}>{lead.company}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-[#f1f3f4] transition-colors flex-shrink-0 bg-transparent border-0 cursor-pointer"
          style={{ color: MUTED }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Status */}
      <DetailSection label="Status">
        <div className="flex items-center gap-1">
          <StatusDropdown lead={lead} onChange={onStatus} />
          <Tip
            placement="right"
            text="Move from New to Contacted once replied, through to Converted when a policy is placed."
          />
        </div>
      </DetailSection>

      {/* Contact info */}
      <DetailSection label="Contact">
        {(lead.first_name || lead.last_name) && (
          <DetailField label="Name">{fullName(lead)}</DetailField>
        )}
        {lead.email && (
          <DetailField label="Email">
            <button
              type="button"
              onClick={() => copy(lead.email!, 'email')}
              aria-label={`Copy email address: ${lead.email}`}
              className="flex items-center gap-1.5 max-w-full bg-transparent border-0 p-0 cursor-pointer text-left"
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] block" style={{ color: INK }}>
                {lead.email}
              </span>
              {copyIcon('email')}
            </button>
          </DetailField>
        )}
        {lead.phone && (
          <DetailField label="Phone / WhatsApp">
            <button
              type="button"
              onClick={() => copy(lead.phone!, 'phone')}
              aria-label={`Copy phone: ${lead.phone}`}
              className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
            >
              <span style={{ color: INK }}>{lead.phone}</span>
              {copyIcon('phone')}
            </button>
          </DetailField>
        )}
        {ch === 'whatsapp' && lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center h-8 px-3 rounded-[8px] text-[12.5px] font-medium no-underline bg-white hover:bg-[#f8f9fa] w-fit"
            style={{ border: '1px solid #dadce0', color: INK }}
          >
            Open in WhatsApp
          </a>
        )}
      </DetailSection>

      {/* Lead info */}
      <DetailSection label="Lead">
        {lead.topic        && <DetailField label="Topic">{lead.topic}</DetailField>}
        {lead.department   && <DetailField label="Department">{lead.department}</DetailField>}
        {lead.contact_type && <DetailField label="Type">{lead.contact_type}</DetailField>}
        <DetailField label="Source">{lead.source.replace(/_/g, ' ')}</DetailField>
        <DetailField label="Received">{fmtDate(lead.created_at)}</DetailField>
        {lead.page_url && <DetailField label="Page"><span className="text-[12.5px] break-all">{lead.page_url}</span></DetailField>}
      </DetailSection>

      {/* Message */}
      {msg && (
        <DetailSection label="Message">
          <p className="text-[13.5px] whitespace-pre-wrap leading-[1.6] rounded-[12px] px-3.5 py-3 m-0" style={{ background: '#f1f3f4', color: '#3c4043' }}>
            {msg}
          </p>
        </DetailSection>
      )}

      {/* Notes */}
      <DetailSection label="Internal notes" className="flex-1">
        <textarea
          value={notesText}
          onChange={e => setNotesText(e.target.value)}
          onBlur={() => onNotesSave(lead.id, notesText)}
          placeholder="Insurer to quote, follow-up date, call notes"
          rows={4}
          aria-label="Internal notes for this lead"
          className={textareaCls}
        />
        <p className="m-0 mt-1.5 text-[12px]" style={{ color: '#80868b' }}>Team only. Saved when the field loses focus.</p>
      </DetailSection>
    </div>
  )
}
