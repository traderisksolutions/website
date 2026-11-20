/**
 * Ring-fence (Jarod, 20 Nov 2026): everyone sees that a thread exists and what is outstanding on it
 * (subject, status, counts); only those who may see it (visibility.ts canSeeThread) open its mail.
 * For anyone else, opening it names whose inbox holds it. Pure and browser-safe.
 * Tested in src/__tests__/ring-fence.test.ts.
 */
import { canSeeThread, isShared, OPERATIONS_MAILBOX } from './visibility'

export type RingFence = { open: true } | { open: false; inbox: string; name: string }

/** A person's first name from their address: nathan.budiutomo@… → Nathan. */
export const firstNameOf = (email: string) => {
  const f = email.split('@')[0].split(/[._-]/)[0]
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : email
}

/** Whether the viewer opens a thread, else whose inbox holds it (the first personal mailbox). */
export function ringFence(viewer: string | null | undefined, mailboxes: readonly string[], participants: readonly string[] = []): RingFence {
  if (canSeeThread(viewer, mailboxes, participants)) return { open: true }
  const inbox = mailboxes.map(m => m.toLowerCase()).find(m => m !== OPERATIONS_MAILBOX) ?? mailboxes[0] ?? ''
  return { open: false, inbox, name: inbox ? firstNameOf(inbox) : 'a colleague' }
}

/** The inbox a thread sits in, in words: Operations for the team's, else the owners' first names. */
export function inboxLabel(mailboxes: readonly string[]): string {
  if (isShared(mailboxes)) return 'Operations'
  return Array.from(new Set(mailboxes.map(m => firstNameOf(m.toLowerCase())))).join(', ')
}
