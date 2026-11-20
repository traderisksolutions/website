'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { Tip } from '@/components/Tip'
import { StatusBadge } from '@/components/status-badge'
import type { AppStatus } from '@/components/status-badge'
import { DetailSection, DetailField } from '@/components/detail-section'
import { Btn, btnClass, textareaCls } from '@/components/crm/primitives'
import { cn } from '@/lib/utils'
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

  const copyIcon = (key: string) => copied === key
    ? <Check size={12} className="flex-shrink-0 text-trs-ink" />
    : <Copy size={12} className="flex-shrink-0 text-trs-subtle" />

  return (
    <div className="flex flex-col h-full text-trs-ink">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 flex-shrink-0 border-b border-trs-line">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <ChannelBadge source={lead.source} />
            <StatusBadge status={lead.status as AppStatus} />
          </div>
          <p className="text-heading font-medium tracking-[-0.01em] m-0 leading-tight text-trs-ink">
            {displayName(lead)}
          </p>
          {lead.company && (
            <p className="text-body mt-0.5 mb-0 text-trs-muted">{lead.company}</p>
          )}
        </div>
        <Btn
          level="tertiary"
          size="xs"
          onClick={onClose}
          aria-label="Close detail panel"
          className="w-8 px-0 rounded flex-shrink-0 border-0 text-trs-muted hover:bg-trs-field"
        >
          <X size={14} />
        </Btn>
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
            <Btn
              level="tertiary"
              size="xs"
              onClick={() => copy(lead.email!, 'email')}
              aria-label={`Copy email address: ${lead.email}`}
              className="h-auto justify-start gap-1.5 max-w-full bg-transparent border-0 p-0 font-normal text-left hover:bg-transparent"
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] block text-trs-ink">
                {lead.email}
              </span>
              {copyIcon('email')}
            </Btn>
          </DetailField>
        )}
        {lead.phone && (
          <DetailField label="Phone / WhatsApp">
            <Btn
              level="tertiary"
              size="xs"
              onClick={() => copy(lead.phone!, 'phone')}
              aria-label={`Copy phone: ${lead.phone}`}
              className="h-auto gap-1.5 bg-transparent border-0 p-0 font-normal hover:bg-transparent"
            >
              <span className="text-trs-ink">{lead.phone}</span>
              {copyIcon('phone')}
            </Btn>
          </DetailField>
        )}
        {ch === 'whatsapp' && lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(btnClass('secondary', 'xs'), 'mt-1 no-underline w-fit')}
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
        {lead.page_url && <DetailField label="Page"><span className="text-small break-all">{lead.page_url}</span></DetailField>}
      </DetailSection>

      {/* Message */}
      {msg && (
        <DetailSection label="Message">
          <p className="text-body whitespace-pre-wrap leading-[1.6] rounded px-3.5 py-3 m-0 bg-trs-field text-trs-ink-2">
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
        <p className="m-0 mt-1.5 text-small text-trs-subtle">Team only. Saved when the field loses focus.</p>
      </DetailSection>
    </div>
  )
}
