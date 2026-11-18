/**
 * Sanitizes an inbound email's raw HTML for direct display (tables, formatting, etc. intact —
 * this is what lets a premium-comparison table stay a real table instead of one bare line per
 * cell, which is what plain-text extraction collapses it to). DOMPurify's defaults strip
 * <script>, event handler attributes, and dangerous hrefs; the only thing added here is forcing
 * every link to open in a new tab, since a reviewer clicking a link inside an email shouldn't
 * navigate the whole app away from their inbox.
 *
 * Browser only. The server build of isomorphic-dompurify loads jsdom, whose ESM dependency fails to
 * load on Vercel (ERR_REQUIRE_ESM, a 500 on every page with an email). Callers render the plain
 * text on the server and switch to the HTML once mounted (`useIsClient`).
 */
import DOMPurify from 'dompurify'
import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/** False on the server and during hydration, true after — so the first client render matches the server's. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}

export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return ''
  const clean = DOMPurify.sanitize(html)
    // A cid: reference is only ever resolvable at ingest time (against that message's own MIME
    // parts) — one that reaches here unresolved (an email ingested before inline-image
    // resolution existed, or a cid the message genuinely didn't include) can never load. A
    // broken-image icon reads as "this app is broken"; dropping the tag reads as nothing lost.
    .replace(/<img\b[^>]*\bsrc=["']cid:[^"']*["'][^>]*>/gi, '')
  return clean.replace(/<a\b([^>]*)>/gi, (full, attrs: string) =>
    /\btarget\s*=/i.test(attrs) ? full : `<a${attrs} target="_blank" rel="noopener noreferrer">`
  )
}
