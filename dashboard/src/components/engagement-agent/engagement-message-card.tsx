'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RealMsg } from '@/components/engagement/types'
import { fmtWhen, stripQuotedContent, parseAddress, initialOf, formatBytes, fileBadge } from '@/components/engagement/helpers'
import { cleanEmailBody } from '@/lib/clean-email-body'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'

/**
 * One email on the company page (CompanyMail). Renders the way engagement/MessageBlock renders
 * the latest message: avatar, name, to-line, timestamp, then the body through `.email-html-body`
 * and attachments as document cards. Earlier messages are one-line rows that open in place.
 * Same props as before; the tint and the SENT/RECV chips are gone, the words carry the state.
 */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'
const FIELD = '#f1f3f4'

const LINK = 'underline decoration-[#9aa0a6] underline-offset-[3px] cursor-pointer bg-transparent border-0 p-0 font-[inherit]'

interface EngagementMessageCardProps {
  msg:         RealMsg
  defaultOpen: boolean
  /** The most recent message in the thread renders in full (header + body always open). */
  isLatest?:   boolean
  onOpen?:     (id: string) => void
}

export function EngagementMessageCard({ msg, defaultOpen, isLatest, onOpen }: EngagementMessageCardProps) {
  const [open,     setOpen]     = useState(defaultOpen)
  const [showFull, setShowFull] = useState(false)

  const isOut    = msg.direction === 'outbound'
  const from     = parseAddress(msg.from_address)
  const name     = isOut ? 'Trade Risk Solutions' : (from.name ?? (from.email ? from.email.split('@')[0] : 'Unknown sender'))
  const email    = isOut ? (from.email || 'operations@trade-risksol.com') : from.email
  const fullBody = cleanEmailBody(msg.body_text)
  const stripped = stripQuotedContent(fullBody)
  const hasQuoted = stripped.length < fullBody.trim().length
  const toNames  = msg.to.map(a => parseAddress(a).name ?? parseAddress(a).email).filter(Boolean)
  const attCount = msg.attachments?.length ?? 0
  const preview  = (stripped.split('\n').find(l => l.trim()) || msg.subject || '').slice(0, 160)

  // Only emails ingested from 2026-07-10 onward have body_html stored — older rows only ever
  // had the flattened plain text saved, so this falls back to that unchanged for them.
  const bodyHtml = useMemo(() => (msg.body_html ? sanitizeEmailHtml(msg.body_html) : null), [msg.body_html])

  function expand() {
    setOpen(true)
    onOpen?.(msg.id)
  }

  const body = (
    <>
      {/* Highlights the sender marked in this email */}
      {msg.highlights && msg.highlights.length > 0 && (
        <div className="mb-3 rounded-[10px] px-3 py-2.5" style={{ background: FIELD }}>
          <p className="m-0 mb-1 text-[12px]" style={{ color: MUTED }}>Highlighted by sender</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {msg.highlights.map((h, i) => (
              <li key={i} className="text-[13.5px] leading-snug" style={{ color: INK }}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {bodyHtml ? (
        <div className={cn('email-html-body break-words max-w-full overflow-x-auto', !isLatest && 'is-earlier')} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      ) : (
        <div className={cn('whitespace-pre-wrap break-words leading-[1.6]', isLatest ? 'text-[16px]' : 'text-[15px]')} style={{ color: INK }}>
          {showFull ? fullBody : stripped}
        </div>
      )}

      {!!msg.attachments?.length && <Attachments list={msg.attachments} />}

      {hasQuoted && !bodyHtml && (
        <div className="mt-4 flex items-center gap-2.5 flex-wrap rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: FIELD, color: MUTED }}>
          <span>The quoted history is collapsed.</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setShowFull(v => !v)} aria-expanded={showFull} className={cn(LINK, 'text-[13px]')} style={{ color: INK }}>
            {showFull ? 'Hide quoted history' : 'Show quoted history'}
          </button>
        </div>
      )}
    </>
  )

  // ── Latest: full message, always open ─────────────────────────────────────
  if (isLatest) {
    return (
      <article aria-label={`Message from ${name}`} className="pb-2">
        <header className="flex items-center gap-3 pt-2 pb-3.5">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{name}</p>
            <Recipients msg={msg} toNames={toNames} isOut={isOut} email={email} />
          </div>
          <time className="ml-auto flex-shrink-0 text-[12.5px] whitespace-nowrap" style={{ color: FAINT }} title={msg.sent_at ? new Date(msg.sent_at).toLocaleString('en-SG', { dateStyle: 'full', timeStyle: 'short' }) : undefined}>{fmtWhen(msg.sent_at)}</time>
        </header>
        {body}
      </article>
    )
  }

  // ── Earlier: one-line row that opens in place ─────────────────────────────
  return (
    <div style={{ borderBottom: `1px solid ${HAIR}` }}>
      <button
        type="button"
        onClick={() => { if (open) { onOpen?.(msg.id); setOpen(false) } else expand() }}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} message from ${name}`}
        className="w-full text-left flex items-center gap-3 py-3 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124] text-[13.5px]"
        style={{ color: MUTED }}
      >
        <ChevronRight size={14} className={cn('flex-shrink-0 transition-transform', open && 'rotate-90')} style={{ color: DOT }} aria-hidden />
        <span className="font-medium flex-shrink-0 w-[120px] sm:w-[160px] truncate" style={{ color: INK }}>{name}</span>
        <span className={cn('min-w-0 flex-1', open ? 'whitespace-normal' : 'truncate')}>{preview}</span>
        {attCount > 0 && <Paperclip size={12} className="flex-shrink-0" style={{ color: DOT }} aria-label={`${attCount} attachments`} />}
        <span className="flex-shrink-0 text-[12.5px] whitespace-nowrap" style={{ color: FAINT }} title={fmtWhen(msg.sent_at)}>{fmtWhen(msg.sent_at, false)}</span>
      </button>
      {open && (
        <div className="pb-5 sm:pl-[172px]">
          <p className="m-0 mb-2.5 text-[12.5px]" style={{ color: FAINT }}>
            {[msg.to.length ? `to ${msg.to.map(a => parseAddress(a).email || a).join(', ')}` : null, msg.cc.length ? `cc ${msg.cc.map(a => parseAddress(a).email || a).join(', ')}` : null, attCount ? `${attCount} attachment${attCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
          </p>
          {body}
        </div>
      )}
    </div>
  )
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  return <span className="w-9 h-9 rounded-full flex-shrink-0 inline-flex items-center justify-center text-[13px] font-medium select-none" style={{ background: FIELD, color: INK }} aria-hidden>{initialOf(name)}</span>
}

function Recipients({ msg, toNames, isOut, email }: { msg: RealMsg; toNames: string[]; isOut: boolean; email: string }) {
  const [details, setDetails] = useState(false)
  const any = msg.to.length > 0 || msg.cc.length > 0
  return (
    <>
      <p className="m-0 mt-px text-[12.5px] flex items-center gap-1 min-w-0" style={{ color: MUTED }}>
        <span className="truncate">{toNames.length ? `to ${toNames.join(', ')}` : isOut ? 'sent' : 'received'}</span>
        {any && <><span aria-hidden>·</span><button type="button" onClick={() => setDetails(v => !v)} aria-expanded={details} className={cn(LINK, 'flex-shrink-0 text-[12.5px]')} style={{ color: MUTED }}>{details ? 'Hide details' : 'Details'}</button></>}
      </p>
      {details && (
        <dl className="m-0 mt-2 grid grid-cols-[44px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
          <dt style={{ color: DOT }}>From</dt><dd className="m-0 break-all" style={{ color: BODY }}>{email || '—'}</dd>
          {msg.to.length > 0 && <><dt style={{ color: DOT }}>To</dt><dd className="m-0 break-all" style={{ color: BODY }}>{msg.to.join(', ')}</dd></>}
          {msg.cc.length > 0 && <><dt style={{ color: DOT }}>Cc</dt><dd className="m-0 break-all" style={{ color: BODY }}>{msg.cc.join(', ')}</dd></>}
        </dl>
      )}
    </>
  )
}

function Attachments({ list }: { list: NonNullable<RealMsg['attachments']> }) {
  return (
    <section className="mt-5" aria-label="Attachments">
      <p className="m-0 mb-2.5 text-[13.5px]" style={{ color: MUTED }}><b className="font-medium" style={{ color: INK }}>Attachments</b> · {list.length}</p>
      <ul className="m-0 p-0 list-none grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
        {list.map(a => {
          const href = `/api/engagement/attachments/${a.id}/download`
          return (
            <li key={a.id} className="flex items-center gap-3 px-3.5 py-3 rounded-[12px] bg-white" style={{ border: `1px solid ${HAIR}` }}>
              <span className="w-10 h-11 rounded-[8px] flex-shrink-0 inline-flex items-center justify-center text-[11px] font-semibold tracking-[0.02em]" style={{ background: FIELD, color: BODY }} aria-hidden>{fileBadge(a.filename, a.mime_type)}</span>
              <span className="min-w-0">
                <a href={href} target="_blank" rel="noreferrer" className="block text-[14px] font-medium truncate no-underline hover:underline" style={{ color: INK }}>{a.filename}</a>
                <span className="block mt-0.5 text-[12.5px]" style={{ color: FAINT }}>
                  {formatBytes(a.size_bytes) && <span className="mr-1.5">{formatBytes(a.size_bytes)}</span>}
                  <a href={href} target="_blank" rel="noreferrer" className={cn(LINK, 'mr-1.5')} style={{ color: INK }}>Preview</a>
                  <a href={href} download={a.filename} className={LINK} style={{ color: INK }}>Download</a>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
