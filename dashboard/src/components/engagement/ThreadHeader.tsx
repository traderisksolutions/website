'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Reply, ReplyAll, MoreHorizontal, PanelRight, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead } from './types'
import { fullName } from './helpers'
import { LinkCompanyPopover } from './LinkCompanyPopover'
import { cleanSubject } from '@/lib/crm/subject'
import { useConfirm } from '@/components/ui/confirm'
import { Btn } from '@/components/crm/primitives'

/**
 * The reader header: subject, then who wrote, then one context line (company · type · state ·
 * owner · link). Reply is the one filled button; Reply all, Context and More are icon buttons.
 * No state colour, no shadow: a hairline under it is enough.
 */

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quotation request', group_benefits: 'Group benefits', finance: 'Finance', new_business: 'New business', general: 'General' }

/** Icon-only buttons in the header: a 32px square, ink-2 icon, field tint on hover. */
const ICON_BTN = 'w-8 px-0 border-0 text-trs-ink-2 hover:bg-trs-field hover:text-trs-ink-2'
const MENU_ITEM = 'w-full text-left px-3 py-2 rounded text-body bg-transparent border-0 cursor-pointer inline-flex items-center gap-2 hover:bg-trs-tint no-underline'
/** The menu item as a Btn: the button chrome removed, MENU_ITEM's shape kept. */
const MENU_BTN = cn(MENU_ITEM, 'h-auto justify-start font-normal')

export function ThreadHeader({ subject, displaySubject, lead, needsReply, lastDirection, ownerName, onBack, onReply, onReplyAll, onAddTask, onDelete, deleting, contextOpen, onToggleContext }: {
  /** Raw thread subject; kept in the heading's tooltip. */
  subject: string | null
  /** Housekeeping agent's title (email_threads.display_subject). Shown first when set. */
  displaySubject?: string | null
  lead: Lead
  needsReply: boolean
  lastDirection: 'inbound' | 'outbound' | null
  ownerName: string | null
  /** Kept for callers; the header no longer changes on scroll (the hairline is enough). */
  elevated?: boolean
  onBack?: () => void
  onReply: () => void
  onReplyAll: () => void
  onAddTask: () => void
  onDelete: () => Promise<void> | void
  deleting: boolean
  contextOpen: boolean
  onToggleContext: () => void
}) {
  const [menu, setMenu] = useState(false)
  const confirm = useConfirm()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false) }
    // Btn takes no ref: the More button is found inside the menu's wrapper.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); ref.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus() } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [menu])

  async function askDelete() {
    setMenu(false)
    const ok = await confirm({ title: 'Delete this thread?', body: 'It leaves the Inbox and the company page. The emails stay in Gmail.', action: 'Delete', danger: true })
    if (ok) await onDelete()
  }

  const contact = fullName(lead)
  const heading = displaySubject?.trim() || (subject?.trim() ? cleanSubject(subject) : null) || contact
  const state = needsReply ? 'Awaiting your reply' : lastDirection === 'outbound' ? 'Awaiting client reply' : null
  const threadId = lead.thread_id ?? (lead.source === 'thread' ? lead.id : null)
  const type = lead.category ? TYPE_LABEL[lead.category] ?? lead.category : null

  const parts: React.ReactNode[] = []
  if (lead.companyId) parts.push(<Link key="co" href={`/companies/${lead.companyId}`} className="no-underline hover:underline underline-offset-[3px] decoration-trs-subtle text-trs-ink" >{lead.companyName ?? 'Company'}</Link>)
  if (type) parts.push(<span key="type">{type}</span>)
  if (state) parts.push(<span key="state">{state}</span>)
  if (ownerName) parts.push(<span key="owner">Owner {ownerName}</span>)
  if (!lead.companyId) {
    parts.push(<span key="unlinked">Not linked to a company</span>)
    if (threadId) parts.push(<LinkCompanyPopover key="link" threadId={threadId} />)
  }

  return (
    <header className="flex-shrink-0 bg-white px-5 sm:px-10 pt-4 pb-2">
      <div className="max-w-[min(760px,100%)] mx-auto">
        {onBack && <Btn level="tertiary" size="xs" onClick={onBack} className="lg:hidden h-auto gap-1.5 text-body font-normal bg-transparent border-0 p-0 mb-3 hover:bg-transparent hover:underline underline-offset-[3px] text-trs-muted hover:text-trs-muted" ><ArrowLeft size={13} /> All conversations</Btn>}

        <div className="flex items-start justify-between gap-x-5 gap-y-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="m-0 text-heading font-semibold leading-[1.3] line-clamp-2 text-trs-ink [text-wrap:balance]" title={subject ?? undefined}>{heading}</h1>
            <p className="m-0 mt-1.5 text-body truncate text-trs-ink-2" >
              {contact}{lead.email && <span className="text-trs-subtle"> · {lead.email}</span>}
            </p>
            <p className="m-0 mt-1 text-body flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-trs-muted" >
              {parts.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span aria-hidden className="text-trs-subtle">·</span>}{p}</span>)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Btn level="primary" size="xs" onClick={onReply}><Reply size={14} /> Reply</Btn>
            <Btn level="tertiary" size="xs" onClick={onReplyAll} title="Reply all" aria-label="Reply all" className={ICON_BTN}><ReplyAll size={17} /></Btn>
            <Btn level="tertiary" size="xs" onClick={onToggleContext} aria-pressed={contextOpen} title={contextOpen ? 'Hide context' : 'Show context'} aria-label="Context rail" className={cn(ICON_BTN, contextOpen && 'bg-trs-field text-trs-ink hover:text-trs-ink')}><PanelRight size={17} /></Btn>
            <div ref={ref} className="relative">
              <Btn level="tertiary" size="xs" onClick={() => setMenu(v => !v)} aria-expanded={menu} aria-haspopup="menu" title="More actions" aria-label="More actions" className={ICON_BTN}><MoreHorizontal size={17} /></Btn>
              {menu && (
                <div role="menu" aria-label="More actions" className="absolute right-0 top-full mt-1.5 w-60 rounded bg-white p-1.5 z-30 border border-trs-line shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
                  <Btn level="tertiary" size="xs" role="menuitem" onClick={() => { setMenu(false); onAddTask() }} className={cn(MENU_BTN, 'text-trs-ink hover:text-trs-ink')}><Plus size={14} /> Add to-do</Btn>
                  {lead.companyId && <Link href={`/companies/${lead.companyId}`} role="menuitem" className={cn(MENU_ITEM, 'block text-trs-ink')}>Open company page</Link>}
                  <div className="my-1 border-t border-trs-line" />
                  <Btn level="tertiary" size="xs" role="menuitem" disabled={deleting} onClick={() => void askDelete()} className={cn(MENU_BTN, 'text-trs-ink-2 hover:text-trs-ink-2')}><Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete thread'}</Btn>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
