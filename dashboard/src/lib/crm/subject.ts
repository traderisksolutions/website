/**
 * A thread subject as a person would say it: reply and forward prefixes collapsed, the firm's
 * own "(TRS)" tag dropped, whitespace tidied. Pure. The housekeeping agent may store a shorter
 * title on the thread (email_threads.display_subject); this is the fallback and the input to it.
 */
const PREFIX = /^\s*(?:(?:re|fw|fwd|aw|wg|tr|sv|vs)\s*(?:\[\d+\])?\s*:\s*|\[external\]\s*|\(trs\)\s*|external:\s*)+/i

export function cleanSubject(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/ /g, ' ')
  for (let i = 0; i < 6; i++) {
    const next = s.replace(PREFIX, '')
    if (next === s) break
    s = next
  }
  s = s.replace(/\s*\(trs\)\s*/gi, ' ').replace(/\s*\[external\]\s*/gi, ' ').replace(/\s+/g, ' ').replace(/^\s*[-–|:]\s*/, '').trim()
  return s || '(no subject)'
}

/** The title to show for a thread: the housekeeping agent's, else the cleaned subject. */
export function threadTitle(t: { subject?: string | null; display_subject?: string | null }): string {
  const d = (t.display_subject ?? '').trim()
  return d || cleanSubject(t.subject)
}
