/**
 * CAR sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The calls Nathan makes on construction requests (threads Jun–Nov 2026):
 *   - a tender is priced indicatively from market conversations; an award is placed firm
 *   - large projects need capacity: a lead and co-insurers, or facultative reinsurance
 *   - erection or installation of plant and M&E is EAR, not CAR
 *   - ground works (piling, basements, excavation, reclaimed land) are rated on the soil report
 *     and excavation depth
 *   - works on an existing building raise principal's existing property
 *   - a financed project carries the lender's clause; workers on site need PEL or WICA
 */
import { contractValueOf } from '@/lib/placement/lines'
import type { Companion, LineReviewer } from './types'

const TENDER = /\b(tender|bid|bidding|indicative|budget(?:ary)? (?:quote|price)|estimate)\b/i
const AWARD = /\b(letter of award|loa\b|awarded|award letter|contract signed|notice to proceed)\b/i
// Words for the works themselves: "Contractors' Plant" or "equipment" alone is not an erection risk.
const ERECTION = /\b(erection|installation (?:of|works)|m ?& ?e (?:works|installation)|mechanical (?:and|&) electrical (?:works|installation)|solar (?:panels?|pv|farm|plant)|chillers?|escalators?|boilers?)\b/i
const GROUND = /\b(piling|bored piles?|basements?|excavat\w*|erss|diaphragm wall|reclaimed land|earthworks?|tunnel\w*|shoring)\b/i
const EXISTING = /\b(a ?& ?a|addition(?:s)? and alteration|renovat\w*|retrofit\w*|upgrad\w*|refurbish\w*|existing (?:building|structure|premises)|reinstatement|fitting[- ]out|fit[- ]out)\b/i
const LENDER = /\b(bank|lender|financ\w*|mortgagee|loan)\b/i
export const CAPACITY_FROM = 100_000_000

export const reviewCar: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  const words = `${ctx.text}\n${x.scope ?? ''} ${x.ground_works ?? ''} ${line.spec.scope ?? ''}`
  const asks: string[] = [], notes: string[] = []
  const companions: Companion[] = []
  const value = contractValueOf(line.spec)
  if (TENDER.test(words) && !AWARD.test(words)) notes.push('Tender: indicative terms from the market; firm terms once awarded')
  if (value != null && value >= CAPACITY_FROM) notes.push(`Contract value S$${(value / 1e6).toFixed(0)}m: plan capacity (a lead with co-insurers, or facultative reinsurance)`)
  if (ERECTION.test(words)) notes.push('Erection or installation in the scope: consider EAR rather than CAR')
  if (GROUND.test(words) && !String(x.ground_works ?? '').trim()) asks.push('The soil investigation report, the pile type and the deepest excavation, and whether the site is on reclaimed land')
  if (EXISTING.test(words) && !String(x.principals_property ?? '').trim()) asks.push("The value of the existing building or property the works are carried out on, if the contract asks for principal's existing property to be covered")
  if (LENDER.test(words)) asks.push("The lender's insurance clause and the name to be shown as mortgagee or loss payee, if the project is financed")
  const requested = new Set(ctx.lines.map(l => l.product_line))
  if (!requested.has('wica')) companions.push({ product_line: 'wica', ask: "Workers on site need work injury compensation cover. Is it already in place for this project, or should we quote project employer's liability with the CAR?", why: 'CAR without WICA or PEL' })
  return { asks, hold: false, notes, companions }
}
