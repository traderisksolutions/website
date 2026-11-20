'use client'

import React from 'react'
import { Sparkles, X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'

export function MinimizedChatBar({ title, onRestore, onClose }: { title: string; onRestore: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 pl-3 pr-1.5 h-9 rounded border border-trs-line bg-white shadow-[0_8px_28px_-12px_rgba(16,24,40,0.28)]">
      <Btn level="tertiary" size="xs" onClick={onRestore} className="h-auto p-0 border-0 bg-transparent hover:bg-transparent justify-start gap-2 min-w-0 flex-1 text-left">
        <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-primary" />
        </span>
        <span className="text-small font-semibold text-trs-ink truncate">{title}</span>
      </Btn>
      <Btn level="tertiary" size="xs" onClick={onClose} aria-label="Close chat"
        className="w-8 px-0 flex-shrink-0">
        <X size={15} />
      </Btn>
    </div>
  )
}
