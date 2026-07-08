'use client'

import React, { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { ChatMessage } from '@/lib/chat/chat-types'
import { ChatMessageItem } from './chat-message-item'
import { ChatEmptyState } from './chat-empty-state'

export function FloatingChatBody({
  messages, sending, error, caseAware, onConfirm, onUndo, onPickPrompt, onRegenerate,
}: {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  caseAware: boolean
  onConfirm: (m: ChatMessage) => void
  onUndo: (m: ChatMessage) => void
  onPickPrompt: (p: string) => void
  onRegenerate: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const lastLen = messages.length ? messages[messages.length - 1].content.length : 0

  // Keep pinned to the newest message and to streaming token growth.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length, lastLen, sending])

  if (messages.length === 0 && !sending) {
    return <div className="flex-1 overflow-y-auto"><ChatEmptyState caseAware={caseAware} onPick={onPickPrompt} /></div>
  }

  const hasStreaming = messages.some(m => m.message_status === 'streaming')
  const lastMsg = messages[messages.length - 1]
  const regenId = !sending && lastMsg?.role === 'assistant' && lastMsg.message_status === 'complete' ? lastMsg.id : null
  return (
    <div className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-3">
      {messages.map(m => (
        <ChatMessageItem key={m.id} message={m} onConfirm={onConfirm} onUndo={onUndo} onRegenerate={m.id === regenId ? onRegenerate : undefined} />
      ))}
      {sending && !hasStreaming && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/60">
          <Loader2 size={12} className="animate-spin" /> Thinking…
        </div>
      )}
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <div ref={endRef} />
    </div>
  )
}
