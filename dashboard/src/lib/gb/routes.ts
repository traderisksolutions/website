/**
 * A route per insurer (docs/eb-v2.md section 5, step 2; gap G24): Brochure price when the house
 * workbook's card prices this census as it stands, else Insurer to quote, with every reason shown.
 * Decided by code from rules already held: package size limits (table-version.ts), minimum group
 * and lives (underwriting.ts), the age past which an insurer asks for a health declaration on any
 * cover, and the rate card's dates (eb-price.ts rateWarnings). Pure; tested in gb-routes.test.ts.
 *
 * A life who needs a declaration only with term life or critical illness does not change the route:
 * it is listed as a note, because the cover chosen decides it.
 */
import { memberAge, type Member } from '@/lib/gb-quote'
import type { InsurerKey } from './ladder'
import { UNDERWRITING } from './underwriting'
import { PACKAGE_LIMITS } from './table-version'

export type Route = 'brochure' | 'quote'
export type InsurerRoute = { product: string; route: Route; reasons: string[]; notes: string[] }

const KEY: Record<string, InsurerKey> = {
  'Steadfast MCare+': 'qbe', 'RCC Enhanced III': 'rcc', 'Income FlexCare': 'income', 'Singlife MyBenefits Plus': 'singlife', 'AIA Flexi Vital Care Plus': 'aia',
}
/** The five house products, in the workbook's order. */
export const ROUTE_PRODUCTS = Object.keys(KEY)
const LIMIT_NAME: Record<InsurerKey, string> = { qbe: 'qbe', income: 'income', singlife: 'singlife', aia: 'aia', rcc: 'rcc', cigna: 'cigna' }
const isEmployee = (m: Member) => /^(self|employee|member|principal)$/i.test(String(m.relationship ?? '').trim())

export function routeFor(product: string, members: readonly Member[], effectiveDate: string, warnings: readonly string[] = []): InsurerRoute {
  const reasons: string[] = [], notes: string[] = []
  const key = KEY[product]
  const employees = members.filter(isEmployee).length
  const lives = members.length
  if (key) {
    const lim = PACKAGE_LIMITS.find(l => l.insurer === LIMIT_NAME[key] || (key === 'singlife' && l.insurer === 'singlife'))
    if (lim?.max != null && employees > lim.max) reasons.push(`${employees} employees, above the package limit of ${lim.max}`)
    if (lim?.min != null && employees < lim.min) reasons.push(`${employees} ${employees === 1 ? 'employee' : 'employees'}, below the package minimum of ${lim.min}`)
    const t = UNDERWRITING[key]
    if (t.minEmployees != null && employees < t.minEmployees && !(lim?.min != null && employees < lim.min)) reasons.push(`${employees} ${employees === 1 ? 'employee' : 'employees'}, below the minimum of ${t.minEmployees}`)
    if (t.maxLives != null && lives > t.maxLives) reasons.push(`${lives} lives, above the package limit of ${t.maxLives}`)
    const ages = members.map(m => ({ m, age: memberAge(m, effectiveDate, 'last_birthday') }))
    if (t.anyAge != null) {
      const over = ages.filter(a => a.age != null && a.age >= t.anyAge!).length
      if (over) reasons.push(`${over} ${over === 1 ? 'life' : 'lives'} aged ${t.anyAge} or over ${over === 1 ? 'needs' : 'need'} underwriting`)
    }
    if (t.lifeAge != null) {
      const over = ages.filter(a => isEmployee(a.m) && a.age != null && a.age >= t.lifeAge!).length
      if (over) notes.push(`${over} ${over === 1 ? 'employee' : 'employees'} aged ${t.lifeAge} or over ${over === 1 ? 'needs' : 'need'} a health declaration for term life or critical illness`)
    }
    if (key === 'rcc' && employees === 1) notes.push('One employee: medical premiums loaded by 50%')
  } else {
    reasons.push('No card in the house workbook')
  }
  for (const w of warnings) reasons.push(w)
  return { product, route: reasons.length ? 'quote' : 'brochure', reasons, notes }
}

export const routesFor = (products: readonly string[], members: readonly Member[], effectiveDate: string, warnings: Record<string, string[]> = {}) =>
  products.map(p => routeFor(p, members, effectiveDate, warnings[p] ?? []))
