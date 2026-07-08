'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, RefreshCw, Mail, PencilLine, Check } from 'lucide-react'
import type { ChatMessage, ProposedAction } from '@/lib/chat/chat-types'

function actionLabel(a: ProposedAction): { label: string; icon: React.ReactNode } {
  if (a.type === 'reanalyze')   return { label: a.label ?? 'Re-analyse with these changes', icon: <RefreshCw size={12} /> }
  if (a.type === 'draft_email') return { label: a.label ?? 'Draft this in Engagement',       icon: <Mail size={12} /> }
  return { label: a.label ?? 'Apply case change', icon: <PencilLine size={12} /> }
}

export function ChatMessageItem({ message, onConfirm }: { message: ChatMessage; onConfirm: (m: ChatMessage) => void }) {
  const isUser = message.role === 'user'
  const action = message.metadata_json?.action
  const done   = message.metadata_json?.action_done
  const citations = message.citations_json ?? []
  const streaming = message.message_status === 'streaming'

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {!isUser && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">
          <Sparkles size={10} className="text-primary" /> Consultant
        </span>
      )}
      <div className={cn(
        'max-w-[86%] rounded-2xl px-3 py-2 text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words',
        isUser ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted/60 text-foreground rounded-bl-sm',
      )}>
        {streaming && !message.content ? (
          <span className="inline-flex gap-1 py-0.5" aria-label="Assistant is thinking">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ) : (
          <>
            {message.content}
            {streaming && <span className="inline-block w-[2px] h-3.5 ml-0.5 align-middle bg-foreground/60 animate-pulse" />}
          </>
        )}
      </div>

      {citations.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[86%]">
          {citations.map((c, i) => (
            <span key={i} className="text-[10px] rounded-full border border-[--border-subtle] bg-card px-1.5 py-0.5 text-muted-foreground/70">
              {c.label}
            </span>
          ))}
        </div>
      )}

      {action && (
        done ? (
          <span className="flex items-center gap-1 text-[10.5px] font-medium text-emerald-600"><Check size={11} /> Done</span>
        ) : (
          <button
            onClick={() => onConfirm(message)}
            className="flex items-center gap-1.5 text-[11px] font-semibold rounded-lg border border-primary/30 bg-primary/5 text-primary px-2.5 py-1.5 hover:bg-primary/10 transition-colors"
          >
            {actionLabel(action).icon} {actionLabel(action).label}
          </button>
        )
      )}
    </div>
  )
}
