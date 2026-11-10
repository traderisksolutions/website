/**
 * Who may see a thread. A thread read from operations@, or from no recorded mailbox (every
 * thread before the personal mailboxes were connected), is the team's. A thread read only from
 * a person's own Gmail is theirs: visible to that person, to the operations@ account, and to a
 * colleague who was on the email (a from, to or cc address), nobody else. Decided 10 Nov 2026.
 *
 * Aliases were only written on a duplicate read before 10 Nov 2026, so operations@ holding a copy
 * is also read from the participants (visibility-server.ts adds it to the mailboxes).
 *
 * Pure. Tested in src/__tests__/mail-visibility.test.ts. The reads are in visibility-server.ts.
 */
export const OPERATIONS_MAILBOX = 'operations@trade-risksol.com'

/** The pill values: 'all' (everything the viewer may see), 'operations', or a personal address. */
export type MailboxFilter = 'all' | 'operations' | string

const lower = (xs: readonly string[]) => xs.map(x => x.toLowerCase())

/** The team's thread: operations@ holds a copy, or no mailbox was recorded. */
export function isShared(mailboxes: readonly string[]): boolean {
  return mailboxes.length === 0 || lower(mailboxes).includes(OPERATIONS_MAILBOX)
}

/** viewer null = a cron or secret-authenticated call, which sees everything. `participants` are the addresses on the thread. */
export function canSeeThread(viewer: string | null | undefined, mailboxes: readonly string[], participants: readonly string[] = []): boolean {
  if (viewer == null) return true
  if (isShared(mailboxes)) return true
  const v = viewer.toLowerCase()
  return v === OPERATIONS_MAILBOX || lower(mailboxes).includes(v) || lower(participants).includes(v)
}

/** Whether a thread sits under a pill. 'operations' is the team's threads; an address is that person's. */
export function inMailbox(filter: MailboxFilter, mailboxes: readonly string[]): boolean {
  if (filter === 'all') return true
  if (filter === 'operations') return isShared(mailboxes)
  return lower(mailboxes).includes(filter.toLowerCase())
}

/** The personal mailboxes among a list of threads, for the pill: sorted, without operations@. */
export function personalMailboxes(threads: readonly { mailboxes?: readonly string[] | null }[]): string[] {
  const out = new Set<string>()
  for (const t of threads) for (const m of t.mailboxes ?? []) if (m.toLowerCase() !== OPERATIONS_MAILBOX) out.add(m.toLowerCase())
  return Array.from(out).sort()
}
