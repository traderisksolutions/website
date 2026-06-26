'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RealMsg } from './types'
import { fmtDateTime, stripQuotedContent } from './helpers'

interface MessageCardProps {
  msg:         RealMsg
  defaultOpen: boolean
  onOpen?:     (id: string) => void
}

export function MessageCard({ msg, defaultOpen, onOpen }: MessageCardProps) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [showFull, setShowFull] = useState(false)

  const isOut       = msg.direction === 'outbound'
  const fullBody    = msg.body_text ?? ''
  const stripped    = stripQuotedContent(fullBody)
  const hasQuoted   = stripped.length < fullBody.trim().length
  const senderLabel = isOut ? 'Trade Risk Solutions' : (msg.from_address ?? '—')
  const initial     = isOut ? 'T' : (msg.from_address?.[0] ?? '?').toUpperCase()

  function expand() {
    setOpen(true)
    onOpen?.(msg.id)
  }

  // ── Collapsed state: clean single-line preview row (not a bubble) ──
  if (!open) {
    const preview = (() => {
      const raw = stripped.split('\n').find(l => l.trim()) || msg.subject || '—'
      return raw.length > 90 ? raw.slice(0, 88) + '…' : raw
    })()

    return (
      <button
        onClick={expand}
        className={cn(
          'w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg',
          'border border-[--border-subtle] bg-card hover:bg-accent/30 transition-colors',
          'group',
        )}
      >
        <Avatar initial={initial} isOut={isOut} size="sm" />
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className={cn(
            'text-[12px] font-semibold flex-shrink-0',
            isOut ? 'text-primary' : 'text-foreground',
          )}>
            {isOut ? 'You' : senderLabel.split('@')[0]}
          </span>
          <span className="text-[12px] text-muted-foreground truncate flex-1">{preview}</span>
        </div>
        <span className="text-[10.5px] text-muted-foreground tabular-nums flex-shrink-0">
          {fmtDateTime(msg.sent_at)}
        </span>
        <ChevronDown size={13} className="text-muted-foreground/50 flex-shrink-0 group-hover:text-muted-foreground transition-colors" />
      </button>
    )
  }

  // ── Expanded state: full readable card ──
  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        'bg-card',
        isOut
          ? 'border-primary/15 shadow-[0_1px_3px_rgba(12,51,138,0.06),0_4px_12px_rgba(12,51,138,0.07)]'
          : 'border-[--border-subtle] shadow-[var(--shadow-card)]',
      )}
    >
      {/* Card header */}
      <button
        onClick={() => { onOpen?.(msg.id); setOpen(false) }}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'border-b hover:bg-muted/30 transition-colors cursor-pointer',
          isOut ? 'border-primary/10' : 'border-[--border-subtle]',
        )}
      >
        <Avatar initial={initial} isOut={isOut} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              'text-[13px] font-semibold tracking-tight',
              isOut ? 'text-primary' : 'text-foreground',
            )}>
              {senderLabel}
            </span>
            <DirectionChip isOut={isOut} />
          </div>
          {msg.subject && (
            <p className="text-[11.5px] text-muted-foreground truncate">{msg.subject}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDateTime(msg.sent_at)}</span>
          <ChevronDown size={13} className="text-muted-foreground/50 rotate-180" />
        </div>
      </button>

      {/* Card body */}
      <div className="px-5 pt-4 pb-5">
        {/* To / CC metadata — only shown for outbound or when CC'd */}
        {(msg.to.length > 0 || msg.cc.length > 0) && (
          <div className="flex flex-col gap-1 mb-4 pb-3 border-b border-[--border-subtle]">
            {msg.to.length > 0 && (
              <MetaRow label="To" value={msg.to.join(', ')} />
            )}
            {msg.cc.length > 0 && (
              <MetaRow label="CC" value={msg.cc.join(', ')} />
            )}
          </div>
        )}

        {/* Message body */}
        <div
          className={cn(
            'text-[13.5px] text-foreground leading-[1.85] whitespace-pre-wrap break-words overflow-wrap-anywhere',
            !showFull && 'max-h-[320px] overflow-y-auto',
          )}
        >
          {showFull ? fullBody : stripped}
        </div>

        {hasQuoted && (
          <button
            onClick={() => setShowFull(v => !v)}
            className="mt-3 text-[11px] text-muted-foreground hover:text-foreground border border-[--border-subtle] rounded-md px-2.5 py-1 transition-colors"
          >
            {showFull ? '↑ Hide quoted content' : '↓ Show full thread'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function Avatar({ initial, isOut, size }: { initial: string; isOut: boolean; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[12px]'
  return (
    <div className={cn(
      'rounded-full flex-shrink-0 flex items-center justify-center font-bold',
      dim,
      isOut ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
    )}>
      {initial}
    </div>
  )
}

function DirectionChip({ isOut }: { isOut: boolean }) {
  return (
    <span className={cn(
      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
      isOut
        ? 'bg-primary/8 text-primary'
        : 'bg-muted text-muted-foreground',
    )}>
      {isOut ? 'Sent' : 'Received'}
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 w-6 flex-shrink-0">
        {label}
      </span>
      <span className="text-[11.5px] text-muted-foreground break-all">{value}</span>
    </div>
  )
}
