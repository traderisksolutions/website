/**
 * Pull highlighted text out of an email's HTML body (#2). Clients often reply by
 * highlighting text inside the quoted previous message rather than writing a new
 * line — those highlights are otherwise lost when we strip HTML to plain text.
 *
 * Detects <mark> and any element with a non-white background-color.
 */

// Anchored with $ so "#fff"/"#ffffff" (white) match but "#ffff00" (yellow) does not.
const WHITEISH = /^(#fff|#ffffff|white|transparent|inherit|initial|none|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255[^)]*\))$/i

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractHighlights(html: string | null | undefined): string[] {
  if (!html) return []
  const out: string[] = []

  // <mark>…</mark>
  for (const m of Array.from(html.matchAll(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi))) {
    const t = stripTags(m[1]); if (t.length > 1) out.push(t)
  }

  // <tag style="… background(-color): <color> …">…</tag>  (non-white background)
  for (const m of Array.from(html.matchAll(/<([a-z]+)\b[^>]*style\s*=\s*"([^"]*background(?:-color)?\s*:\s*([^;"]+)[^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi))) {
    const color = (m[3] ?? '').trim()
    if (WHITEISH.test(color)) continue
    const t = stripTags(m[4]); if (t.length > 1) out.push(t)
  }

  // Dedupe, keep order, drop overly long spans (a whole highlighted paragraph is fine, a whole email isn't).
  const seen = new Set<string>()
  return out.filter(t => { const k = t.toLowerCase(); if (seen.has(k) || t.length > 800) return false; seen.add(k); return true })
}
