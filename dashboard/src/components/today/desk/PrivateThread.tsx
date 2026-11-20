'use client'

/**
 * Ring-fence (Jarod, 20 Nov 2026): a thread whose mail lives only in a colleague's private inbox
 * is listed with its subject and status, but opening it shows "This email lives in <Name>'s inbox."
 * with Close and Ask <Name>. Ask copies the thread's link to send to that person; it drafts and
 * sends nothing. The server keeps refusing the mail itself (visibility-server.ts).
 */
import Link from 'next/link'
import { useCallback } from 'react'
import { ExternalLink, Lock } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { useConfirm } from '@/components/ui/confirm'
import { threadHref, type PrivateInbox } from '@/lib/today/desk'

/** Opens the ring-fence modal for a thread; resolves with a notice when the link was copied. */
export function usePrivateThread() {
  const confirm = useConfirm()
  return useCallback(async (threadId: string, owner: PrivateInbox | { name: string }): Promise<string | null> => {
    const name = owner.name || 'a colleague'
    const ask = await confirm({ title: `This email lives in ${name}’s inbox.`, action: `Ask ${name}`, cancel: 'Close' })
    if (!ask) return null
    const link = `${window.location.origin}${threadHref(threadId)}`
    try { await navigator.clipboard.writeText(link); return `Link copied. Send it to ${name}.` }
    catch { return `Copy this link for ${name}: ${link}` }
  }, [confirm])
}

/** A thread's subject: a link when the viewer may open it, else the ring-fence modal. */
export function ThreadTitle({ threadId, subject, owner, onNotice, className = '' }: {
  threadId: string; subject: string; owner: PrivateInbox | null | undefined; onNotice?: (m: string) => void; className?: string
}) {
  const openPrivate = usePrivateThread()
  if (!owner) return <Link href={threadHref(threadId)} className={`font-medium text-trs-ink ${className}`}>{subject}</Link>
  return (
    <Btn size="xs" level="tertiary" className={`!h-auto !px-0 !font-medium !text-trs-ink ${className}`} title={`In ${owner.name}’s inbox`}
      onClick={async () => { const m = await openPrivate(threadId, owner); if (m) onNotice?.(m) }}>
      <Lock size={12} aria-hidden /> {subject}
    </Btn>
  )
}

/** "Open thread" for a card: a new-tab link, or the ring-fence modal. */
export function OpenThread({ threadId, owner, onNotice }: { threadId: string; owner: PrivateInbox | null | undefined; onNotice?: (m: string) => void }) {
  const openPrivate = usePrivateThread()
  if (!owner) return <Link href={threadHref(threadId)} target="_blank" className="inline-flex items-center gap-1 text-xs text-trs-green-2 underline-offset-[3px] hover:underline"><ExternalLink size={12} aria-hidden /> Open thread</Link>
  return (
    <Btn size="xs" level="tertiary" className="!h-auto !px-0 text-xs" onClick={async () => { const m = await openPrivate(threadId, owner); if (m) onNotice?.(m) }}>
      <Lock size={12} aria-hidden /> Open thread
    </Btn>
  )
}
