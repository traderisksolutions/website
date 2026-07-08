'use client'

import React, { useRef, useEffect } from 'react'
import { ArrowUp, Square } from 'lucide-react'

export function FloatingChatComposer({
  draft, sending, onChange, onSend, onStop,
}: {
  draft: string; sending: boolean; onChange: (v: string) => void; onSend: () => void; onStop: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Autosize up to a cap.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [draft])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  return (
    <div className="border-t border-[--border-subtle] p-2.5">
      <div className="flex items-end gap-2 rounded-xl border border-[--border-subtle] bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/25">
        <textarea
          ref={ref}
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message the consultant…  (Enter to send, Shift+Enter for a new line)"
          aria-label="Message the consultant"
          className="flex-1 resize-none bg-transparent text-[12.5px] leading-[1.5] outline-none placeholder:text-muted-foreground/50 max-h-[140px]"
        />
        {sending ? (
          <button
            onClick={onStop}
            aria-label="Stop generating"
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-foreground/80 text-background flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ArrowUp size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
