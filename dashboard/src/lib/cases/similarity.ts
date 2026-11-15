/**
 * Thread similarity: the text a thread is embedded from, and the order it gives. Pure.
 *
 * A thread's vector is made on a CPU by scripts/embed-threads.mts and kept in `thread_vectors`; no
 * model API is called. Similarity orders what a case is offered; the rules still decide what is
 * proposed and why, and a person still picks.
 */
import { ownText } from '@/lib/admin/k/shape'

export const EMBED_MODEL = 'Xenova/bge-small-en-v1.5'
export const EMBED_DIMS = 384
const MESSAGES = 3
const PER_MESSAGE = 600
const TEXT_MAX = 1600

/** The subject, then what the first three messages say themselves: no history beneath, no closing. */
export function threadText(subject: string | null | undefined, messages: readonly { subject?: string | null; body_text?: string | null }[]): string {
  const said: string[] = []
  for (const m of messages) {
    if (said.length >= MESSAGES) break
    const t = ownText(m.body_text, m.subject, PER_MESSAGE, false)
    if (t) said.push(t)
  }
  return `${subject ?? ''}\n${said.join('\n')}`.slice(0, TEXT_MAX).trim()
}

type Dated = { id: string; last_message_at: string | null }
/** Closest first; a thread with no score comes after every scored one; newest first within a tie. */
export function bySimilarity(similarity?: ReadonlyMap<string, number>): (a: Dated, b: Dated) => number {
  return (a, b) => {
    const x = similarity?.get(a.id), y = similarity?.get(b.id)
    if (x != null && y != null && x !== y) return y - x
    if ((x == null) !== (y == null)) return x == null ? 1 : -1
    return String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? ''))
  }
}
