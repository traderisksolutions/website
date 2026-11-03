/**
 * EB sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * Pricing stays with the rate engine (src/lib/placement/eb.ts); the model reverse-engineered from
 * Nathan's quotes plugs in here when it lands. What this adds now: the client's considerations,
 * which decide the plan before any price does.
 */
import type { LineReviewer } from './types'

const GPA = /\b(gpa|personal accident)\b/i
const MEDICAL = /\b(ghs|hospital\w*|medical|gp|outpatient|surgical|gmm)\b/i
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
  const notes = ['Priced by the rate engine at the Tier A insurers; Tier B and C only when a broker selects them']
  if (x.incumbent && !String(x.claims_experience ?? '').trim()) asks.push('The claims experience for the last 3 years from your current insurer')
  return { asks, hold: false, notes, companions: [] }
}
