'use client'

/**
 * Pieces the assistant screens share: case-type labels, the "Come back later" menu, and the two
 * modals a reviewer opens from a case (a thread, a data-room document).
 */
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Btn, Chip, Spinner } from '@/components/crm/primitives'
import { callApi, errText } from '@/components/placement/shared'
import { LATER_CHOICES, LATER_LABEL, type LaterChoice } from '@/lib/today/rules'
import type { ThreadView } from '@/lib/today/data'

export const CASE_TYPE: Record<string, string> = {
  claim: 'Claim', renewal: 'Renewal', new_quote: 'Quote', endorsement: 'Endorsement', member_movement: 'Members',
  premium_billing: 'Billing', documents: 'Documents', enquiry: 'Enquiry', other: 'Other',
}
export const STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'red' }> = {
  trs_to_act: { label: 'TRS to act', tone: 'amber' }, stalled: { label: 'Stalled', tone: 'red' },
  waiting_client: { label: 'Waiting on client', tone: 'neutral' }, waiting_insurer: { label: 'Waiting on insurer', tone: 'neutral' },
  done: { label: 'Done', tone: 'green' },
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
}
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' })
}

/** Sets "Come back later" on one item; calls back with the label chosen. */
export function LaterMenu({ itemId, onSet, onError, level = 'tertiary', size = 'xs', label = 'Later' }: {
  itemId: string; onSet: (label: string) => void; onError: (msg: string) => void
  level?: 'tertiary' | 'secondary'; size?: 'xs' | 'sm'; label?: string
}) {
  const [busy, setBusy] = useState(false)
  async function pick(c: LaterChoice) {
    setBusy(true)
    try { await callApi(`/api/work/${itemId}/later`, { method: 'POST', body: { choice: c } }); onSet(LATER_LABEL[c]) }
    catch (e) { onError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Btn level={level} size={size} loading={busy}>{label}</Btn>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LATER_CHOICES.map(c => <DropdownMenuItem key={c} onSelect={() => void pick(c)}>{LATER_LABEL[c]}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const dialogCls = 'w-[calc(100vw-24px)] max-w-[760px] max-h-[88vh] overflow-y-auto overflow-x-hidden p-0'

/** One email thread, oldest first. Messages rebuilt from a forward or quoted history are marked. */
export function ThreadModal({ threadId, onClose }: { threadId: string | null; onClose: () => void }) {
  const [thread, setThread] = useState<ThreadView | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!threadId) return
    setThread(null); setError(null)
    callApi<{ thread: ThreadView }>(`/api/today/thread/${threadId}`).then(d => setThread(d.thread)).catch(e => setError(errText(e)))
  }, [threadId])
  return (
    <Dialog open={!!threadId} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={dialogCls}>
        <div className="sticky top-0 z-10 bg-white border-b border-trs-line px-5 py-3 flex items-center justify-between gap-3">
          <DialogTitle className="m-0 text-[16px] font-medium truncate">{thread?.subject ?? 'Thread'}</DialogTitle>
          {threadId && <a className="text-[13px] text-trs-muted no-underline hover:underline shrink-0" href={`/engagement?thread=${threadId}`}>Open in Inbox</a>}
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {error && <p className="m-0 text-[13.5px] text-trs-neg">{error}</p>}
          {!thread && !error && <Spinner label="Loading the thread…" />}
          {thread?.messages.map((m, i) => (
            <article key={i} className={`rounded-[8px] border px-3.5 py-3 text-[13.5px] ${m.rebuilt ? 'border-dashed border-trs-line-2 bg-trs-canvas' : 'border-trs-line bg-white'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-trs-ink break-all">{m.from ?? 'Unknown sender'}</span>
                <span className="font-mono text-[11.5px] text-trs-muted">{fmtWhen(m.at)}</span>
              </div>
              {m.to.length > 0 && <div className="text-[12.5px] text-trs-muted break-all">To {m.to.join(', ')}</div>}
              {m.rebuilt && <div className="mt-1"><Chip tone="amber">{m.rebuilt === 'forward' ? 'From a forward' : 'Rebuilt from quoted history'}</Chip></div>}
              <pre className="m-0 mt-2 whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-trs-ink-2">{m.body || '(no text)'}</pre>
            </article>
          ))}
          {thread && thread.messages.length === 0 && <p className="m-0 text-[13.5px] text-trs-muted">No messages on file for this thread.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Drive's own preview of one data-room file; "Open in Drive" when the frame is refused. */
export function DocModal({ doc, onClose }: { doc: { title: string; drive_url: string | null } | null; onClose: () => void }) {
  const preview = doc?.drive_url ? doc.drive_url.replace(/\/view(\?.*)?$/, '/preview') : null
  return (
    <Dialog open={!!doc} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={dialogCls}>
        <div className="sticky top-0 z-10 bg-white border-b border-trs-line px-5 py-3 flex items-center justify-between gap-3">
          <DialogTitle className="m-0 text-[16px] font-medium truncate">{doc?.title ?? 'Document'}</DialogTitle>
          {doc?.drive_url && <a className="text-[13px] text-trs-muted no-underline hover:underline shrink-0" href={doc.drive_url} target="_blank" rel="noreferrer">Open in Drive</a>}
        </div>
        {preview
          ? <iframe title={doc?.title ?? 'Document'} src={preview} className="block w-full h-[70vh] border-0 bg-trs-canvas" />
          : <p className="m-0 px-5 py-4 text-[13.5px] text-trs-muted">This file is not in the data room yet.</p>}
      </DialogContent>
    </Dialog>
  )
}
