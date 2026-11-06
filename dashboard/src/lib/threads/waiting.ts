/**
 * Who a thread is waiting on. The newest message is not always the answer: an out-of-office from
 * someone on copy changes nothing, and neither does a colleague forwarding the thread inside TRS.
 * Those are skipped, so the status comes from the last message between TRS and the other side.
 * Pure and browser-safe.
 */
import { isOutOfOffice } from '@/lib/admin/a/signals'
import { isTrsAddress } from '@/lib/email/recipients'

export type WaitMessage = {
  direction: string; from_address: string | null; subject: string | null; body_text?: string | null
  sent_at: string | null; to?: string[]; cc?: string[]
}

const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const AUTOMATED = /^(no-?reply|do[-_]?not[-_]?reply|mailer-daemon|postmaster)\b/i

export const isAutoReply = (m: WaitMessage) =>
  m.direction === 'inbound' && (isOutOfOffice(m.subject, m.body_text) || AUTOMATED.test(bare(m.from_address)))

/** Sent by TRS to TRS people only. No recipients on file reads as a real email. */
export const isInternalOnly = (m: WaitMessage) => {
  if (m.direction !== 'outbound') return isTrsAddress(bare(m.from_address))
  const people = [...(m.to ?? []), ...(m.cc ?? [])]
  return people.length > 0 && people.every(p => isTrsAddress(bare(p)))
}

/** The last message between TRS and the other side, from a list in date order. */
export function lastRealMessage<T extends WaitMessage>(messages: T[]): T | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isAutoReply(messages[i]) && !isInternalOnly(messages[i])) return messages[i]
  }
  return null
}

/** The auto-reply newer than the last real message, for the bar to name. */
export function autoReplyAfter<T extends WaitMessage>(messages: T[], last: T | null): T | null {
  const from = last ? messages.lastIndexOf(last) + 1 : 0
  for (let i = messages.length - 1; i >= from; i--) if (isAutoReply(messages[i])) return messages[i]
  return null
}

export const needsOurReply = (messages: WaitMessage[]) => lastRealMessage(messages)?.direction === 'inbound'
