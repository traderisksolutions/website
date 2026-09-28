import type { Lead, RealMsg, ThreadState } from './types'
import { PERSONAL_DOMAINS } from './types'

export function fullName(l: Lead): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || '—'
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export function domainOf(email: string | null | undefined): string {
  if (!email) return '__none__'
  return email.split('@')[1]?.toLowerCase() ?? '__none__'
}

export function companyLabel(domainKey: string): string {
  if (domainKey === '__personal__' || domainKey === '__none__') return 'Individual'
  const base = domainKey.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function matchesSearch(lead: Lead, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return [lead.first_name, lead.last_name, lead.email, lead.company, lead.topic, lead.department, lead.details, lead.message, lead.subject]
    .some(v => v?.toLowerCase().includes(lower))
}

/** Returns '' (not the raw text) when `addr` isn't actually an email — e.g. a bare display name
 *  like `"Soon Teng"` with no resolved `<...>` address, which some Exchange/Outlook senders emit
 *  for a recipient that failed to resolve. Callers already treat '' as "skip this one"; without
 *  this guard that garbage text was being used as a real address, including on outgoing Cc lists
 *  where Gmail's API rejects it outright ("Invalid Cc header"). */
export function extractEmail(addr: string): string {
  if (!addr) return ''
  const match = addr.match(/<([^>]+)>/)
  const email = (match ? match[1] : addr).trim().toLowerCase().replace(/^"|"$/g, '')
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

export function stripQuotedContent(body: string): string {
  const lines = body.split('\n')
  const clean: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (/^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}/i.test(t)) break
    if (/^On .{10,} wrote:\s*$/i.test(t)) break
    if (t.startsWith('>')) continue
    clean.push(line)
  }
  while (clean.length && !clean[clean.length - 1].trim()) clean.pop()
  return clean.some(l => l.trim()) ? clean.join('\n') : body
}

export function isPersonalDomain(email: string | null | undefined): boolean {
  const d = domainOf(email)
  return PERSONAL_DOMAINS.has(d) || d === '__none__'
}

export function needsReply(messages: RealMsg[]): boolean {
  return messages.at(-1)?.direction === 'inbound'
}

export function lastActivity(lead: Lead, messages: RealMsg[]): string {
  return messages.at(-1)?.sent_at ?? lead.created_at
}

/** Needs a reply: the loaded thread's newest message is inbound, or, before the thread is
 *  loaded, the conversations API said so. */
export function leadNeedsReply(lead: Lead, state?: ThreadState): boolean {
  if (state && !state.loading && state.messages.length > 0) return needsReply(state.messages)
  return lead.lastDirection === 'inbound'
}

/** "Lisa Daly <lisa@celavi.com>" → { name: 'Lisa Daly', email: 'lisa@celavi.com' }. */
export function parseAddress(raw: string | null | undefined): { name: string | null; email: string } {
  if (!raw) return { name: null, email: '' }
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  const email = raw.trim().toLowerCase()
  return { name: null, email }
}

// ── Reader helpers (additive) ─────────────────────────────────────────────────────────────

/** First letter for the avatar circle. */
export function initialOf(name: string | null | undefined): string {
  const c = (name ?? '').trim()[0]
  return c ? c.toUpperCase() : '?'
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Short badge text for an attachment: "PDF", "XLSX", "IMG", "FILE". */
export function fileBadge(filename: string | null | undefined, mime?: string | null): string {
  const ext = (filename ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'svg', 'tif', 'tiff'].includes(ext) || mime?.startsWith('image/')) return 'IMG'
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext.toUpperCase()
  return 'FILE'
}

/** "Mon, 28 Sept · 06:33" for the message header; "Thu, 25 Sept" for the one-line rows. */
export function fmtWhen(iso: string | null, withTime = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
  if (!withTime) return date
  return `${date} · ${d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** The trailing signature, when a known marker makes it certain: our own outbound signature
 *  rule (see lib/signature-html), Gmail's gmail_signature div, Outlook's Signature div, or the
 *  plain-text "-- " delimiter. Anything less certain stays in the body: show more, never less. */
const SIG_HTML_MARKERS = [
  /<hr[^>]*border-top:\s*1px solid #e5e7eb[^>]*>/i,
  /<div[^>]*class="[^"]*gmail_signature[^"]*"/i,
  /<div[^>]*id="Signature"/i,
]
export function splitSignatureHtml(html: string): { main: string; signature: string | null } {
  let cut = -1
  for (const re of SIG_HTML_MARKERS) { const m = re.exec(html); if (m && m.index > 40 && (cut < 0 || m.index < cut)) cut = m.index }
  if (cut < 0) return { main: html, signature: null }
  return { main: html.slice(0, cut), signature: html.slice(cut) }
}
export function splitSignatureText(text: string): { main: string; signature: string | null } {
  const i = text.search(/^-- ?$/m)
  if (i <= 0) return { main: text, signature: null }
  return { main: text.slice(0, i).replace(/\s+$/, ''), signature: text.slice(i).replace(/^-- ?\n?/, '').trim() || null }
}
