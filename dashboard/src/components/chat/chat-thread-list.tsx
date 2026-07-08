'use client'

import React from 'react'
import { Plus, Archive, MessageSquare, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatThread } from '@/lib/chat/chat-types'

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

export function ChatThreadList({
  threads, activeThreadId, onOpen, onNew, onArchive,
}: {
  threads: ChatThread[]
  activeThreadId: string | null
  onOpen: (t: ChatThread) => void
  onNew: () => void
  onArchive: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <button
        onClick={onNew}
        className="flex items-center gap-2 m-2.5 mb-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[12px] font-semibold hover:bg-primary/10 transition-colors"
      >
        <Plus size={14} /> New chat
      </button>

      {threads.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground/60 text-center px-5 py-8">No previous chats yet.</p>
      ) : (
        <div className="flex flex-col px-1.5 pb-2">
          {threads.map(t => {
            const active = t.id === activeThreadId
            return (
              <div key={t.id}
                className={cn('group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
                  active ? 'bg-primary/10' : 'hover:bg-muted/60')}
                onClick={() => onOpen(t)}>
                <MessageSquare size={13} className={cn('flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground/50')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[12px] truncate', active ? 'font-semibold text-foreground' : 'text-foreground/85')}>
                    {t.title || 'New chat'}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/55">
                    <span>{timeAgo(t.last_message_at ?? t.updated_at)}</span>
                    {t.case_id && <span className="inline-flex items-center gap-0.5"><Briefcase size={9} /> case</span>}
                    {t.status === 'minimized' && <span>· minimised</span>}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onArchive(t.id) }}
                  aria-label="Archive chat"
                  title="Archive"
                  className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <Archive size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
