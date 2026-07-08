'use client'

import React from 'react'
import { Sparkles, X } from 'lucide-react'

export function MinimizedChatBar({ title, onRestore, onClose }: { title: string; onRestore: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 pl-3 pr-1.5 h-11 rounded-xl border border-[--border-subtle] bg-card"
      style={{ boxShadow: '0 8px 28px -12px rgba(16,24,40,0.28)' }}>
      <button onClick={onRestore} className="flex items-center gap-2 min-w-0 flex-1 text-left focus:outline-none">
        <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-primary" />
        </span>
        <span className="text-[12.5px] font-semibold text-foreground truncate">{title}</span>
      </button>
      <button onClick={onClose} aria-label="Close chat"
        className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <X size={15} />
      </button>
    </div>
  )
}
