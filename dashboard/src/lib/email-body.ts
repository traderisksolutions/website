/**
 * Email bodies between the three forms a drafted email takes:
 * - the stored draft text (plain text; the comparison email carries Markdown pipe tables),
 * - the rich editor's HTML (Quill + quill-table-better),
 * - the HTML that leaves in the email (tables carry inline borders; mail clients drop page CSS).
 * Pure functions, no DOM: they run on the server, in the browser and in vitest alike.
 */

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PIPE_ROW = /^\s*\|.*\|\s*$/
const SEPARATOR_CELL = /^:?-{2,}:?$/

/** True when the body is already HTML (a draft saved from the editor), not plain text. */
export function looksLikeHtml(body: string): boolean {
  return /^\s*<(p|div|table|h[1-6]|ul|ol|blockquote|br|span|strong|em)\b/i.test(body)
}

function splitRow(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

/** A run of pipe rows → a table. The first row is the header (bold); a `|---|` row is dropped. */
function pipeTableHtml(rows: string[]): string {
  const cells = rows.map(splitRow).filter(r => !r.every(c => SEPARATOR_CELL.test(c)))
  if (cells.length === 0) return ''
  const width = Math.max(...cells.map(r => r.length))
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
  const [head, ...body] = cells
  const row = (r: string[], bold: boolean) =>
    `<tr>${pad(r).map(c => `<td>${c ? (bold ? `<strong>${escapeHtml(c)}</strong>` : escapeHtml(c)) : '<br>'}</td>`).join('')}</tr>`
  return `<table><tbody>${row(head, true)}${body.map(r => row(r, false)).join('')}</tbody></table>`
}

/**
 * Stored draft text → editor HTML. A blank line splits paragraphs, a single newline is a line
 * break, and two or more consecutive `| a | b |` rows become a real table — also when they sit
 * inside a paragraph between text lines. A lone pipe row stays text. HTML passes through as is.
 */
export function draftBodyToHtml(body: string): string {
  if (!body?.trim()) return ''
  if (looksLikeHtml(body)) return body
  const out: string[] = []
  for (const block of body.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)) {
    const lines = block.split('\n')
    let text: string[] = []
    const flushText = () => {
      if (text.length) out.push(`<p>${text.map(escapeHtml).join('<br>')}</p>`)
      text = []
    }
    let i = 0
    while (i < lines.length) {
      let j = i
      while (j < lines.length && PIPE_ROW.test(lines[j])) j++
      if (j - i >= 2) {
        flushText()
        out.push(pipeTableHtml(lines.slice(i, j)))
        i = j
      } else {
        text.push(lines[i])
        i++
      }
    }
    flushText()
  }
  return out.join('')
}

const decode = (s: string) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** Inline HTML (inside one block or cell) → text. */
function inlineText(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n')
}

function tableToPipes(tableHtml: string): string {
  const rows = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []
  const lines = rows.map(tr => {
    const cells = tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? []
    return `| ${cells.map(c => inlineText(c).replace(/\s+/g, ' ').replace(/\|/g, '/').trim()).join(' | ')} |`
  })
  return lines.join('\n')
}

/**
 * Editor HTML → plain text: the draft's stored body and the email's text part. Tables go back
 * to pipe rows, so the comparison stays readable in a plain-text mail client and in the record.
 */
export function htmlToDraftText(html: string): string {
  if (!html?.trim()) return ''
  const tables: string[] = []
  const withMarkers = html.replace(/<table\b[\s\S]*?<\/table>/gi, t => {
    tables.push(tableToPipes(t))
    return `\n\n\u0000T${tables.length - 1}\u0000\n\n`
  })
  const text = decode(withMarkers
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(ul|ol|div|blockquote)>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, '')
      return l && l !== href ? `${l} (${href})` : href
    })
    .replace(/<[^>]+>/g, ''))
  return text
    .replace(/\u0000T(\d+)\u0000/g, (_, n: string) => tables[Number(n)] ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const TABLE_STYLE = 'border-collapse:collapse;margin:4px 0'
const CELL_STYLE = 'border:1px solid #dadce0;padding:4px 8px;font-size:13px;vertical-align:top'

/** Prepend `style` to a tag's own style attribute, or add one. */
function withStyle(attrs: string, style: string): string {
  const m = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i)
  if (m) return attrs.replace(m[0], ` style="${style};${m[1]}"`)
  return `${attrs} style="${style}"`
}

/**
 * Editor HTML → the HTML that is mailed. Tables and cells get inline borders and padding (a
 * mail client shows none of this app's CSS); everything else is left as the editor wrote it.
 */
export function emailReadyHtml(html: string): string {
  return html
    .replace(/<table\b([^>]*)>/gi, (_, a: string) => `<table${withStyle(a.includes('cellspacing') ? a : `${a} cellspacing="0" cellpadding="0"`, TABLE_STYLE)}>`)
    .replace(/<(td|th)\b([^>]*)>/gi, (_, tag: string, a: string) => `<${tag}${withStyle(a, CELL_STYLE)}>`)
}

/** True when the editor holds no words (Quill's empty document is `<p></p>` or `<p><br></p>`). */
export function isBlankHtml(html: string): boolean {
  return htmlToDraftText(html).replace(/[|\s•-]/g, '') === '' && !/<img\b/i.test(html)
}
