// Markdown → HTML for articles, with no dependency: everything is escaped first, then a
// conservative subset is applied (headings, bold, italic, code, http(s) links, lists,
// blockquotes, pipe tables, fenced code, footnotes). The engine renders its own HTML in
// Python; this one re-renders after an edit in the dashboard and must produce the same
// structure the sites style. Pure, so it is unit-tested.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'article'
}

export const anchorOf = (heading: string) => slugify(heading.replace(/[*_`]/g, ''))

function inline(text: string): string {
  return text
    .replace(/\[\^(\d+)\]/g, '<sup id="fnref-$1"><a href="#fn-$1">$1</a></sup>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line)
const isTableRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

export function renderMarkdown(md: string): string {
  const lines = esc(md.replace(/\r\n/g, '\n')).split('\n')
  const out: string[] = []
  const footnotes: { n: string; text: string }[] = []
  let paragraph: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let code: string[] | null = null
  let quote: string[] | null = null

  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = [] } }
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null } }
  const flushQuote = () => { if (quote) { out.push(`<blockquote>${quote.map(q => `<p>${inline(q)}</p>`).join('')}</blockquote>`); quote = null } }
  const flushAll = () => { flushParagraph(); flushList(); flushQuote() }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (code !== null) {
      if (/^```/.test(line.trim())) { out.push(`<pre><code>${code.join('\n')}</code></pre>`); code = null } else code.push(line)
      continue
    }
    if (/^```/.test(line.trim())) { flushAll(); code = []; continue }

    const fn = line.match(/^\[\^(\d+)\]:\s*(.+)$/)
    if (fn) { flushAll(); footnotes.push({ n: fn[1], text: inline(fn[2]) }); continue }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = heading[1].length
      const text = heading[2].trim()
      out.push(level === 2 ? `<h2 id="${anchorOf(text)}">${inline(text)}</h2>` : `<h${level}>${inline(text)}</h${level}>`)
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flushAll()
      const head = cells(line)
      let j = i + 2
      const body: string[][] = []
      while (j < lines.length && isTableRow(lines[j])) { body.push(cells(lines[j])); j++ }
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      i = j - 1
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushParagraph(); flushQuote()
      const tag = ul ? 'ul' : 'ol'
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] } }
      list.items.push((ul ?? ol)![1].trim())
      continue
    }

    const q = line.match(/^&gt;\s?(.*)$/)
    if (q) {
      flushParagraph(); flushList()
      if (!quote) quote = []
      if (q[1].trim()) quote.push(q[1])
      continue
    }

    if (line.trim() === '') { flushAll(); continue }
    if (/^-{3,}$/.test(line.trim())) { flushAll(); out.push('<hr/>'); continue }

    flushList(); flushQuote()
    paragraph.push(line.trim())
  }
  if (code !== null) out.push(`<pre><code>${code.join('\n')}</code></pre>`)
  flushAll()
  if (footnotes.length) {
    out.push(`<section class="footnotes"><ol>${footnotes.map(f => `<li id="fn-${f.n}">${f.text} <a href="#fnref-${f.n}">↩</a></li>`).join('')}</ol></section>`)
  }
  return out.join('\n')
}

/** Plain text of the markdown: no markup, markers or footnote lines. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\[\^\d+\]:.*$/gm, ' ')
    .replace(/\[\^\d+\]/g, '')
    .replace(/\[F\d+\]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+|^\s*\d+[.)]\s+|^>\s?/gm, '')
    .replace(/[*_`|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

export const wordCount = (md: string) => plainText(md).split(' ').filter(Boolean).length
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 220))

/** The first paragraph, as the dek under the title, at most 280 characters. */
export function excerptOf(md: string): string {
  const first = md.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.trim()).find(p => p && !/^(#|>|[-*]\s|\d+[.)]\s|\||```|\[\^)/.test(p))
  return plainText(first ?? '').slice(0, 280)
}

export const h2sOf = (md: string) => Array.from(md.matchAll(/^##\s+(.+)$/gm)).map(m => ({ id: anchorOf(m[1].trim()), text: m[1].trim() }))
