/**
 * Intake's routing rules that need no database. Pure, so each is tested.
 */
import { caseModeFor } from '@/lib/admin/b/kinds'
import { clearsOnMessage, type LaterFields } from '@/lib/admin/b/later'

/**
 * Whose case a message belongs to. A thread filed under a client, or under a partner broker
 * (whose case reader files each case under the end client), keeps that company. A thread filed
 * under an insurer, TPA, vendor or other company falls back to the client the references name.
 */
export function caseCompanyFor(thread: { companyId: string | null; kind: string | null | undefined }, refCompany: string | null): string | null {
  if (!thread.companyId) return refCompany
  return caseModeFor(thread.kind) === 'none' ? refCompany : thread.companyId
}

/** Fact reading is for client mail only: never an insurer's, a partner's, a TPA's or a vendor's. */
export function readsFacts(senderKind: string, companyKind: string | null | undefined): boolean {
  return senderKind === 'client' && caseModeFor(companyKind) === 'client'
}

/** The items on this thread whose "come back later" a message from this side ends. */
export function laterToClear(items: (LaterFields & { id: string })[], senderSide: string): string[] {
  return items.filter(i => clearsOnMessage(i, senderSide)).map(i => i.id)
}


/**
 * The threads a case read should look at. Null means the full read: the group has no ledger yet
 * (no cursor and no entries). Otherwise the threads of the new ledger entries plus the threads
 * named in the task, which may be newer than the ledger.
 */
export function focusThreads(i: { cursor: number; entries: { thread_id: string | null }[]; payloadThreads: string[] }): string[] | null {
  if (i.cursor === 0 && i.entries.length === 0) return null
  return Array.from(new Set([...i.payloadThreads, ...i.entries.map(e => e.thread_id).filter((x): x is string => !!x)]))
}
