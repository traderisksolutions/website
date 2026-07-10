/**
 * Conservative, deterministic cleanup of an email's plain-text body for display.
 * Fixes the common awkward-line-break cases without an AI call and without
 * changing stored data (applied at render time, so all existing + new emails
 * look clean). Preserves real paragraph breaks — it does NOT unwrap prose.
 *
 *   "1.\nCAR"            → "1. CAR"        (orphaned list marker re-joined)
 *   3+ blank lines       → one blank line
 *   trailing whitespace  → trimmed
 */

// A line that is ONLY a list marker: "1." "2)" "a." "-" "*" "•"
const ORPHAN_MARKER = /^([ \t]*(?:\d{1,3}[.)]|[a-zA-Z][.)]|[-*•]))[ \t]*\n[ \t]*(?=\S)/gm

export function cleanEmailBody(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = raw
    .replace(/\r\n?/g, '\n')       // normalise CRLF/CR → LF
    .replace(/ /g, ' ')       // non-breaking spaces → normal
    .replace(/[ \t]+\n/g, '\n')    // trailing whitespace on each line

  // Re-join a list marker sitting alone on its line with the item text below it.
  // Run twice so "1.\n2.\nCAR"-style stacks settle.
  s = s.replace(ORPHAN_MARKER, '$1 ').replace(ORPHAN_MARKER, '$1 ')

  s = s
    .replace(/\n{3,}/g, '\n\n')    // collapse runs of blank lines to one
    .replace(/^\n+/, '')           // trim leading blank lines
    .replace(/\n+$/, '')           // trim trailing blank lines

  return s
}
