'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Reply, ReplyAll, MoreHorizontal, PanelRight, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead } from './types'
import { fullName } from './helpers'
import { LinkCompanyPopover } from './LinkCompanyPopover'

/**
 * The reader header: subject, then who wrote, then one context line (company · type · state ·
 * owner · link). Reply is the one filled button; Reply all, Context and More are icon buttons.
 * No state colour, no shadow: a hairline under it is enough.
 */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'

const TYPE_LABEL: Record<string, string> = { renewal: 'Renewal', claim: 'Claim', rfq: 'Quotation request', group_benefits: 'Group benefits', finance: 'Finance', new_business: 'New business', general: 'General' }

const ICON_BTN = 'h-9 w-9 rounded-[10px] bg-transparent border-0 cursor-pointer inline-flex items-center justify-center hover:bg-[#f1f3f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]'
const MENU_ITEM = 'w-full text-left px-3 py-2 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer inline-flex items-center gap-2 hover:bg-[#f8f9fa] no-underline'

export function ThreadHeader({ subject, lead, needsReply, lastDirection, ownerName, onBack, onReply, onReplyAll, onAddTask, onDelete, deleting, contextOpen, onToggleContext }: {
  subject: string | null
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
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setMenu(false); setConfirm(false) } }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setConfirm(false); menuBtn.current?.focus() } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [menu])

  const contact = fullName(lead)
  const state = needsReply ? 'Awaiting your reply' : lastDirection === 'outbound' ? 'Awaiting client reply' : null
  const threadId = lead.thread_id ?? (lead.source === 'thread' ? lead.id : null)
  const type = lead.category ? TYPE_LABEL[lead.category] ?? lead.category : null

  const parts: React.ReactNode[] = []
  if (lead.companyId) parts.push(<Link key="co" href={`/companies?company=${lead.companyId}`} className="no-underline hover:underline underline-offset-[3px] decoration-[#9aa0a6]" style={{ color: INK }}>{lead.companyName ?? 'Company'}</Link>)
  if (type) parts.push(<span key="type">{type}</span>)
  if (state) parts.push(<span key="state">{state}</span>)
  if (ownerName) parts.push(<span key="owner">Owner {ownerName}</span>)
  if (!lead.companyId) {
    parts.push(<span key="unlinked">Not linked to a company</span>)
    if (threadId) parts.push(<LinkCompanyPopover key="link" threadId={threadId} />)
  }

  return (
    <header className="flex-shrink-0 bg-white px-5 sm:px-10 pt-5 pb-4" style={{ borderBottom: `1px solid ${HAIR}` }}>
      <div className="max-w-[min(1040px,100%)] mx-auto">
        {onBack && <button type="button" onClick={onBack} className="lg:hidden inline-flex items-center gap-1.5 text-[13px] bg-transparent border-0 p-0 cursor-pointer mb-3 hover:underline underline-offset-[3px]" style={{ color: MUTED }}><ArrowLeft size={13} /> All conversations</button>}

        <div className="flex items-start justify-between gap-x-5 gap-y-3 flex-wrap">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="m-0 text-[22px] font-medium leading-[1.25] tracking-[-0.02em] line-clamp-2" style={{ color: INK, textWrap: 'balance' }}>{subject ?? contact}</h1>
            <p className="m-0 mt-2 text-[14px] truncate" style={{ color: BODY }}>
              {contact}{lead.email && <span style={{ color: FAINT }}> · {lead.email}</span>}
            </p>
            <p className="m-0 mt-1.5 text-[13.5px] flex items-center gap-x-1.5 gap-y-0.5 flex-wrap" style={{ color: MUTED }}>
              {parts.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span aria-hidden style={{ color: DOT }}>·</span>}{p}</span>)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={onReply} className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer inline-flex items-center gap-2 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#202124]" style={{ background: INK }}><Reply size={15} /> Reply</button>
            <button type="button" onClick={onReplyAll} title="Reply all" aria-label="Reply all" className={ICON_BTN} style={{ color: BODY }}><ReplyAll size={17} /></button>
            <button type="button" onClick={onToggleContext} aria-pressed={contextOpen} title={contextOpen ? 'Hide context' : 'Show context'} aria-label="Context rail" className={cn(ICON_BTN, contextOpen && 'bg-[#f1f3f4]')} style={{ color: contextOpen ? INK : BODY }}><PanelRight size={17} /></button>
            <div ref={ref} className="relative">
              <button ref={menuBtn} type="button" onClick={() => setMenu(v => !v)} aria-expanded={menu} aria-haspopup="menu" title="More actions" aria-label="More actions" className={ICON_BTN} style={{ color: BODY }}><MoreHorizontal size={17} /></button>
              {menu && (
                <div role="menu" aria-label="More actions" className="absolute right-0 top-full mt-1.5 w-60 rounded-[12px] bg-white p-1.5 z-30" style={{ border: `1px solid ${HAIR}`, boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }}>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onAddTask() }} className={MENU_ITEM} style={{ color: INK }}><Plus size={14} /> Add to-do</button>
                  {lead.companyId && <Link href={`/companies?company=${lead.companyId}`} role="menuitem" className={cn(MENU_ITEM, 'block')} style={{ color: INK }}>Open company page</Link>}
                  <div className="my-1" style={{ borderTop: `1px solid ${HAIR}` }} />
                  {confirm
                    ? <div className="px-3 py-2 flex items-center justify-between gap-2 text-[13px]"><span style={{ color: BODY }}>Delete this thread?</span>
                        <span className="flex items-center gap-2.5">
                          <button type="button" onClick={() => { void onDelete(); setMenu(false); setConfirm(false) }} disabled={deleting} className="text-[13px] font-medium bg-transparent border-0 p-0 cursor-pointer disabled:opacity-50 underline underline-offset-[3px]" style={{ color: '#c5221f' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
                          <button type="button" onClick={() => setConfirm(false)} className="text-[13px] bg-transparent border-0 p-0 cursor-pointer" style={{ color: MUTED }}>Cancel</button>
                        </span></div>
                    : <button type="button" role="menuitem" onClick={() => setConfirm(true)} className={MENU_ITEM} style={{ color: BODY }}><Trash2 size={14} /> Delete thread</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
