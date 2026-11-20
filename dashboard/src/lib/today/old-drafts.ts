/**
 * Old drafts (20 Nov 2026): a Read run three times leaves three drafts to the same person on the
 * same thread asking the same thing. The newest is Latest; each older one that repeats its ask is
 * "Older · same ask" and offers only Discard. Code only: same thread, same To, and a similar
 * subject or message (an empty subject says nothing different, so it counts as the same ask).
 * Pure and browser-safe. Tested in old-drafts.test.ts.
 */
import type { DeskDraft } from './desk'

export type DraftAge = 'latest' | 'older'
type D = Pick<DeskDraft, 'id' | 'to' | 'subject' | 'body' | 'createdAt' | 'threadId' | 'anchorThreadId'>

const bare = (a: string) => (a.match(/<(.+?)>/)?.[1] ?? a).trim().toLowerCase()
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'our', 'this', 'that', 'have', 'will', 're', 'fw', 'fwd'])
const words = (s: string, min: number) => new Set(s.toLowerCase().replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, '').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= min && !STOP.has(w)))

/** Overlap of two word sets, 0 to 1 (Jaccard). */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0
  let both = 0
  for (const w of a) if (b.has(w)) both++
  return both / (a.size + b.size - both)
}

const emptySubject = (s: string) => !s.trim() || /^\(no subject\)$/i.test(s.trim())

/** Two drafts repeat the same ask: a similar subject, an empty subject on either, or a similar message. */
export function sameAsk(a: Pick<D, 'subject' | 'body'>, b: Pick<D, 'subject' | 'body'>): boolean {
  if (emptySubject(a.subject) || emptySubject(b.subject)) return true
  if (overlap(words(a.subject, 2), words(b.subject, 2)) >= 0.5) return true
  return overlap(words(a.body.slice(0, 800), 4), words(b.body.slice(0, 800), 4)) >= 0.35
}

/**
 * Per thread and recipient, newest first: the newest draft is Latest; an older draft that repeats
 * the ask of a newer one in its group is Older. Drafts alone in their group get no mark.
 */
export function markOlderDrafts(drafts: readonly D[]): Map<string, DraftAge> {
  const groups = new Map<string, D[]>()
  for (const d of drafts) {
    const thread = d.threadId ?? d.anchorThreadId
    const to = bare(String(d.to ?? ''))
    if (!thread || !to) continue
    const k = `${thread}|${to}`
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  const out = new Map<string, DraftAge>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const sorted = [...g].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const older = sorted.slice(1).filter((d, i) => sorted.slice(0, i + 1).some(n => sameAsk(n, d)))
    if (!older.length) continue
    out.set(sorted[0].id, 'latest')
    for (const d of older) out.set(d.id, 'older')
  }
  return out
}
