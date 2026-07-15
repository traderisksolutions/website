/**
 * Reply-threading helpers (Phase 2 of the reply-thread fix).
 *
 * Outgoing replies were sent as bare text — no quoted history and no threading headers —
 * so recipients (e.g. AIA on Outlook) saw disconnected messages. This module builds:
 *   • buildQuotedHistory(messages) → { html, text } — a Gmail-style nested quote of the
 *     whole prior chain, appended below the reply + signature.
 *   • buildReferences(messages)    → { inReplyTo, references } — RFC822 threading headers
 *     built from the stored Message-IDs (captured at ingest in Phase 1).
 *
 * Each stored body_html/body_text already embeds the prior quoted chain (that's how the
 * sender's client composed the reply). Quoting every message verbatim would duplicate the
 * history N times, so we strip each message's embedded quote first — keeping only that
 * message's own new content — then re-nest the full chain ourselves. Result: one clean,
 * de-duplicated conversation history.
 *
 * The HTML sanitizer is intentionally hand-rolled (no new dependency, matches the repo's
 * existing stripHtml/htmlToText style). Regex-on-HTML is imperfect, but the input is
 * trusted-ish (our own ingested mail) and the goal is defence-in-depth: strip scripts,
 * event handlers, and document-level wrappers before embedding into our outbound MIME.
 */

export type ThreadMessage = {
  from_address:       string | null
  from_name?:         string | null
  sent_at:            string | null
  body_text:          string | null
  body_html:          string | null
  rfc822_message_id?: string | null
}

// Cap how deep we quote — Gmail collapses long chains anyway, and huge MIME bodies bloat the
// send. Newest N messages preserve the useful context without unbounded growth.
const MAX_QUOTED_MESSAGES = 20

// ── Sorting ───────────────────────────────────────────────────────────────────
function bySentAtAsc(a: ThreadMessage, b: ThreadMessage): number {
  const ta = a.sent_at ? Date.parse(a.sent_at) : 0
  const tb = b.sent_at ? Date.parse(b.sent_at) : 0
  return ta - tb
}

// ── Attribution ("On <date>, <Name> <email> wrote:") ────────────────────────────
function formatAttrDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // "Tue, 14 Jul 2026 at 4:16 pm" — locale-stable, Gmail-ish.
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} at ${time}`
}

function attributionText(m: ThreadMessage): string {
  const email = m.from_address ?? ''
  const who   = m.from_name?.trim() ? `${m.from_name.trim()} <${email}>` : email
  const when  = formatAttrDate(m.sent_at)
  return when ? `On ${when}, ${who} wrote:` : `${who} wrote:`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── HTML sanitizing + un-wrapping ───────────────────────────────────────────────
function sanitizeHtml(html: string): string {
  return html
    // Drop whole dangerous/irrelevant blocks incl. their content.
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<(script|style|title|noscript|iframe|object|embed|form|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Strip document-level wrappers — we embed the fragment inside our own <body>.
    .replace(/<\/?(?:html|head|body|meta|link|base)\b[^>]*>/gi, '')
    // Remove inline event handlers (on*="…" / on*='…' / on*=bare).
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Neutralise javascript:/vbscript: URIs in href/src.
    .replace(/(href|src)\s*=\s*"(?:javascript|vbscript):[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'(?:javascript|vbscript):[^']*'/gi, "$1='#'")
    .trim()
}

// Everything from the first recognised quote container onward is the *embedded* prior chain
// — remove it so each message contributes only its own new content (we re-nest ourselves).
const HTML_QUOTE_MARKERS: RegExp[] = [
  /<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>/i,     // Gmail
  /<blockquote[^>]*type=["']cite["'][^>]*>/i,                  // Apple Mail
  /<div[^>]*id=["']divRplyFwdMsg["'][^>]*>/i,                  // Outlook (web/new)
  /<div[^>]*id=["']mail-editor-reference-message-container["'][^>]*>/i, // Outlook (variants)
  /<hr[^>]*(?:id=["']?stopSpelling|style=["'][^"']*border[^"']*)[^>]*>/i, // Outlook (classic)
]

function stripEmbeddedHtmlQuote(html: string): string {
  let cut = html.length
  for (const re of HTML_QUOTE_MARKERS) {
    const m = re.exec(html)
    if (m && m.index < cut) cut = m.index
  }
  return html.slice(0, cut)
}

// Plain-text: cut from the first "On … wrote:", "-----Original Message-----", the
// Outlook "From: … Sent: …" header block, or a run of ">"-quoted lines.
const TEXT_QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^On\s.+\bwrote:\s*$/im,
  /^\s*From:\s.+$/im,
  /^_{5,}\s*$/m,
]

function stripEmbeddedTextQuote(text: string): string {
  const normalised = text.replace(/\r\n/g, '\n')
  let cut = normalised.length
  for (const re of TEXT_QUOTE_MARKERS) {
    const m = re.exec(normalised)
    if (m && m.index < cut) cut = m.index
  }
  // Also drop a trailing block of ">"-prefixed lines that some clients emit without a header.
  const lines = normalised.slice(0, cut).split('\n')
  while (lines.length && /^\s*>/.test(lines[lines.length - 1])) lines.pop()
  return lines.join('\n').trim()
}

// ── Public: quoted history block ────────────────────────────────────────────────
export function buildQuotedHistory(messages: ThreadMessage[]): { html: string; text: string } {
  const ordered = [...messages].sort(bySentAtAsc)
  // Newest first, capped.
  const desc = ordered.reverse().slice(0, MAX_QUOTED_MESSAGES)
  if (desc.length === 0) return { html: '', text: '' }

  // HTML: nest oldest→outermost so the newest message wraps the whole chain.
  let inner = ''
  for (let i = desc.length - 1; i >= 0; i--) {
    const m       = desc[i]
    const rawBody = m.body_html ? sanitizeHtml(stripEmbeddedHtmlQuote(m.body_html))
                                : `<p style="white-space:pre-wrap">${escapeHtml(stripEmbeddedTextQuote(m.body_text ?? ''))}</p>`
    inner =
      `<div class="gmail_quote">` +
        `<div dir="ltr" class="gmail_attr" style="color:#555">${escapeHtml(attributionText(m))}</div>` +
        `<blockquote class="gmail_quote" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">` +
          `${rawBody}${inner}` +
        `</blockquote>` +
      `</div>`
  }

  // Text: attribution for message k at depth k, its body at depth k+1 (newest k=0).
  const textLines: string[] = []
  desc.forEach((m, k) => {
    const prefix = (n: number) => '> '.repeat(n)
    textLines.push(prefix(k) + attributionText(m))
    const body = stripEmbeddedTextQuote(m.body_text ?? (m.body_html ? '' : ''))
    for (const line of body.split('\n')) textLines.push(prefix(k + 1) + line)
  })

  return { html: inner, text: textLines.join('\n') }
}

// ── Public: threading headers ───────────────────────────────────────────────────
export function buildReferences(messages: ThreadMessage[]): { inReplyTo?: string; references?: string } {
  const ids = [...messages]
    .sort(bySentAtAsc)
    .map(m => m.rfc822_message_id?.trim())
    .filter((x): x is string => !!x)
  if (ids.length === 0) return {}
  return { inReplyTo: ids[ids.length - 1], references: ids.join(' ') }
}
