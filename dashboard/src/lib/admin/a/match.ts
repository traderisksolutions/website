/**
 * Which open case a message belongs to. Pure: the caller loads the candidates.
 *
 * Strongest first: an insurer claim reference, a policy number, then the same outside people on
 * a subject about the same thing within 60 days. Two candidates that score the same are not
 * guessed between; the case reader decides.
 */
import { overlap } from './signals'

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
  const policyHit = c.policyRefs.find(r => refs.has(r))
  if (policyHit) {
    // A policy has many cases (a claim and its renewal); claim talk prefers the claim.
    const fits = m.claimLike === (c.caseType === 'claim')
    return { workItemId: c.workItemId, score: fits ? 0.95 : 0.75, joinedBy: 'policy_no', evidence: `policy number ${policyHit}` }
  }
  const recent = !c.lastActivity || Math.abs(Date.parse(m.sentAt) - Date.parse(c.lastActivity)) <= 60 * DAY
  if (!recent) return null
  const shared = m.people.filter(p => c.people.includes(p))
  const words = overlap(m.subjectWords, c.subjectWords)
  if (shared.length >= 1 && words >= 0.5) return { workItemId: c.workItemId, score: 0.8 + Math.min(0.1, words / 10), joinedBy: 'subject', evidence: `${shared[0]} on both; subject "${c.title}"` }
  if (shared.length >= 2 && words >= 0.3) return { workItemId: c.workItemId, score: 0.7, joinedBy: 'people', evidence: `${shared.slice(0, 2).join(', ')} on both` }
  return null
}

/** The one case to join, or null when none fits or two fit equally. */
export function bestCase(m: MessageSignals, candidates: CaseCandidate[], threshold = 0.7): CaseMatch | null {
  const scored = candidates.map(c => scoreCase(m, c)).filter((x): x is CaseMatch => !!x && x.score >= threshold).sort((a, b) => b.score - a.score)
  if (!scored.length) return null
  if (scored.length > 1 && scored[1].score === scored[0].score && scored[1].workItemId !== scored[0].workItemId) return null
  return scored[0]
}

/** Within a burst, a case read waits until this long after the last message. */
export const DEBOUNCE_MS = 10 * 60_000

/** When the debounced read should run, given the burst's last message time. */
export const debouncedRunAfter = (lastAt: number) => new Date(lastAt + DEBOUNCE_MS).toISOString()
