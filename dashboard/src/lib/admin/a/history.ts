/**
 * Reads the history inside one email body: forwarded messages and quoted replies.
 *
 * TRS often holds only the last message of a conversation — a client forwards two earlier mails
 * to operations@, or someone copies operations@ halfway through. The earlier messages are still
 * there, as text, under the new one. This file splits a body into those messages, newest first
 * as written, with sender, date, recipients, subject and the files each one names.
 *
 * Pure: no database, no model. Formats seen in TRS mail (Nov 2026):
 *   Gmail     "---------- Forwarded message ---------" then From/Date/Subject/To/Cc
 *   Gmail     "On Wed, 28 Oct 2026 at 18:13, Name <a@b> wrote:" then "> " quoted lines
 *   Outlook   "From: … Sent: … To: … Cc: … Subject: …" (also *From:* bold, Date: instead of Sent:)
 *   Outlook   "-----Original Message-----" before the same block
 *   Apple     "Begin forwarded message:" then From/Date/To/Cc/Subject
 *   Chinese   发件人 / 发送时间 / 收件人 / 抄送 / 主题 (Foxmail, NetEase, Outlook zh)
 */

export type HistoryOrigin = 'forward' | 'quoted'

export type HistoryMessage = {
  origin: HistoryOrigin
  /** 0 = oldest message rebuilt from this body. */
  position: number
  fromAddress: string | null
  fromName: string | null
  to: string[]
  cc: string[]
  sentAt: string | null
  sentAtText: string | null
  subject: string | null
  body: string
  attachmentsNamed: string[]
}

export type History = {
  /** What the sender wrote on top, before any history. */
  top: string
  /** Rebuilt messages, newest first as they appear in the body. */
  messages: HistoryMessage[]
}

// ── Normalising ─────────────────────────────────────────────────────────────────────────────

export function normaliseBody(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[  ]/g, ' ')
    .replace(/[﻿​‌‍]/g, '')
    // "a@b.com<mailto:a@b.com>" and "Name<mailto:a@b.com>" → keep one address
    .replace(/([\w.+'-]+@[\w-]+(?:\.[\w-]+)+)\s*<mailto:[^>]+>/gi, '$1')
    .replace(/<mailto:([^>]+)>/gi, ' <$1>')
    .replace(/\[mailto:([^\]]+)\]/gi, '<$1>')
}

type Line = { depth: number; text: string }

function toLines(text: string): Line[] {
  return text.split('\n').map(raw => {
    const m = /^((?:[ \t]*>)+)[ \t]?/.exec(raw)
    const depth = m ? (m[1].match(/>/g) ?? []).length : 0
    // Outlook bold labels arrive as *From:* in plain text.
    const t = (m ? raw.slice(m[0].length) : raw).replace(/^\*([^*:：]{1,20}[:：])\*/, '$1').trimEnd()
    return { depth, text: t }
  })
}

// ── Header blocks ───────────────────────────────────────────────────────────────────────────

type Key = 'from' | 'date' | 'to' | 'cc' | 'subject' | 'attach'
const KEYS: [Key, RegExp][] = [
  ['from',    /^\s*(from|发件人|寄件者|寄件人|dari|von|de)\s*[:：]\s*(.*)$/i],
  ['date',    /^\s*(date|sent|received|发送时间|日期|时间|寄件日期|tanggal|terkirim|gesendet|envoyé)\s*[:：]\s*(.*)$/i],
  ['to',      /^\s*(to|收件人|kepada|an|à|para)\s*[:：]\s*(.*)$/i],
  ['cc',      /^\s*(cc|抄送|副本|tembusan)\s*[:：]\s*(.*)$/i],
  ['subject', /^\s*(subject|主题|主旨|perihal|subjek|betreff|objet|asunto)\s*[:：]\s*(.*)$/i],
  ['attach',  /^\s*(attachments?|附件|lampiran)\s*[:：]\s*(.*)$/i],
]

function headerKey(text: string): { key: Key; value: string } | null {
  for (const [key, re] of KEYS) {
    const m = re.exec(text)
    if (m) return { key, value: m[2].trim() }
  }
  return null
}

const FORWARD_MARK = /^\s*(-{2,}\s*forwarded message\s*-{2,}|begin forwarded message:?|-{2,}\s*(转发的邮件|转发邮件|pesan yang diteruskan|pesan terusan)\s*-{2,}|-{2,}\s*weitergeleitete nachricht\s*-{2,})\s*$/i
const REPLY_MARK = /^\s*(-{2,}\s*original message\s*-{2,}|-{2,}\s*(原始邮件|原邮件|pesan asli)\s*-{2,}|_{8,}|-{8,})\s*$/i
const WROTE = /^on\s.{4,260}?\bwrote:\s*$/i

/** An address list as written: "A <a@x>; B <b@y>", "a@x, b@y", 'Name' <a@x>. */
export function addressesIn(value: string): string[] {
  return Array.from(new Set((value.match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).map(a => a.toLowerCase().replace(/^'+|'+$/g, ''))))
}

function nameOf(value: string): string | null {
  const v = value.replace(/<[^>]*>?/g, ' ').replace(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g, ' ').replace(/["'*]/g, '').replace(/\s+/g, ' ').trim().replace(/[,;:]$/, '').trim()
  return v.length >= 2 ? v : null
}

/** A header value continues on the next line when it was cut mid-address. */
function looksCut(value: string): boolean {
  const opens = (value.match(/</g) ?? []).length, closes = (value.match(/>/g) ?? []).length
  return opens > closes || /[;,]\s*$/.test(value) || /<\s*$/.test(value)
}
const looksContinuation = (t: string) => /^[\w.+'-]*@[\w-]+(\.[\w-]+)+>?\s*[;,]?/.test(t.trim()) || /^[\w.+'-]+>\s*[;,]?/.test(t.trim())

type Boundary = { start: number; end: number; kind: 'forward' | 'reply'; header: Partial<Record<Key, string>>; wroteLine?: string; depth: number }

/** Reads a header block starting at line i. Returns null when it is not one. */
function readHeader(lines: Line[], i: number): { end: number; header: Partial<Record<Key, string>> } | null {
  const first = headerKey(lines[i].text)
  if (!first || first.key !== 'from') return null
  const header: Partial<Record<Key, string>> = { from: first.value }
  let last: Key = 'from'
  let j = i + 1
  let blanks = 0
  for (; j < lines.length && j < i + 24; j++) {
    const t = lines[j].text
    if (!t.trim()) {
      // Some clients put a blank line between every header line; allow it while headers follow.
      blanks++
      if (blanks > 2) break
      continue
    }
    const h = headerKey(t)
    if (h && h.key !== 'from' && !header[h.key]) { header[h.key] = h.value; last = h.key; blanks = 0; continue }
    if (!h && blanks === 0 && (looksCut(header[last] ?? '') || looksContinuation(t))) { header[last] = `${header[last] ?? ''} ${t.trim()}`; continue }
    // A subject wrapped by plain-text quoting: a short tail line right before the blank line.
    if (!h && blanks === 0 && last === 'subject' && t.trim().length <= 40 && !lines[j + 1]?.text.trim()) { header.subject = `${header.subject ?? ''} ${t.trim()}`; continue }
    break
  }
  if (!header.date && !header.subject) return null
  // Rewind past trailing blanks so the body starts at the first real line.
  let end = j
  while (end > i && !lines[end - 1].text.trim()) end--
  return { end, header }
}

/** "On Wed, 28 Oct 2026 at 18:13, Name <a@b> wrote:" may wrap over up to three lines. */
function readWrote(lines: Line[], i: number): { end: number; text: string } | null {
  if (!/^on\s/i.test(lines[i].text.trim())) return null
  let text = lines[i].text.trim()
  for (let k = 0; k < 3; k++) {
    if (WROTE.test(text)) return { end: i + k + 1, text }
    const next = lines[i + k + 1]
    if (!next) break
    text = `${text} ${next.text.trim()}`
  }
  return null
}

export function parseWrote(text: string): { fromAddress: string | null; fromName: string | null; dateText: string | null } {
  const inner = text.trim().replace(/^on\s+/i, '').replace(/\s*wrote:\s*$/i, '')
  const address = addressesIn(inner)[0] ?? null
  const noAddr = inner.replace(/<[^>]*>/g, ' ').replace(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g, ' ').replace(/\s+/g, ' ').trim()
  // The date ends at its time (or its year); the name follows.
  const time = /\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?(?:\s*(?:SGT|HKT|WIB|GMT|UTC|[+-]\d{4}))?/i.exec(noAddr)
  const year = /\b(19|20)\d{2}\b,?/.exec(noAddr)
  const cut = time ? time.index + time[0].length : year ? year.index + year[0].length : -1
  if (cut < 0) return { fromAddress: address, fromName: nameOf(noAddr), dateText: null }
  const dateText = noAddr.slice(0, cut).trim().replace(/,$/, '')
  const name = noAddr.slice(cut).replace(/^[\s,]+/, '').replace(/["']/g, '').trim()
  return { fromAddress: address, fromName: name.length >= 2 ? name : null, dateText: dateText || null }
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, maret: 2, mei: 4, juni: 5, juli: 6, agustus: 7, oktober: 9, desember: 11, okt: 9, agu: 7, des: 11,
}
const ZONES: Record<string, number> = { SGT: 480, HKT: 480, MYT: 480, PHT: 480, AWST: 480, CST: 480, WIB: 420, ICT: 420, JST: 540, KST: 540, IST: 330, GMT: 0, UTC: 0, BST: 60, CET: 60, CEST: 120, AEST: 600, AEDT: 660 }

/**
 * Reads a date as mail clients write it. Day before month (Singapore) when both are numbers.
 * No zone stated → Singapore time. Returns ISO, or null when there is no year and month.
 */
export function parseLooseDate(input: string | null | undefined, defaultOffsetMin = 480): string | null {
  if (!input) return null
  const s = input.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
  let y: number | null = null, mo: number | null = null, d: number | null = null
  let m: RegExpExecArray | null
  if ((m = /\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3] }
  else if ((m = /((?:19|20)\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(s))) { y = +m[1]; mo = +m[2] - 1; d = +m[3] }
  else if ((m = /\b(\d{1,2})[/.-](\d{1,2})[/.-]((?:19|20)\d{2})\b/.exec(s))) { d = +m[1]; mo = +m[2] - 1; y = +m[3] }
  else {
    const yr = /\b((?:19|20)\d{2})\b/.exec(s)
    const mon = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|januari|februari|maret|mei|juni|juli|agustus|oktober|okt|agu|desember|des)[a-z]*\.?\b/i.exec(s)
    if (yr && mon) {
      y = +yr[1]; mo = MONTHS[mon[1].toLowerCase()] ?? null
      const after = /^\s*(\d{1,2})(?:st|nd|rd|th)?\b/.exec(s.slice(mon.index + mon[0].length))
      const before = /\b(\d{1,2})(?:st|nd|rd|th)?\s*$/.exec(s.slice(0, mon.index))
      d = before ? +before[1] : after ? +after[1] : null
    }
  }
  if (y == null || mo == null || d == null || mo < 0 || mo > 11 || d < 1 || d > 31) return null
  let h = 0, mi = 0, sec = 0
  const t = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?(?![a-z])/i.exec(s.replace(/\b((?:19|20)\d{2})[-/.]\d{1,2}[-/.]\d{1,2}\b/, ''))
  if (t) {
    h = +t[1]; mi = +t[2]; sec = t[3] ? +t[3] : 0
    const ap = t[4]?.toLowerCase()
    if (ap === 'p' && h < 12) h += 12
    if (ap === 'a' && h === 12) h = 0
  }
  let offset = defaultOffsetMin
  const z = /\b(SGT|HKT|MYT|PHT|AWST|CST|WIB|ICT|JST|KST|IST|GMT|UTC|BST|CET|CEST|AEST|AEDT)\b/.exec(s)
  const o = /(?:GMT|UTC)?\s*([+-])(\d{2}):?(\d{2})\b/.exec(t ? s.slice(s.indexOf(t[0]) + t[0].length) : '')
  if (o) offset = (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3])
  else if (z) offset = ZONES[z[1]]
  const ms = Date.UTC(y, mo, d, h, mi, sec) - offset * 60_000
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

// ── Files named ─────────────────────────────────────────────────────────────────────────────

const FILE = /[\p{L}\p{N}][\p{L}\p{N} _.()&,+'#-]{0,120}?\.(pdf|xlsx|xlsm|xls|docx|doc|csv|jpe?g|png|heic|zip|msg|eml|pptx)\b/giu

/** Files a message names: an Attachments: line, [bracketed names], or a line that is only a file. */
export function filesNamed(header: string | undefined, body: string): string[] {
  const out = new Set<string>()
  const add = (s: string) => { const f = s.trim().replace(/^[\[(<]+|[\])>]+$/g, '').trim(); if (f.length >= 5 && f.length <= 140) out.add(f) }
  if (header) for (const part of header.split(/[;,]\s*|\s{2,}/)) for (const f of part.match(FILE) ?? []) add(f)
  for (const m of body.matchAll(/\[([^\]\n]{3,140}\.(?:pdf|xlsx|xlsm|xls|docx|doc|csv|jpe?g|png|heic|zip|msg|eml|pptx))\]/gi)) add(m[1])
  for (const line of body.split('\n')) {
    // "the repair quote is attached: Quote 22.pdf" — the file is what follows the last colon.
    const t = line.trim().split(/:\s+/).pop()!.trim()
    if (/^[^\s].{2,140}\.(pdf|xlsx|xlsm|xls|docx|doc|csv|jpe?g|png|heic|zip|msg|eml|pptx)$/i.test(t) && t.split(/\s+/).length <= 8 && !/https?:|www\./i.test(line)) add(t)
  }
  return Array.from(out)
}

// ── Splitting ───────────────────────────────────────────────────────────────────────────────

const isForwardSubject = (s: string | null | undefined) => /^\s*(fw|fwd|wg|转发|tr)\s*[:：]/i.test(s ?? '')

/** Splits a body into what was written on top and the messages beneath it. */
export function readHistory(bodyText: string, subject?: string | null): History {
  const lines = toLines(normaliseBody(bodyText))
  const bounds: Boundary[] = []
  let pendingMark: { kind: 'forward' | 'reply'; at: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text
    if (FORWARD_MARK.test(t)) { pendingMark = { kind: 'forward', at: i }; continue }
    if (REPLY_MARK.test(t)) { pendingMark = { kind: 'reply', at: i }; continue }
    const w = readWrote(lines, i)
    if (w) {
      const p = parseWrote(w.text)
      bounds.push({ start: i, end: w.end, kind: pendingMark && i - pendingMark.at <= 3 ? pendingMark.kind : 'reply', header: { from: p.fromAddress ? `${p.fromName ?? ''} <${p.fromAddress}>` : (p.fromName ?? ''), date: p.dateText ?? undefined }, wroteLine: w.text, depth: lines[i].depth })
      pendingMark = null
      i = w.end - 1
      continue
    }
    const h = readHeader(lines, i)
    if (h) {
      const mark = pendingMark && i - pendingMark.at <= 3 ? pendingMark : null
      bounds.push({ start: mark ? mark.at : i, end: h.end, kind: mark?.kind ?? 'reply', header: h.header, depth: lines[i].depth })
      pendingMark = null
      i = h.end - 1
    }
  }

  const text = (from: number, to: number, minDepth: number) =>
    lines.slice(from, to).filter(l => l.depth >= minDepth).map(l => l.text).join('\n')
      .replace(/^\s*(-{2,}\s*forwarded message\s*-{2,}|begin forwarded message:?|-{2,}\s*original message\s*-{2,}|_{8,}|-{8,})\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n').trim()

  const top = text(0, bounds[0]?.start ?? lines.length, 0)
  const forwardSubject = isForwardSubject(subject)
  const messages: HistoryMessage[] = bounds.map((b, k) => {
    const next = bounds[k + 1]?.start ?? lines.length
    // A "wrote:" line introduces text one quote level deeper; a header block's body sits at its own level.
    const body = text(b.end, next, b.wroteLine ? b.depth + 1 : b.depth).slice(0, 8000)
    const from = b.header.from ?? ''
    const subj = b.header.subject?.replace(/\s+/g, ' ').trim() || null
    return {
      origin: b.kind === 'forward' || (forwardSubject && k === 0) ? 'forward' : 'quoted',
      position: bounds.length - 1 - k,
      fromAddress: addressesIn(from)[0] ?? null,
      fromName: nameOf(from),
      to: addressesIn(b.header.to ?? ''),
      cc: addressesIn(b.header.cc ?? ''),
      sentAt: parseLooseDate(b.header.date),
      sentAtText: b.header.date?.trim() || null,
      subject: subj,
      body,
      attachmentsNamed: filesNamed(b.header.attach, body),
    }
  })
  // A message forwarded inside a forward is still one TRS never received: carry the origin down.
  for (let k = 1; k < messages.length; k++) if (messages[k - 1].origin === 'forward' && messages[k].origin === 'quoted' && forwardSubject) messages[k].origin = 'forward'
  return { top, messages }
}
