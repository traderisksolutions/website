/**
 * Pending: how urgent an open case is, which side owes the next move, and which bridge of the
 * home map it sits on. Pure rules, tested in pending.test.ts; data.ts applies them.
 *
 *   red    cover lapsed or uninsured
 *   amber  money owed for more than 30 days, or a deadline inside 14 days (or passed)
 *   green  a draft is ready and nothing blocks sending
 *   grey   everything else
 *
 * A person can override the level on the case; the override wins until cleared.
 */

export type PendingLevel = 'red' | 'amber' | 'green' | 'grey'
export type Side = 'client' | 'insurer' | 'trs'
export type HomeBridge = 'rfq' | 'claims' | 'endorsements'

export const LEVEL_RANK: Record<PendingLevel, number> = { red: 0, amber: 1, green: 2, grey: 3 }
export const LEVEL_LABEL: Record<PendingLevel, string> = {
  red: 'Cover lapsed or uninsured', amber: 'Money owed or deadline inside 14 days', green: 'Ready to send', grey: 'Waiting, in time',
}
export const BRIDGE_LABEL: Record<HomeBridge, string> = { rfq: 'RFQ and renewals', claims: 'Claims', endorsements: 'Endorsements and billing' }

export type PolicyLite = { class: string | null; end_date: string | null; lifecycle: string | null }

export type PendingInput = {
  case_type: string
  status: string
  title: string | null
  summary: string | null
  next_action: string | null
  needs_human: string | null
  deadline: string | null        // YYYY-MM-DD
  waiting_since: string | null   // YYYY-MM-DD
  last_activity_at: string | null
  has_draft: boolean
  override: { level: PendingLevel; reason: string | null } | null
  /** The client's policies (same company), for the lapsed-cover check. */
  policies: PolicyLite[]
}

export type Pending = { level: PendingLevel; reason: string; since: string | null; due: string | null }

const MONEY_DAYS = 30
const DEADLINE_DAYS = 14
const DAY = 86_400_000

/** The phrases the case worker writes when cover is gone. Matched on title, summary, next action and the decision. */
export const LAPSED_PHRASES: RegExp[] = [
  /\buninsured\b/i,
  // "lapsed" alone also describes a quote or an offer; it is cover only beside cover, policy or insurance.
  /\b(?:cover(?:age)?|polic(?:y|ies)|insurance)\b[^.\n]{0,40}\blapsed\b/i,
  /\blapsed\b[^.\n]{0,24}\b(?:cover(?:age)?|polic(?:y|ies)|insurance)\b/i,
  /\bno cover\b/i,
  /\bwithout cover\b/i,
  /\bcover(?:age)? (?:has |had )?(?:expired|ended|ceased)/i,
  /\bexpired (?:on [^,.]+ )?(?:with|and) no renewal/i,
  /\bnot (?:been )?renewed\b/i,
  /\bpolicy (?:has |had )?expired\b/i,
  /\bno renewal (?:instruction|evidence|confirmation)/i,
]
/** Money that is owed: refunds, credit notes, unpaid premium. */
export const MONEY_PHRASES: RegExp[] = [/\brefund/i, /\bcredit note/i, /\bdebit note/i, /\bpremium\b.*\b(?:outstanding|unpaid|overdue)/i, /\b(?:outstanding|unpaid|overdue)\b.*\bpremium/i, /\bowed\b/i]

const RENEWABLE = new Set(['renewal', 'endorsement', 'new_quote'])
const MONEY_TYPES = new Set(['premium_billing'])

export const dayOf = (iso: string | null | undefined): string | null => (iso ? String(iso).slice(0, 10) : null)
const daysBetween = (fromIso: string, now: Date) => Math.floor((now.getTime() - Date.parse(fromIso)) / DAY)

/** True when the client has an expired policy of a class with no live successor. */
export function lapsedPolicy(policies: PolicyLite[], now: Date): PolicyLite | null {
  const today = now.toISOString().slice(0, 10)
  const liveByClass = new Set(policies.filter(p => p.end_date && p.end_date >= today && p.lifecycle !== 'declined' && p.lifecycle !== 'closed').map(p => (p.class ?? '').toLowerCase()))
  return policies.find(p => p.end_date && p.end_date < today && p.lifecycle !== 'declined' && p.lifecycle !== 'closed' && !liveByClass.has((p.class ?? '').toLowerCase())) ?? null
}

const textOf = (i: PendingInput) => [i.title, i.summary, i.next_action, i.needs_human].filter(Boolean).join('\n')
const matches = (text: string, rules: RegExp[]) => rules.find(r => r.test(text)) ?? null

export function pendingOf(i: PendingInput, now: Date): Pending {
  const since = dayOf(i.waiting_since) ?? dayOf(i.last_activity_at)
  const due = dayOf(i.deadline)
  if (i.override) return { level: i.override.level, reason: i.override.reason || 'Set by a person', since, due }
  if (i.status === 'done') return { level: 'grey', reason: 'Done', since, due }

  const text = textOf(i)
  const lapsedHit = matches(text, LAPSED_PHRASES)
  if (lapsedHit) return { level: 'red', reason: 'Cover lapsed or uninsured', since, due }
  if (RENEWABLE.has(i.case_type) && i.status === 'stalled') {
    const p = lapsedPolicy(i.policies, now)
    // A stalled renewal is the lapsed policy's own case. A stalled quote or endorsement counts only
    // when it names that class, so an unrelated expired policy does not colour it.
    const named = p?.class && new RegExp(p.class.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(i.title ?? '')
    if (p && (i.case_type === 'renewal' || named)) return { level: 'red', reason: `${p.class ?? 'Policy'} expired ${p.end_date}, no live successor`, since, due }
  }

  const waitedDays = since ? daysBetween(since, now) : 0
  const money = MONEY_TYPES.has(i.case_type) || !!matches(text, MONEY_PHRASES)
  if (money && waitedDays > MONEY_DAYS && i.status !== 'done') return { level: 'amber', reason: `Money owed ${waitedDays} days`, since, due }
  if (i.case_type === 'claim' && i.status === 'waiting_insurer' && waitedDays > MONEY_DAYS) return { level: 'amber', reason: `Insurer silent ${waitedDays} days`, since, due }
  if (due) {
    const left = Math.ceil((Date.parse(due) - now.getTime()) / DAY)
    if (left <= DEADLINE_DAYS) return { level: 'amber', reason: left < 0 ? `Deadline passed ${-left} days ago` : left === 0 ? 'Due today' : `Due in ${left} days`, since, due }
  }

  if (i.has_draft && !i.needs_human) return { level: 'green', reason: 'Draft ready', since, due }
  return { level: 'grey', reason: i.status === 'waiting_client' ? 'Waiting on client' : i.status === 'waiting_insurer' ? 'Waiting on insurer' : 'TRS to act', since, due }
}

/** Which side owes the next move. */
export function sideOf(status: string): Side {
  if (status === 'waiting_client') return 'client'
  if (status === 'waiting_insurer') return 'insurer'
  return 'trs'
}

/** The bridge of the home map. Every case type lands on one of the three. */
export function homeBridgeOf(caseType: string): HomeBridge {
  if (caseType === 'claim') return 'claims'
  if (caseType === 'endorsement' || caseType === 'member_movement' || caseType === 'premium_billing') return 'endorsements'
  return 'rfq'
}

/** Sort key for cards: most urgent first, then the longest wait. */
export function cardOrder(a: { level: PendingLevel; days: number }, b: { level: PendingLevel; days: number }): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.days - a.days
}
