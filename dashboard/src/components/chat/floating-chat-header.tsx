'use client'

import React from 'react'
import { Minus, X, Sparkles, History, SquarePen } from 'lucide-react'

export function FloatingChatHeader({
  title, subtitle, historyActive, onHistory, onNewChat, onMinimize, onClose,
}: {
  title: string; subtitle?: string | null
  historyActive?: boolean
  onHistory: () => void; onNewChat: () => void; onMinimize: () => void; onClose: () => void
}) {
  const iconBtn = 'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-[--border-subtle] bg-card rounded-t-xl">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground/60 leading-tight truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button onClick={onNewChat} aria-label="New chat" title="New chat" className={iconBtn}>
          <SquarePen size={14} />
        </button>
        <button onClick={onHistory} aria-label="Chat history" title="Chat history"
          className={`${iconBtn} ${historyActive ? 'text-primary bg-primary/10' : ''}`}>
          <History size={15} />
        </button>
        <span className="w-px h-4 bg-border mx-0.5" />
        <button onClick={onMinimize} aria-label="Minimise chat" className={iconBtn}>
          <Minus size={15} />
        </button>
        <button onClick={onClose} aria-label="Close chat" className={iconBtn}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
