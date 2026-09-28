'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import { ChevronRight, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { RealMsg } from './types'
import { fmtWhen, stripQuotedContent, parseAddress, initialOf, formatBytes, fileBadge, splitSignatureHtml, splitSignatureText } from './helpers'
import { cleanEmailBody } from '@/lib/clean-email-body'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'

/**
 * One email in the reader. The sender's HTML keeps its structure (paragraphs, lists, tables,
 * links, images) and takes our typography (.email-html-body). The signature, when a known
 * marker makes it certain, drops to 13.5px muted. The quoted history is split into a nested
 * chain (splitQuotedChain) and folds behind one grey row; the raw message is always one click
 * away in "View original". The latest message renders in full; earlier ones are one-line rows
 * that open in place.
 */

const INK = '#202124'
const BODY = '#3c4043'
const MUTED = '#5f6368'
const FAINT = '#80868b'
const DOT = '#9aa0a6'
const HAIR = '#e8eaed'
const FIELD = '#f1f3f4'

const LINK = 'underline decoration-[#9aa0a6] underline-offset-[3px] cursor-pointer bg-transparent border-0 p-0 font-[inherit]'

// ── Quoted history ─────────────────────────────────────────────────────────────────────────

/** Where the quoted history starts in a sender's HTML, across the clients we see: Gmail's
 *  gmail_quote, Outlook's divRplyFwdMsg / appendonsend / the grey "From:" header rule, Apple
 *  Mail's blockquote, and the plain "-----Original Message-----" marker. */
const QUOTE_MARKERS = [
  /<div[^>]*class="[^"]*gmail_quote[^"]*"/i,
  /<div[^>]*id="divRplyFwdMsg"/i,
  /<div[^>]*id="appendonsend"/i,
  /<div[^>]*class="[^"]*OutlookMessageHeader[^"]*"/i,
  /<div[^>]*style="[^"]*border-top:\s*solid #E1E1E1[^"]*"/i,
  /<hr[^>]*>(?:\s|<[^>]+>)*From:/i,
  /-----\s*Original Message\s*-----/i,
  /<blockquote[^>]*type="cite"/i,
]
export function splitQuotedHtml(html: string): { main: string; quoted: string | null } {
  let cut = -1
  for (const re of QUOTE_MARKERS) { const m = re.exec(html); if (m && m.index > 40 && (cut < 0 || m.index < cut)) cut = m.index }
  if (cut < 0) return { main: html, quoted: null }
  return { main: html.slice(0, cut), quoted: html.slice(cut) }
}

export type QuotedPart = {
  /** The attribution line as written ("On … wrote:", "From: … Sent: …"), or null. */
  header: string | null
  name: string | null
  date: string | null
  html: string
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** "Thu, 25 Sept 2026 at 11:02, Cheng, Lily" → date up to the last segment holding a time or a
 *  year, the rest is the name (names can carry a comma too). */
function splitDateName(inner: string): { name: string | null; date: string | null } {
  const segs = inner.split(/,\s*/)
  let cut = -1
  segs.forEach((seg, i) => { if (/\d{1,2}:\d{2}|\b(?:19|20)\d{2}\b/.test(seg)) cut = i })
  if (cut < 0 || cut === segs.length - 1) {
    if (segs.length < 2) return { name: null, date: inner || null }
    return { date: segs.slice(0, -1).join(', '), name: segs[segs.length - 1].trim() || null }
  }
  return { date: segs.slice(0, cut + 1).join(', '), name: segs.slice(cut + 1).join(', ').trim() || null }
}

/** Reads the attribution line at the top of one quoted slice and returns the slice without it. */
function extractQuoteHeader(slice: string): { header: string | null; name: string | null; date: string | null; body: string } {
  const head = slice.slice(0, 3000)
  const text = textOf(head)

  // Gmail / Apple Mail: "On Thu, 25 Sept 2026 at 11:02, Hasya Mohamed <hasya@…> wrote:"
  const on = /On (.{6,220}?)\s+wrote:/.exec(text)
  if (on) {
    const cutRe = /wrote:\s*(?:<\/[a-z]+>)*/i
    const m = cutRe.exec(head)
    const body = m ? slice.slice(m.index + m[0].length) : slice
    const inner = on[1].replace(/\s*(?:<[^>]*>|\([^)]*\))\s*$/, '').trim()
    const { name, date } = splitDateName(inner)
    return { header: `On ${on[1]} wrote:`, name, date, body }
  }

  // Outlook / "Original Message": "From: … Sent: … To: … Subject: …"
  const from = /From:\s*(.+?)\s+(?:Sent|Date):\s*(.+?)\s+(?:To|Cc|Subject):/.exec(text)
  if (from) {
    const cutRe = /Subject:(?:\s*<\/(?:b|strong|span)>)*[^<]*(?:<br[^>]*>|<\/p>|<\/div>)/i
    const m = cutRe.exec(head)
    const body = m ? slice.slice(m.index + m[0].length) : slice
    const name = from[1].replace(/\s*<[^>]*>\s*$/, '').replace(/\s*\[mailto:[^\]]*\]\s*$/i, '').trim()
    return { header: `From: ${from[1]} · ${from[2]}`, name: name || null, date: from[2].trim(), body }
  }

  return { header: null, name: null, date: null, body: slice }
}

/** The quoted history as an ordered chain, newest quote first, deepest last. Each part is one
 *  earlier message: its attribution line and its own HTML with the next quote cut out. */
export function splitQuotedChain(html: string): QuotedPart[] {
  const parts: QuotedPart[] = []
  let rest: string | null = splitQuotedHtml(html).quoted
  let guard = 0
  while (rest && guard++ < 12) {
    const { header, name, date, body } = extractQuoteHeader(rest)
    const inner = splitQuotedHtml(body)
    const own = inner.main.trim()
    if (own || header) parts.push({ header, name, date, html: own })
    rest = inner.quoted
  }
  return parts
}

/** Plain-text equivalent: cut at the first attribution line, then peel one ">" level per step. */
export function splitQuotedTextChain(text: string): QuotedPart[] {
  const parts: QuotedPart[] = []
  let rest: string | null = quotedTailOfText(text)
  let guard = 0
  while (rest && guard++ < 12) {
    const lines = rest.split('\n')
    let header: string | null = null
    if (lines.length && (/^On .{10,} wrote:\s*$/i.test(lines[0].trim()) || /^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}/i.test(lines[0].trim()))) header = lines.shift()!.trim()
    const unquoted = lines.map(l => l.replace(/^\s?>\s?/, '')).join('\n')
    const next = quotedTailOfText(unquoted)
    const own = (next ? unquoted.slice(0, unquoted.length - next.length) : unquoted).trim()
    const on = header ? /^On (.+?)\s*(?:<[^>]*>)?\s*wrote:$/i.exec(header) : null
    const who = on ? splitDateName(on[1]) : { name: null, date: null }
    if (own || header) parts.push({ header, name: who.name, date: who.date, html: escapeHtml(own).replace(/\n/g, '<br>') })
    rest = next
  }
  return parts
}
function quotedTailOfText(body: string): string | null {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}/i.test(t) || /^On .{10,} wrote:\s*$/i.test(t) || t.startsWith('>')) {
      return i === 0 ? null : lines.slice(i).join('\n')
    }
  }
  return null
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Tables ─────────────────────────────────────────────────────────────────────────────────

/** Wraps each top-level data table (2+ rows, 2+ cells, no nested table) in a scrollable
 *  hairline container with the "kept exactly as sent" caption. Layout tables are left alone. */
/** Blocks that carry no words — `<p>&nbsp;</p>`, `<div><br></div>`, `<p><span></span></p>` — are how mail
 *  clients pad lines. Dropped before rendering so the body reads as prose, not a double-spaced sheet. */
export function collapseBlankBlocks(html: string): string {
  const blank = /<(p|div)\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>|<\/?(?:span|font|o:p|b|i|u|em|strong)\b[^>]*>)*<\/\1>/gi
  let out = html, prev = ''
  while (out !== prev) { prev = out; out = out.replace(blank, '') }
  return out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
}

export function wrapTables(html: string): string {
  const re = /<\/?table\b[^>]*>/gi
  let out = ''
  let last = 0
  let depth = 0
  let start = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const closing = m[0][1] === '/'
    if (!closing) { if (depth === 0) start = m.index; depth++ }
    else if (depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        const end = m.index + m[0].length
        const table = html.slice(start, end)
        out += html.slice(last, start) + (isDataTable(table) ? wrapOne(table) : table)
        last = end; start = -1
      }
    }
  }
  return out + html.slice(last)
}
function isDataTable(table: string): boolean {
  if ((table.match(/<table\b/gi) ?? []).length > 1) return false
  const rows = table.match(/<tr\b/gi) ?? []
  if (rows.length < 2) return false
  const firstRow = /<tr\b[\s\S]*?<\/tr>/i.exec(table)?.[0] ?? ''
  return (firstRow.match(/<t[dh]\b/gi) ?? []).length >= 2
}
function wrapOne(table: string): string {
  return `<div class="email-tbl"><div class="email-tbl-scroll">${table}</div><div class="email-tbl-cap"><span>Table kept exactly as sent</span><button type="button" data-action="view-original">View original table</button></div></div>`
}

// ── Component ──────────────────────────────────────────────────────────────────────────────

export function MessageBlock({ msg, defaultOpen, isLatest, newSender, senderName }: { msg: RealMsg; defaultOpen: boolean; isLatest?: boolean; newSender?: boolean; senderName?: string | null }) {
  const [open, setOpen] = useState(defaultOpen)
  const isOut = msg.direction === 'outbound'
  const from = parseAddress(msg.from_address)
  const name = isOut ? 'Trade Risk Solutions' : (from.name ?? senderName ?? (from.email ? from.email.split('@')[0] : 'Unknown sender'))
  const email = isOut ? (from.email || 'operations@trade-risksol.com') : from.email
  const textBody = cleanEmailBody(msg.body_text)
  const preview = (stripQuotedContent(textBody).split('\n').find(l => l.trim()) || msg.subject || '').slice(0, 160)
  const toNames = msg.to.map(a => parseAddress(a).name ?? parseAddress(a).email).filter(Boolean)
  const attCount = msg.attachments?.length ?? 0

  if (isLatest) {
    return (
      <article aria-label={`Message from ${name}`} className="pb-2">
        <header className="flex items-center gap-3 pt-5 pb-3.5">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] font-medium truncate" style={{ color: INK }}>{name}</p>
            <Recipients msg={msg} toNames={toNames} isOut={isOut} email={email} />
          </div>
          <time className="ml-auto flex-shrink-0 text-[12.5px] whitespace-nowrap" style={{ color: FAINT }} title={msg.sent_at ? new Date(msg.sent_at).toLocaleString('en-SG', { dateStyle: 'full', timeStyle: 'short' }) : undefined}>{fmtWhen(msg.sent_at)}</time>
        </header>
        {newSender && <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>New sender in this thread. This address has not written here before.</p>}
        <MessageBody msg={msg} name={name} textBody={textBody} />
      </article>
    )
  }

  return (
    <div style={{ borderBottom: `1px solid ${HAIR}` }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} message from ${name}`}
        className="w-full text-left flex items-center gap-3 py-3 bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#202124] text-[13.5px]"
        style={{ color: MUTED }}>
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
          {newSender && <p className="m-0 mb-3 text-[13px]" style={{ color: MUTED }}>New sender in this thread. This address has not written here before.</p>}
          <MessageBody msg={msg} name={name} textBody={textBody} earlier />
        </div>
      )}
    </div>
  )
}

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

/** Body, signature, attachments, quoted fold and the original dialog — shared by the latest
 *  message and the earlier ones. */
function MessageBody({ msg, name, textBody, earlier }: { msg: RealMsg; name: string; textBody: string; earlier?: boolean }) {
  const [quotedOpen, setQuotedOpen] = useState(false)
  const [original, setOriginal] = useState(false)

  const html = useMemo(() => {
    if (!msg.body_html) return null
    const clean = collapseBlankBlocks(sanitizeEmailHtml(msg.body_html))
    const { main, quoted } = splitQuotedHtml(clean)
    const { main: body, signature } = splitSignatureHtml(main)
    return { body: wrapTables(body), signature, chain: quoted ? splitQuotedChain(clean) : [] }
  }, [msg.body_html])
  const text = useMemo(() => {
    if (html) return null
    const own = stripQuotedContent(textBody)
    const { main, signature } = splitSignatureText(own)
    return { body: main, signature, chain: own.length < textBody.trim().length ? splitQuotedTextChain(textBody) : [] }
  }, [html, textBody])

  const chain = html?.chain ?? text?.chain ?? []
  const hasQuoted = chain.length > 0 || (!html && !!text && stripQuotedContent(textBody).length < textBody.trim().length)

  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (t.closest?.('[data-action="view-original"]')) { e.preventDefault(); setOriginal(true) }
  }

  const sizeCls = earlier ? 'is-earlier' : ''
  return (
    <>
      {html
        ? <div className={cn('email-html-body', sizeCls)} onClick={onBodyClick} dangerouslySetInnerHTML={{ __html: html.body }} />
        : <div className={cn('whitespace-pre-wrap break-words leading-[1.6]', earlier ? 'text-[15px]' : 'text-[16px]')} style={{ color: INK }}>{text?.body}</div>}

      {(html?.signature || text?.signature) && (
        <div className="mt-2.5 pt-2.5 text-[13.5px] leading-[1.5]" style={{ borderTop: `1px solid ${HAIR}`, color: MUTED }}>
          {html?.signature ? <div className="email-html-body email-sig" dangerouslySetInnerHTML={{ __html: html.signature }} /> : <div className="whitespace-pre-wrap">{text?.signature}</div>}
        </div>
      )}

      {!!msg.attachments?.length && <Attachments list={msg.attachments} />}

      {hasQuoted ? (
        <div className="mt-4 flex items-center gap-2.5 flex-wrap rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: FIELD, color: MUTED }}>
          <span>Some repeated formatting and the quoted history are collapsed.</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setQuotedOpen(v => !v)} aria-expanded={quotedOpen} className={cn(LINK, 'text-[13px]')} style={{ color: INK }}>{quotedOpen ? 'Hide quoted history' : `Show quoted history (${chain.length || 1})`}</button>
          <button type="button" onClick={() => setOriginal(true)} className={cn(LINK, 'text-[13px]')} style={{ color: INK }}>View original</button>
        </div>
      ) : (
        <p className="m-0 mt-3 text-right text-[12.5px]"><button type="button" onClick={() => setOriginal(true)} className={cn(LINK, 'text-[12.5px]')} style={{ color: FAINT }}>View original</button></p>
      )}

      {quotedOpen && hasQuoted && (
        chain.length > 0
          ? <div className="mt-3.5"><QuotedChain parts={chain} /></div>
          : <div className="email-html-body email-quoted mt-3.5 pl-4 whitespace-pre-wrap" style={{ borderLeft: `2px solid ${HAIR}` }}>{textBody.slice(stripQuotedContent(textBody).length).trim()}</div>
      )}

      <OriginalDialog open={original} onClose={() => setOriginal(false)} msg={msg} name={name} />
    </>
  )
}

/** Nested blocks, each indented under the last, deepest last. */
function QuotedChain({ parts, depth = 0 }: { parts: QuotedPart[]; depth?: number }) {
  const [head, ...rest] = parts
  if (!head) return null
  return (
    <div className={cn('pl-4', depth > 0 && 'mt-2.5')} style={{ borderLeft: `2px solid ${HAIR}` }} aria-label={depth === 0 ? 'Quoted history' : undefined}>
      <div className="mb-1.5 flex items-baseline gap-2.5 flex-wrap text-[12.5px]" style={{ color: MUTED }}>
        {head.name ? <><b className="font-medium" style={{ color: BODY }}>{head.name}</b>{head.date && <span>{head.date}</span>}</> : <span>{head.header ?? 'Quoted message'}</span>}
      </div>
      {head.html && <div className="email-html-body email-quoted" dangerouslySetInnerHTML={{ __html: head.html }} />}
      {rest.length > 0 && <QuotedChain parts={rest} depth={depth + 1} />}
    </div>
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

/** The message exactly as stored: sanitised HTML, no cleaning, or the plain text. */
function OriginalDialog({ open, onClose, msg, name }: { open: boolean; onClose: () => void; msg: RealMsg; name: string }) {
  const [mode, setMode] = useState<'html' | 'text'>(msg.body_html ? 'html' : 'text')
  const raw = useMemo(() => (open && msg.body_html ? sanitizeEmailHtml(msg.body_html) : ''), [open, msg.body_html])
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(960px,calc(100vw-32px))] max-h-[85vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 pr-14" style={{ borderBottom: `1px solid ${HAIR}` }}>
          <DialogTitle className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: INK }}>Original message</DialogTitle>
          <p className="m-0 text-[13px]" style={{ color: MUTED }}>{name} · {fmtWhen(msg.sent_at)}</p>
          {msg.body_html && msg.body_text && (
            <div className="mt-2 flex items-center gap-3 text-[13px]">
              <button type="button" onClick={() => setMode('html')} aria-pressed={mode === 'html'} className={cn('bg-transparent border-0 p-0 cursor-pointer', mode === 'html' ? 'font-medium underline underline-offset-[3px] decoration-[#202124]' : '')} style={{ color: mode === 'html' ? INK : MUTED }}>As sent</button>
              <button type="button" onClick={() => setMode('text')} aria-pressed={mode === 'text'} className={cn('bg-transparent border-0 p-0 cursor-pointer', mode === 'text' ? 'font-medium underline underline-offset-[3px] decoration-[#202124]' : '')} style={{ color: mode === 'text' ? INK : MUTED }}>Plain text</button>
            </div>
          )}
        </DialogHeader>
        <div className="px-6 py-5 text-[14px] leading-[1.5] break-words" style={{ color: INK }}>
          {mode === 'html' && raw
            ? <div className="email-original" dangerouslySetInnerHTML={{ __html: raw }} />
            : <pre className="m-0 whitespace-pre-wrap font-[inherit] text-[14px]">{msg.body_text ?? ''}</pre>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
