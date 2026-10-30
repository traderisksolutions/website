'use client'

/**
 * Read a thread without leaving the page: latest message open, earlier ones collapsed.
 * "Go to inbox" (top right) opens the same thread in the Inbox to reply.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/crm/primitives'
import { MessageBlock } from './MessageBlock'
import type { RealMsg, ThreadState } from './types'

export function ThreadModal({ threadId, onClose }: { threadId: string | null; onClose: () => void }) {
  const [state, setState] = useState<Pick<ThreadState, 'thread' | 'messages' | 'error'> | null>(null)

  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    setState(null)
    fetch(`/api/engagement/thread?thread_id=${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => { if (!cancelled) setState({ thread: d.thread ?? null, messages: Array.isArray(d.messages) ? d.messages : [], error: null }) })
      .catch(() => { if (!cancelled) setState({ thread: null, messages: [], error: 'The thread could not be loaded.' }) })
    return () => { cancelled = true }
  }, [threadId])

  const messages: RealMsg[] = state?.messages ?? []
  const latest = messages.at(-1)
  const earlier = messages.slice(0, -1).reverse()
  const title = state?.thread?.display_subject || state?.thread?.subject || 'Thread'

  return (
    <Dialog open={threadId !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[860px] w-[calc(100vw-32px)] max-h-[86vh] p-0 gap-0 flex flex-col overflow-hidden">
        <header className="flex items-center gap-4 pl-6 pr-14 py-4 border-b border-[#e6e8e4]">
          <DialogTitle className="text-[17px] truncate min-w-0 flex-1">{title}</DialogTitle>
          {threadId && (
            <Link href={`/engagement?lead=${threadId}`} className="inline-flex items-center gap-1 text-[13.5px] font-medium whitespace-nowrap no-underline hover:underline text-[#132c1c]">
              Go to inbox <ArrowUpRight size={14} />
            </Link>
          )}
        </header>
        <div className="overflow-y-auto min-h-0 flex-1 px-6 py-4">
          {!state ? <Spinner label="Loading thread…" />
            : state.error ? <p className="m-0 text-[14px] text-destructive">{state.error}</p>
            : !latest ? <p className="m-0 text-[14px] text-muted-foreground">No messages on this thread.</p>
            : (
              <div className="flex flex-col gap-2">
                <MessageBlock key={latest.id} msg={latest} defaultOpen isLatest />
                {earlier.map(m => <MessageBlock key={m.id} msg={m} defaultOpen={false} />)}
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
