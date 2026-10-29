/**
 * Employment Benefits: who needs underwriting, and groups an insurer will not take as quoted.
 *
 * Portfolio-rated SME schemes accept most lives without questions. Above a free cover limit, or
 * past an age, the insurer asks for a health declaration; below a minimum number of employees it
 * declines the plan. The numbers are the insurers' own, from the brochures and calculators read on
 * 29–30 Oct 2026 (sources in each entry). Pure; no I/O.
 */
import type { InsurerKey } from './ladder'
import { sumOf } from './ladder'

type Thresholds = {
  /** Term life above this sum assured needs a health declaration. */
  gtl?: number
  /** Critical illness above this sum assured needs a health declaration. */
  gci?: number
  /** Age at or above this, with term life or critical illness, needs a health declaration. */
  lifeAge?: number
  /** Age at or above this, on any cover, needs a health declaration. */
  anyAge?: number
  /** Fewest employees the scheme accepts. */
  minEmployees?: number
  /** Most lives the scheme takes as a package; above it, ask for a custom quote. */
  maxLives?: number
  source: string
}

export const UNDERWRITING: Record<InsurerKey, Thresholds> = {
  rcc: { gtl: 150_000, gci: 75_000, lifeAge: 66, minEmployees: 1, source: 'RCC Enhanced III application form v3, C505–C506, O226' },
  income: { gtl: 150_000, gci: 100_000, lifeAge: 65, minEmployees: 2, source: 'Income FlexCare 2026 calculator, Working U4:Y4; brochure' },
  qbe: { anyAge: 70, minEmployees: 2, source: 'QBE Steadfast MCare+ brochure V12' },
  singlife: { gtl: 150_000, minEmployees: 2, source: 'Singlife MyBenefits Plus brochure (Jun 2022); underwriting FAQ' },
  aia: { gtl: 180_000, gci: 90_000, lifeAge: 64, minEmployees: 2, maxLives: 50, source: 'AIA Flexi Vital Care Plus brochure (May 2025) p5' },
  cigna: { minEmployees: 2, source: 'Cigna Care Connect 1.0 published rates 2025' },
}

export type UwMember = { name: string; relationship: string; age: number | null }
export type UwLine = { member: string; reason: string }
export type UwResult = { declarations: UwLine[]; group: string[] }

const isDependant = (r: string) => /spouse|child|dependa|dependent|son|daughter|wife|husband|partner/i.test(r)

/**
 * The health declarations and group-level problems for one insurer, given the lives (with ages on
 * that insurer's basis) and the term life and critical illness plans each employee holds.
 */
export function underwriting(ins: InsurerKey, members: UwMember[], lifePlans: { gtl?: string | null; gci?: string | null }): UwResult {
  const t = UNDERWRITING[ins]
  const declarations: UwLine[] = []
  const gtlSum = lifePlans.gtl ? sumOf(ins, 'GTL', lifePlans.gtl) : null
  const gciSum = lifePlans.gci ? sumOf(ins, 'GCI', lifePlans.gci) : null
  for (const m of members) {
    const reasons: string[] = []
    const life = !isDependant(m.relationship) && (gtlSum != null || gciSum != null)
    if (life && t.gtl != null && gtlSum != null && gtlSum > t.gtl) reasons.push(`term life S$${(gtlSum / 1000).toLocaleString('en-SG')}k is above S$${t.gtl / 1000}k`)
    if (life && t.gci != null && gciSum != null && gciSum > t.gci) reasons.push(`critical illness S$${(gciSum / 1000).toLocaleString('en-SG')}k is above S$${t.gci / 1000}k`)
    if (life && t.lifeAge != null && m.age != null && m.age >= t.lifeAge) reasons.push(`age ${m.age} with life cover`)
    if (t.anyAge != null && m.age != null && m.age >= t.anyAge) reasons.push(`age ${m.age}`)
    if (reasons.length) declarations.push({ member: m.name, reason: reasons.join('; ') })
  }
  const group: string[] = []
  const employees = members.filter(m => !isDependant(m.relationship)).length
  if (t.minEmployees != null && employees < t.minEmployees) group.push(`Needs at least ${t.minEmployees} employees; ${employees} on the list`)
  if (t.maxLives != null && members.length > t.maxLives) group.push(`Package covers up to ${t.maxLives} lives; ${members.length} on the list. Ask for a custom quote`)
  if (ins === 'rcc' && employees === 1) group.push('One employee: RCC loads medical premiums by 50%')
  return { declarations, group }
}
