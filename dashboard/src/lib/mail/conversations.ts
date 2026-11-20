/**
 * The conversations inside one thread. A thread can hold more than one: a broker forwards the
 * client's email and then writes to the insurer, the new email carries the old reply headers, and
 * ingest files both under one thread (the Deluge travel thread holds the client's "Manfred: Deluge
 * Annual Travel Insurance" and Chubb's "(TRS) Chubb - Deluge (Annual Travel)"). Grouped by subject
 * with the reply and forward prefixes removed; a conversation is the insurer's when an insurer's
 * domain wrote on it, the client's when only others outside TRS did.
 *
 * Pure. Tested in src/__tests__/mail-conversations.test.ts.
 */
export type ConvMessage = { thread_id: string; subject: string | null; from_address: string | null; direction: string; sent_at: string | null }
export type Conversation = {
  subject: string
  side: 'client' | 'insurer' | null
  /** The insurer by name, on an insurer's conversation. */
  insurer: string | null
  /** Who wrote from outside TRS, by name where known, newest first. */
  people: string[]
  count: number
  last: string | null
}

// Out-of-office answers ("Automatic reply:", "Out of Office:") join the conversation they answer.
const PREFIX = /^\s*(?:(?:re|fw|fwd|aw|sv|tr)\s*(?:\[\d+\])?\s*:|\[external\]|\(external\)|external:|automatic reply\s*:|auto(?:matic)?[- ]?reply\s*:|out of (?:the )?office\s*:)\s*/i

/** A subject without its reply and forward prefixes, spaces collapsed. "RE: [EXTERNAL] Re:  (TRS) Chubb - Deluge" → "(TRS) Chubb - Deluge". */
export function subjectRoot(subject: string | null | undefined): string {
  let s = String(subject ?? '').replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 10 && PREFIX.test(s); i++) s = s.replace(PREFIX, '').trim()
  return s
}

const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()

/**
 * Each thread's conversations, oldest first; only threads with two or more. `insurerOf` names the
 * insurer behind a domain (null when the domain is not an insurer's); `isTrs` tells TRS's own
 * addresses; `nameOf` gives a person's name for an address.
 */
export function conversationsOf(
  msgs: readonly ConvMessage[],
  insurerOf: (domain: string) => string | null,
  isTrs: (email: string) => boolean,
  nameOf: (email: string) => string | null = () => null,
): Map<string, Conversation[]> {
  const byThread = new Map<string, Map<string, { subject: string; msgs: ConvMessage[] }>>()
  for (const m of msgs) {
    const root = subjectRoot(m.subject)
    const key = root.toLowerCase()
    if (!key) continue
    const groups = byThread.get(m.thread_id) ?? new Map()
    const g = groups.get(key) ?? { subject: root, msgs: [] }
    g.msgs.push(m)
    groups.set(key, g)
    byThread.set(m.thread_id, groups)
  }
  const out = new Map<string, Conversation[]>()
  for (const [threadId, groups] of byThread) {
    if (groups.size < 2) continue
    const list: Conversation[] = []
    for (const g of groups.values()) {
      const sorted = [...g.msgs].sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
      const outside = sorted.map(m => bare(m.from_address)).filter(e => e.includes('@') && !isTrs(e))
      const insurer = outside.map(e => insurerOf(e.split('@')[1] ?? '')).find(Boolean) ?? null
      const people: string[] = []
      for (const e of [...outside].reverse()) { const n = nameOf(e) ?? e; if (!people.includes(n)) people.push(n) }
      list.push({
        subject: g.subject,
        side: insurer ? 'insurer' : outside.length ? 'client' : null,
        insurer,
        people,
        count: sorted.length,
        last: sorted.at(-1)?.sent_at ?? null,
      })
    }
    out.set(threadId, list.sort((a, b) => String(a.last ?? '').localeCompare(String(b.last ?? ''))))
  }
  return out
}
