'use client'

import React from 'react'
import { Minus, X, Sparkles } from 'lucide-react'

export function FloatingChatHeader({
  title, subtitle, onMinimize, onClose,
}: {
  title: string; subtitle?: string | null; onMinimize: () => void; onClose: () => void
}) {
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
        <button onClick={onMinimize} aria-label="Minimise chat"
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Minus size={15} />
        </button>
        <button onClick={onClose} aria-label="Close chat"
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
