/**
 * Reads the Inbox page made on the server for its first screen (src/app/engagement/page.tsx), handed
 * to the pieces that would otherwise fetch them on mount: the open thread's next-actions bar, its
 * referral reading and its stored summaries. Each is taken once, within a minute; every later read (a reload after
 * an action, another thread) goes to the API as before.
 */
const kept = new Map<string, { at: number; value: unknown }>()
/** A read not taken within a minute (the thread was never opened) is stale and dropped. */
const TTL = 60_000

export const firstPaintKey = {
  bar: (threadId: string) => `bar:${threadId}`,
  referral: (threadId: string) => `referral:${threadId}`,
  summaries: (threadId: string) => `summaries:${threadId}`,
}

/** Called by the page before its children mount. */
export function keepFirstPaint(key: string, value: unknown) {
  kept.set(key, { at: Date.now(), value })
}

/** The kept read for this key, once; undefined when there is none. */
export function takeFirstPaint<T>(key: string): T | undefined {
  const hit = kept.get(key)
  kept.delete(key)
  return hit && Date.now() - hit.at < TTL ? hit.value as T : undefined
}
