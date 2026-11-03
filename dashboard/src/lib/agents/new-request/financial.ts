/**
 * Financial lines sub-agent (PI, D&O, cyber, investment managers) for a new request. Pure; tested
 * in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The calls Nathan makes (threads Jun–Nov 2026):
 *   - revenue from the USA or Canada: packaged PI excludes it, and most local markets restrict it
 *   - known circumstances: an incident that may become a claim must be disclosed before binding
 *   - switching insurer: the retroactive date and the expiring schedule carry over prior acts
 *   - D&O around a listing (IPO, US listing) and investment managers' leverage are underwritten apart
 */
import type { LineReviewer } from './types'

const US_CA = /\b(usa|u\.s\.a?\.?|united states|america|canada|north america)\b/i
const IPO = /\b(ipo|listing|listed|sgx|nasdaq|nyse|pre-ipo|spac)\b/i
const FUND = /\b(fund|leverage|ppm|private placement|vcc|asset manag\w*|fund manag\w*|ima\b)\b/i
const SWITCH = /\b(renew\w*|current insurer|existing (?:policy|cover|insurer)|expiring|incumbent)\b/i

export const reviewFinancial: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  const words = `${ctx.text}\n${x.business ?? ''} ${line.spec.scope ?? ''}`
  const asks: string[] = [], notes: string[] = []
  if (!/\b(us|usa|canada|united states|territor\w*|by country|geograph\w*)\b/i.test(`${x.revenue ?? ''} ${line.spec.scope ?? ''}`)) asks.push('Revenue for the last year by country, including any from the USA or Canada')
  if (US_CA.test(words)) notes.push('USA or Canada revenue: packaged PI excludes it; quote bespoke')
  if (line.product_line !== 'do' && !/\b(circumstance|no (?:known )?claims?|nil claims?)\b/i.test(words)) asks.push('Whether you know of any incident or complaint that could lead to a claim')
  if (SWITCH.test(words) || x.incumbent) asks.push('The expiring policy schedule, with the retroactive date')
  if (line.product_line === 'do' && IPO.test(words)) notes.push('Listing in view: D&O terms change at the IPO; quote run-off and the public-company basis')
  if ((line.product_line === 'imi' || FUND.test(words)) && line.product_line !== 'cyber') notes.push('Investment manager: insurers ask the PPM, audited accounts and fund leverage; leverage above 100% draws a subjectivity')
  return { asks, hold: false, notes, companions: [] }
}
