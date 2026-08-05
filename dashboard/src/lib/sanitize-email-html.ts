/**
 * Sanitizes an inbound email's raw HTML for direct display (tables, formatting, etc. intact —
 * this is what lets a premium-comparison table stay a real table instead of one bare line per
 * cell, which is what plain-text extraction collapses it to). DOMPurify's defaults strip
 * <script>, event handler attributes, and dangerous hrefs; the only thing added here is forcing
 * every link to open in a new tab, since a reviewer clicking a link inside an email shouldn't
 * navigate the whole app away from their inbox.
 */
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeEmailHtml(html: string): string {
  const clean = DOMPurify.sanitize(html)
  return clean.replace(/<a\b([^>]*)>/gi, (full, attrs: string) =>
    /\btarget\s*=/i.test(attrs) ? full : `<a${attrs} target="_blank" rel="noopener noreferrer">`
  )
}
