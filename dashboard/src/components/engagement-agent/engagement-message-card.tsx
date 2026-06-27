'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RealMsg } from '@/components/engagement/types'
import { fmtDateTime, stripQuotedContent } from '@/components/engagement/helpers'

interface EngagementMessageCardProps {
  msg:         RealMsg
  defaultOpen: boolean
  onOpen?:     (id: string) => void
}

export function EngagementMessageCard({ msg, defaultOpen, onOpen }: EngagementMessageCardProps) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [showFull, setShowFull] = useState(false)

  const isOut       = msg.direction === 'outbound'
  const fullBody    = msg.body_text ?? ''
  const stripped    = stripQuotedContent(fullBody)
  const hasQuoted   = stripped.length < fullBody.trim().length
  const senderLabel = isOut ? 'Trade Risk Solutions' : (msg.from_address ?? '—')
  const displayName = isOut
    ? 'You'
    : senderLabel.includes('@') ? senderLabel.split('@')[0] : senderLabel
  const initial     = isOut ? 'T' : (msg.from_address?.[0] ?? '?').toUpperCase()

  function expand() {
    setOpen(true)
    onOpen?.(msg.id)
  }

  // ── Collapsed: clean single-row preview ───────────────────────────────────
  if (!open) {
    const preview = (() => {
      const raw = stripped.split('\n').find(l => l.trim()) || msg.subject || '—'
      return raw.length > 90 ? raw.slice(0, 88) + '…' : raw
    })()

    return (
      <button
        onClick={expand}
        aria-expanded={false}
        aria-label={`Expand message from ${senderLabel}`}
        className={cn(
          'w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl',
          'border border-[--border-subtle] bg-card',
          'hover:bg-muted/30 transition-colors group',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30',
        )}
      >
        <CardAvatar initial={initial} isOut={isOut} size="sm" />
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <span className={cn(
            'text-[12px] font-semibold flex-shrink-0',
            isOut ? 'text-primary' : 'text-foreground',
          )}>
            {displayName}
          </span>
          <span className="text-[11.5px] text-muted-foreground/70 truncate flex-1 leading-snug">
            {preview}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/55 tabular-nums flex-shrink-0">
          {fmtDateTime(msg.sent_at)}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className="text-muted-foreground/35 flex-shrink-0 group-hover:text-muted-foreground/60 transition-colors"
        />
      </button>
    )
  }

  // ── Expanded: full readable card ──────────────────────────────────────────
  const bodyText = showFull ? fullBody : stripped

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden bg-card',
      isOut
        ? 'border-primary/12 shadow-[0_1px_2px_rgba(12,51,138,0.05),0_4px_16px_rgba(12,51,138,0.06)]'
        : 'border-[--border-subtle] shadow-[0_1px_2px_rgba(20,30,50,0.04),0_3px_10px_rgba(20,30,50,0.04)]',
    )}>

      {/* Header — click to collapse */}
      <button
        onClick={() => { onOpen?.(msg.id); setOpen(false) }}
        aria-expanded={true}
        aria-label={`Collapse message from ${senderLabel}`}
        className={cn(
          'w-full flex items-start gap-3.5 px-5 py-3.5 text-left',
          'border-b transition-colors cursor-pointer',
          'hover:bg-muted/15 focus-visible:outline-none',
          isOut ? 'border-primary/8' : 'border-[--border-subtle]',
        )}
      >
        <CardAvatar initial={initial} isOut={isOut} size="md" />

        <div className="flex-1 min-w-0 pt-[1px]">
          {/* Sender + direction chip */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              'text-[13px] font-semibold tracking-tight leading-tight',
              isOut ? 'text-primary' : 'text-foreground',
            )}>
              {senderLabel}
            </span>
            <span className={cn(
              'text-[8.5px] font-bold px-1.5 py-[2px] rounded-sm leading-tight uppercase tracking-wide',
              isOut
                ? 'bg-primary/6 text-primary'
                : 'bg-muted text-muted-foreground/80',
            )}>
              {isOut ? 'Sent' : 'Recv'}
            </span>
          </div>
          {/* Subject — show only when it adds context (e.g., forwarded) */}
          {msg.subject && (
            <p className="text-[11px] text-muted-foreground/65 m-0 truncate">{msg.subject}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 pt-[1px]">
          <span className="text-[10.5px] text-muted-foreground/60 tabular-nums">
            {fmtDateTime(msg.sent_at)}
          </span>
          <ChevronDown size={12} strokeWidth={2} className="text-muted-foreground/35 rotate-180 flex-shrink-0" />
        </div>
      </button>

      {/* Body */}
      <div className="px-5 pt-4 pb-5">
        {/* To / CC metadata */}
        {(msg.to.length > 0 || msg.cc.length > 0) && (
          <div className="flex flex-col gap-1 mb-4 pb-3.5 border-b border-[--border-subtle]/50">
            {msg.to.length > 0 && <CardMetaRow label="To" value={msg.to.join(', ')} />}
            {msg.cc.length > 0 && <CardMetaRow label="CC" value={msg.cc.join(', ')} />}
          </div>
        )}

        {/* Email body — no artificial height cap; EaMessageArea handles scroll */}
        <div className="text-[13.5px] text-foreground/85 leading-[1.85] whitespace-pre-wrap break-words">
          {bodyText}
        </div>

        {/* Quoted content toggle */}
        {hasQuoted && (
          <button
            onClick={() => setShowFull(v => !v)}
            className={cn(
              'mt-3.5 flex items-center gap-1.5',
              'text-[10.5px] text-muted-foreground/55 hover:text-muted-foreground',
              'border border-[--border-subtle] rounded-md px-2.5 py-1 transition-colors',
            )}
          >
            <ChevronDown
              size={10}
              strokeWidth={2}
              className={cn('transition-transform flex-shrink-0', showFull && 'rotate-180')}
            />
            {showFull ? 'Hide quoted' : 'Show full thread'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function CardAvatar({
  initial, isOut, size,
}: { initial: string; isOut: boolean; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[12px]'
  return (
    <div className={cn(
      'rounded-full flex-shrink-0 flex items-center justify-center font-bold select-none',
      dim,
      isOut ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
    )}>
      {initial}
    </div>
  )
}

function CardMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 items-baseline">
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/45 w-5 flex-shrink-0">
        {label}
      </span>
      <span className="text-[11px] text-muted-foreground/65 break-all">{value}</span>
    </div>
  )
}
