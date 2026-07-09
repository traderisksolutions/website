// Shared signature helpers for outbound composers. The signature block always
// opens with this <hr> marker; stripSignature() removes any already-appended
// signature so callers can re-append exactly one (no duplicates).

export const SIG_MARKER = 'border-top:1px solid #e5e7eb'

export function stripSignature(html: string): string {
  const re = new RegExp(`(<br\\s*/?>\\s*)?<hr[^>]*${SIG_MARKER}[^>]*>[\\s\\S]*$`, 'i')
  return html.replace(re, '').replace(/\s+$/, '')
}
