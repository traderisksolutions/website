/**
 * Which open case a message belongs to. Pure: the caller loads the candidates.
 *
 * Strongest first: an insurer claim reference, a policy number, then the same outside people on
 * a subject about the same thing within 60 days. Two candidates that score the same are not
 * guessed between; the case reader decides.
 */
import { distinctive, overlap } from './signals'

export type JoinedBy = 'policy_no' | 'claim_ref' | 'forward' | 'quoted' | 'subject' | 'people' | 'thread'

export type CaseCandidate = {
  workItemId: string
  caseType: string
  companyId: string | null
  title: string
  /** refKeys of the claim's insurer reference and claim number. */
  claimRefs: string[]
  /** refKeys of the policy numbers the case is about. */
  policyRefs: string[]
  /** Outside (non-TRS) addresses on the case's threads. */
  people: string[]
  subjectWords: string[]
  /** Words of the client's own name: every case of the client shares them, so they prove nothing. */
  nameWords?: string[]
  lastActivity: string | null
}

export type MessageSignals = {
  refs: string[]
  people: string[]
  subjectWords: string[]
  sentAt: string
  claimLike: boolean
}

export type CaseMatch = { workItemId: string; score: number; joinedBy: JoinedBy; evidence: string }

const DAY = 86_400_000

export function scoreCase(m: MessageSignals, c: CaseCandidate): CaseMatch | null {
  const refs = new Set(m.refs)
  const claimHit = c.claimRefs.find(r => refs.has(r))
  if (claimHit) return { workItemId: c.workItemId, score: 1, joinedBy: 'claim_ref', evidence: `claim reference ${claimHit}` }

  // The subject has to name the same matter: words beyond the ones every insurance subject uses
  // and beyond the client's own name (a claimant, a site, a vehicle, a number).
  const name = new Set(c.nameWords ?? [])
  const mine = distinctive(m.subjectWords).filter(w => !name.has(w))
  const theirs = new Set(distinctive(c.subjectWords).filter(w => !name.has(w)))
  const common = mine.filter(w => theirs.has(w))
  const words = overlap(mine, theirs)

  // A policy has many cases (a claim and its renewal, two claimants): its number needs two
  // matter words as well. Claim talk on a claim case scores above anything else on the policy.
  const policyHit = c.policyRefs.find(r => refs.has(r))
  if (policyHit) {
    if (common.length < 2) return null
    const fits = m.claimLike === (c.caseType === 'claim')
    return { workItemId: c.workItemId, score: fits ? 0.95 : 0.8, joinedBy: 'policy_no', evidence: `policy number ${policyHit}; subject shares "${common.slice(0, 3).join(' ')}"` }
  }
  const recent = !c.lastActivity || Math.abs(Date.parse(m.sentAt) - Date.parse(c.lastActivity)) <= 60 * DAY
  if (!recent) return null
  // Same people is not enough — one HR contact writes about every case.
  const shared = m.people.filter(p => c.people.includes(p))
  if (!shared.length || common.length < 3 || words < 0.7) return null
  return { workItemId: c.workItemId, score: 0.8 + Math.min(0.1, words / 10), joinedBy: 'subject', evidence: `${shared[0]} on both; subject shares "${common.slice(0, 3).join(' ')}"` }
}

/** The one case to join, or null when none fits or two fit equally. */
export function bestCase(m: MessageSignals, candidates: CaseCandidate[], threshold = 0.7): CaseMatch | null {
  const scored = candidates.map(c => scoreCase(m, c)).filter((x): x is CaseMatch => !!x && x.score >= threshold).sort((a, b) => b.score - a.score)
  if (!scored.length) return null
  if (scored.length > 1 && scored[1].score === scored[0].score && scored[1].workItemId !== scored[0].workItemId) return null
  return scored[0]
}

/** Within a burst, a case read waits until this long after the last message. */
/** A burst of mail on one client becomes one read; an hour, so a backfill of a mailbox does not read the client once per message. */
export const DEBOUNCE_MS = 60 * 60_000
/** A client already read inside this window is not read again for the same burst. */
export const REREAD_AFTER_MS = 4 * 3600_000

/** When the debounced read should run, given the burst's last message time. */
export const debouncedRunAfter = (lastAt: number) => new Date(lastAt + DEBOUNCE_MS).toISOString()
