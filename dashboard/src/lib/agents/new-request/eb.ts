/**
 * EB sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * Pricing stays with the rate engine (src/lib/placement/eb.ts, src/lib/gb). This adds what decides
 * the plan before any price does, from TRS's quotes Jun–Nov 2026 (30 cases reverse-engineered):
 *   - the regime by employee count: up to 50 every package is priced in-house from its card; up
 *     to 100 Income FlexCare and Singlife only; above 100 the insurers quote custom rates from a
 *     fact-find and the claims history, and the package cards are not prices
 *   - the client's considerations: budget per head, ward, dependants, outpatient
 *   - serious or pre-existing conditions, which decide between near-equal quotes (QBE MCare+
 *     takes them over, Income FlexCare does not, Singlife declines without full medical detail)
 */
import type { LineReviewer } from './types'

const GPA = /\b(gpa|personal accident)\b/i
const MEDICAL = /\b(ghs|hospital\w*|medical|gp|outpatient|surgical|gmm)\b/i
/** Employees in the request, from the member count as written ("40 staff, 12 dependants" → 40). */
export function employeesOf(memberCount: string | null | undefined): number | null {
  const m = String(memberCount ?? '').match(/(\d{1,5})\s*(?:employees?|staff|pax|lives|members?|heads?)?/i)
  return m ? Number(m[1]) : null
}

export type EbRegime = 'package' | 'package_mid' | 'custom'
export const ebRegime = (employees: number | null): EbRegime | null => employees == null ? null : employees <= 50 ? 'package' : employees <= 100 ? 'package_mid' : 'custom'

const PRE_EXISTING = /\b(pre-?existing|cancer|chemo\w*|dialysis|undergoing treatment|serious (?:illness|condition))\b/i
const BUDGET = /\b(budget|per (?:head|pax|employee)|cap|not more than|maximum)\b/i
const WARD = /\b(ward|a1|b1|b2|c ?class|private hospital|restructured)\b/i
const DEPENDANTS = /\b(dependants?|dependents?|spouse|children|family)\b/i
const OUTPATIENT = /\b(gp|outpatient|clinic|specialist|sp\b|dental|panel)\b/i

export const reviewEb: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  // Group personal accident is priced on sums insured and occupations, not on wards and clinics.
  if (line.product_line === 'group_personal_accident' || GPA.test(`${line.label ?? ''} ${x.benefits ?? ''}`) && !MEDICAL.test(`${line.label ?? ''} ${x.benefits ?? ''}`)) {
    return { asks: [], hold: false, notes: ['Personal accident: priced on sums insured and occupation class'], companions: [] }
  }
  const words = `${ctx.text}\n${x.benefits ?? ''}\n${line.spec.notes ?? ''}`
  const open = [
    !BUDGET.test(words) && 'a budget per employee, if any',
    !WARD.test(words) && 'the hospital ward wanted (for example B1 at a restructured hospital, or private)',
    !DEPENDANTS.test(words) && 'whether spouses and children are covered',
    !OUTPATIENT.test(words) && 'whether GP, specialist or dental visits are covered',
  ].filter((v): v is string => !!v)
  const asks = open.length ? [`To fit the plan to your needs: ${open.join('; ')}`] : []
  const notes: string[] = []
  const employees = employeesOf(x.member_count)
  const regime = ebRegime(employees)
  if (regime === 'custom') {
    notes.push(`${employees} employees: custom rates from the insurers (fact-find and claims), not package cards. Ask QBE, Income, Singlife, Raffles and AIA`)
    asks.push('The signed group insurance fact-find (GIFF), your company ACRA profile, and the member listing with dates of employment')
    if (x.incumbent || /renew|current insurer|existing (?:plan|policy)/i.test(words)) asks.push('From your current insurer: the full renewal notice and the detailed claims for the last 3 years')
  } else {
    notes.push(regime === 'package_mid'
      ? `${employees} employees: Income FlexCare and Singlife MyBenefits Plus packages only (QBE MCare+ takes up to 50)`
      : regime === 'package' ? `${employees} employees: package cards priced in-house (QBE MCare+, Income, Singlife, Raffles, AIA)` : 'Employee count not stated: the package or custom route is decided on the census')
    if (x.incumbent && !String(x.claims_experience ?? '').trim()) asks.push('The claims experience for the last 3 years from your current insurer')
  }
  if (!PRE_EXISTING.test(words)) asks.push('Whether any member is under treatment for a serious or pre-existing condition. It decides which insurers can take them over')
  if (employees != null && employees >= 11) notes.push('Singlife waives the 12-month pre-existing wait on a takeover from 11 lives')
  return { asks, hold: false, notes, companions: [] }
}
