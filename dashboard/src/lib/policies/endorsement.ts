/**
 * Mid-term endorsements are amendments to a master policy, not policies of their own. A debit
 * note raised for one bills the change; the cover, the term and the renewal date stay those of
 * the master policy. Insurers mark them by a suffix on the policy number ("/E01", "-E001",
 * "-T00004" member tags) or by wording ("Endorsement for adding 1 staff"). These helpers read
 * that, so an endorsement attaches to its master and never adds a second renewal.
 */

const SUFFIX = /\s*[/\-\s](?:E|END|ENDT|T)\s?\d{1,5}(?:\s*,\s*[A-Z0-9/\-]+)*\s*$/i
const WORDING = /endorse|amendment|additional (?:employee|staff|member|life)/i

export type PolicyLike = {
  id?: string
  policy_number?: string | null
  class_of_insurance?: string | null
  description?: string | null
  start_date?: string | null
  end_date?: string | null
}

/** "SI25Q04155/QAF/R00/E01" → "SI25Q04155/QAF/R00"; "2026-A5768313-HFW-E001" → "2026-A5768313-HFW". */
export function basePolicyNumber(n: string | null | undefined): string | null {
  if (!n) return null
  const t = n.trim()
  const base = t.replace(SUFFIX, '').trim()
  return base || t
}

export function hasEndorsementSuffix(n: string | null | undefined): boolean {
  return !!n && basePolicyNumber(n) !== n.trim()
}

export function looksLikeEndorsement(p: PolicyLike): boolean {
  return hasEndorsementSuffix(p.policy_number) || WORDING.test(`${p.class_of_insurance ?? ''} ${p.description ?? ''}`)
}

const classKey = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(WORDING, '').replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ')

export function sameClass(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = classKey(a), y = classKey(b)
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x))
}

/** The master policy an endorsement belongs to, among one customer's policies: same base
 *  number first, otherwise the one master with the same term end and class. */
export function findMasterPolicy<T extends PolicyLike>(endorsement: PolicyLike, policies: T[]): T | null {
  const base = basePolicyNumber(endorsement.policy_number)
  const masters = policies.filter(q => q !== endorsement && q.id !== endorsement.id && !looksLikeEndorsement(q))
  const byNumber = base ? masters.find(q => basePolicyNumber(q.policy_number) === base) : null
  if (byNumber) return byNumber
  const byTerm = masters.filter(q => !!endorsement.end_date && q.end_date === endorsement.end_date && sameClass(q.class_of_insurance, endorsement.class_of_insurance))
  return byTerm.length === 1 ? byTerm[0] : null
}

/** One company's policies with endorsement rows that duplicate a master's term removed, so
 *  renewal counts, next-renewal dates and calendar milestones count each cover once. */
export function withoutEndorsementDuplicates<T extends PolicyLike>(policies: T[]): T[] {
  return policies.filter(p => !looksLikeEndorsement(p) || !findMasterPolicy(p, policies))
}
