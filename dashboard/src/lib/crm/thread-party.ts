/**
 * Who a thread is from, as a person labels it in the Inbox rail: a client, an insurer, or a
 * referral (a business that refers clients, such as Mednefits). The label is the kind of the
 * company the thread is filed under, so it holds for every thread from that company. An insurer
 * or referral thread is about a client, named on `thread_insurers` (`client-link.ts`).
 */
import type { CompanyKind } from './types'

export const PARTIES = ['client', 'insurer', 'referral'] as const
export type Party = typeof PARTIES[number]

export const PARTY_LABEL: Record<Party, string> = { client: 'Client', insurer: 'Insurer', referral: 'Referral' }

/** Pure. The company kind a label sets. */
export function kindOfParty(p: Party): CompanyKind {
  return p === 'referral' ? 'partner' : p
}

/** Pure. The label a company kind reads as; null for a kind the three do not cover (TPA, vendor, other). */
export function partyOfKind(kind: string | null | undefined): Party | null {
  return kind === 'client' ? 'client' : kind === 'insurer' ? 'insurer' : kind === 'partner' ? 'referral' : null
}

export function isParty(v: unknown): v is Party {
  return typeof v === 'string' && (PARTIES as readonly string[]).includes(v)
}
