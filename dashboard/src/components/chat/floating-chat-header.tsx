'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Minus, X, Sparkles, History, SquarePen } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { Input } from '@/components/ui/input'

export function FloatingChatHeader({
  title, subtitle, historyActive, editable, onRename, onHistory, onNewChat, onMinimize, onClose,
}: {
  title: string; subtitle?: string | null
  historyActive?: boolean
  editable?: boolean
  onRename?: (v: string) => void
  onHistory: () => void; onNewChat: () => void; onMinimize: () => void; onClose: () => void
}) {
  const iconBtn = 'h-7 w-7 px-0'
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) { setValue(title); inputRef.current?.focus(); inputRef.current?.select() } }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const v = value.trim()
    if (v && v !== title) onRename?.(v)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-trs-line bg-white rounded-t">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') setEditing(false) }}
              aria-label="Rename chat"
              className="h-7 text-small font-semibold px-1.5 py-0.5 leading-tight"
            />
          ) : editable ? (
            <Btn
              level="tertiary"
              size="xs"
              onClick={() => setEditing(true)}
              title="Rename chat"
              className="h-auto p-0 border-0 bg-transparent hover:bg-transparent text-small font-semibold text-trs-ink leading-tight truncate block max-w-full text-left hover:text-trs-green"
            >
              {title}
            </Btn>
          ) : (
            <p className="text-small font-semibold text-trs-ink leading-tight truncate">{title}</p>
          )}
          {subtitle && !editing && <p className="text-small text-trs-muted leading-tight truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Btn level="tertiary" size="xs" onClick={onNewChat} aria-label="New chat" title="New chat" className={iconBtn}>
          <SquarePen size={14} />
        </Btn>
        <Btn level="tertiary" size="xs" onClick={onHistory} aria-label="Chat history" title="Chat history"
          className={`${iconBtn} ${historyActive ? 'text-trs-green bg-trs-soft' : ''}`}>
          <History size={15} />
        </Btn>
        <span className="w-px h-4 bg-border mx-0.5" />
        <Btn level="tertiary" size="xs" onClick={onMinimize} aria-label="Minimise chat" className={iconBtn}>
          <Minus size={15} />
        </Btn>
        <Btn level="tertiary" size="xs" onClick={onClose} aria-label="Close chat" className={iconBtn}>
          <X size={15} />
        </Btn>
      </div>
    </div>
  )
}
