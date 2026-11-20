/**
 * Which policies get a renewal record today (docs/renewals.md). Pure; tested in __tests__/open.test.ts.
 *
 * A policy is renewable when it is bound or live on the register (not a quote), filed under a
 * client and not an endorsement. Its record opens on opensOn (rules.ts) and may still open up to
 * 30 days after expiry. A policy that has ever had a record, or whose next term is already on the
 * register (same client and class, starting within 45 days of its end), gets none.
 */
import { looksLikeEndorsement } from '@/lib/policies/endorsement'
import { GRACE_DAYS, addDays, daysBetween, opensOn } from './rules'

export type OpenPolicy = {
  id: string; company_id: string | null; policy_number?: string | null; class_of_insurance?: string | null; product_line?: string | null
  description?: string | null; start_date?: string | null; end_date: string | null; lifecycle?: string | null; is_eb?: boolean | null
  line_code?: string | null; companies?: { kind?: string | null } | null
}

const LIFECYCLES = new Set(['bound', 'live', 'renewal_due'])
export const SUCCESSOR_DAYS = 45

export const renewable = (p: OpenPolicy): boolean =>
  LIFECYCLES.has(p.lifecycle ?? '') && !!p.company_id && (!p.companies?.kind || p.companies.kind === 'client') && !looksLikeEndorsement(p)

const sameClass = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
export const hasSuccessor = (p: OpenPolicy, all: readonly OpenPolicy[]): boolean => !!p.end_date && all.some(o => o.id !== p.id && o.company_id === p.company_id
  && sameClass(o.class_of_insurance, p.class_of_insurance) && !!o.start_date && !!o.end_date
  && Math.abs(daysBetween(p.end_date!, o.start_date)) <= SUCCESSOR_DAYS && o.end_date > p.end_date!)

export function dueToOpen<P extends OpenPolicy>(policies: readonly P[], have: ReadonlySet<string>, today: string): P[] {
  const from = addDays(today, -GRACE_DAYS)
  return policies.filter(p => renewable(p) && !!p.end_date && p.end_date >= from && !have.has(p.id)
    && (opensOn(p) ?? '9999-12-31') <= today && !hasSuccessor(p, policies))
}
