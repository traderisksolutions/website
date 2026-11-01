/**
 * Which companies may hold client cases. Pure.
 *
 * Only a client (or a company with no kind yet) is a policyholder TRS acts for. A partner broker
 * sends work for its own end clients: the cases are theirs, not the partner's. Insurers, TPAs,
 * vendors and everything else never hold a client case.
 */
export type CaseMode = 'client' | 'partner' | 'none'

export function caseModeFor(kind: string | null | undefined): CaseMode {
  if (!kind || kind === 'client') return 'client'
  if (kind === 'partner') return 'partner'
  return 'none'
}

export const isClientKind = (kind: string | null | undefined) => caseModeFor(kind) === 'client'
