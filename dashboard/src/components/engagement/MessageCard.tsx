'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RealMsg } from './types'
import { fmtDateTime, stripQuotedContent, parseAddress, initialOf } from './helpers'

/**
 * A plain-text message card, kept for callers outside the reader. The reader itself uses
 * MessageBlock. Same tokens: ink, muted, hairline; no state colour.
 */

interface MessageCardProps {
  msg:         RealMsg
  defaultOpen: boolean
  onOpen?:     (id: string) => void
}

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const HAIR = '#e8eaed'

export function MessageCard({ msg, defaultOpen, onOpen }: MessageCardProps) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [showFull, setShowFull] = useState(false)

  const isOut       = msg.direction === 'outbound'
  const fullBody    = msg.body_text ?? ''
  const stripped    = stripQuotedContent(fullBody)
  const hasQuoted   = stripped.length < fullBody.trim().length
  const from        = parseAddress(msg.from_address)
  const senderLabel = isOut ? 'Trade Risk Solutions' : (from.name ?? from.email ?? '—')

  function expand() {
    setOpen(true)
    onOpen?.(msg.id)
  }

  if (!open) {
    const preview = (() => {
      const raw = stripped.split('\n').find(l => l.trim()) || msg.subject || '—'
      return raw.length > 90 ? raw.slice(0, 88) + '…' : raw
    })()

    return (
      <button type="button" onClick={expand} aria-expanded={false} aria-label={`Expand message from ${senderLabel}`}
        className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-[12px] bg-white cursor-pointer hover:bg-[#f8f9fa]"
        style={{ border: `1px solid ${HAIR}` }}>
        <Avatar name={senderLabel} size="sm" />
        <span className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-[13px] font-medium flex-shrink-0" style={{ color: INK }}>{isOut ? 'You' : senderLabel}</span>
          <span className="text-[13px] truncate flex-1" style={{ color: MUTED }}>{preview}</span>
        </span>
        <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: FAINT }}>{fmtDateTime(msg.sent_at)}</span>
        <ChevronDown size={13} className="flex-shrink-0" style={{ color: '#9aa0a6' }} />
      </button>
    )
  }

  return (
    <div className="rounded-[12px] overflow-hidden bg-white" style={{ border: `1px solid ${HAIR}` }}>
      <button type="button" onClick={() => { onOpen?.(msg.id); setOpen(false) }} aria-expanded aria-label={`Collapse message from ${senderLabel}`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-transparent cursor-pointer hover:bg-[#f8f9fa]" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <Avatar name={senderLabel} size="md" />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 mb-0.5">
            <span className="text-[13.5px] font-medium" style={{ color: INK }}>{senderLabel}</span>
            <span className="text-[11.5px] font-medium px-2 py-0.5 rounded-[6px]" style={{ background: '#f1f3f4', color: BODY }}>{isOut ? 'Sent' : 'Received'}</span>
          </span>
          {msg.subject && <span className="block text-[12.5px] truncate" style={{ color: MUTED }}>{msg.subject}</span>}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>{fmtDateTime(msg.sent_at)}</span>
          <ChevronDown size={13} className="rotate-180" style={{ color: '#9aa0a6' }} />
        </span>
      </button>

      <div className="px-5 pt-4 pb-5">
        {(msg.to.length > 0 || msg.cc.length > 0) && (
          <dl className="m-0 mb-4 pb-3 grid grid-cols-[32px_1fr] gap-x-2 gap-y-1 text-[12.5px]" style={{ borderBottom: `1px solid ${HAIR}` }}>
            {msg.to.length > 0 && <><dt style={{ color: FAINT }}>To</dt><dd className="m-0 break-all" style={{ color: BODY }}>{msg.to.join(', ')}</dd></>}
            {msg.cc.length > 0 && <><dt style={{ color: FAINT }}>Cc</dt><dd className="m-0 break-all" style={{ color: BODY }}>{msg.cc.join(', ')}</dd></>}
          </dl>
        )}

        <div className={cn('text-[15px] leading-[1.6] whitespace-pre-wrap break-words', !showFull && 'max-h-[320px] overflow-y-auto')} style={{ color: INK }}>
          {showFull ? fullBody : stripped}
        </div>

        {hasQuoted && (
          <button type="button" onClick={() => setShowFull(v => !v)} aria-expanded={showFull}
            className="mt-3 text-[12.5px] bg-transparent border-0 p-0 cursor-pointer underline underline-offset-[3px] decoration-[#9aa0a6]" style={{ color: INK }}>
            {showFull ? 'Hide quoted history' : 'Show quoted history'}
          </button>
        )}
      </div>
    </div>
  )
}

function Avatar({ name, size }: { name: string; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[13px]'
  return (
    <span className={cn('rounded-full flex-shrink-0 inline-flex items-center justify-center font-medium select-none', dim)} style={{ background: '#f1f3f4', color: INK }} aria-hidden>
      {initialOf(name)}
    </span>
  )
}
