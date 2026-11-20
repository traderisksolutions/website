/**
 * Who a client's thread waits on, for the company's Threads list: TRS when the last real message
 * came in, otherwise the side TRS wrote to (the insurer on a thread filed under an insurer, the
 * client on the rest). Out-of-office replies and TRS-only forwards are skipped (lastRealMessage).
 * Pure and browser-safe.
 */
import { lastRealMessage, type WaitMessage } from '@/lib/threads/waiting'

export type WaitingOn = 'client' | 'trs' | 'insurer'
export const WAITING_ON_WORD: Record<WaitingOn, string> = { client: 'Client', trs: 'TRS', insurer: 'Insurer' }

/** `messages` oldest first; `viaInsurer` = the thread is filed under an insurer and names this client. */
export function waitingOn(messages: WaitMessage[], viaInsurer: boolean, status?: string | null): WaitingOn | null {
  if (status && status !== 'active') return null
  const last = lastRealMessage(messages)
  if (!last) return null
  if (last.direction === 'inbound') return 'trs'
  return viaInsurer ? 'insurer' : 'client'
}
