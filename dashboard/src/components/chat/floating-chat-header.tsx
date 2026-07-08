'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Minus, X, Sparkles, History, SquarePen } from 'lucide-react'

export function FloatingChatHeader({
  title, subtitle, historyActive, editable, onRename, onHistory, onNewChat, onMinimize, onClose,
}: {
  title: string; subtitle?: string | null
  historyActive?: boolean
  editable?: boolean
  onRename?: (v: string) => void
  onHistory: () => void; onNewChat: () => void; onMinimize: () => void; onClose: () => void
}) {
  const iconBtn = 'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
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
    <div className="flex items-center justify-between gap-2 px-3.5 h-11 border-b border-[--border-subtle] bg-card rounded-t-xl">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} className="text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') setEditing(false) }}
              aria-label="Rename chat"
              className="w-full text-[12.5px] font-semibold rounded border border-primary/40 bg-background px-1.5 py-0.5 leading-tight outline-none"
            />
          ) : editable ? (
            <button
              onClick={() => setEditing(true)}
              title="Rename chat"
              className="text-[12.5px] font-semibold text-foreground leading-tight truncate max-w-full text-left hover:text-primary transition-colors"
            >
              {title}
            </button>
          ) : (
            <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate">{title}</p>
          )}
          {subtitle && !editing && <p className="text-[10px] text-muted-foreground/60 leading-tight truncate">{subtitle}</p>}
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
