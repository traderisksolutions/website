/**
 * Liability sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The calls Nathan makes on liability requests (threads Jun–Nov 2026), by flow (lines.ts liabilityFlow):
 *   contract  the clause decides the cover: a CAR policy's third-party section may already meet it;
 *             a clause that also names workmen's compensation or professional indemnity needs those
 *   products  sales by territory decide the market; USA or Canada exposure is declined by most local
 *             insurers and goes to the casualty specialists, sometimes as a master policy
 *   event     dates, venue, attendance and activities are priced, so they are asked first
 *   any       advice or design work is a PI exposure that PL does not cover
 */
import { liabilityFlow } from '@/lib/placement/lines'
import type { Companion } from './types'
import type { LineReviewer } from './types'

const US_CA = /\b(usa|u\.s\.a?\.?|united states|america|canada|north america)\b/i
const ADVICE = /\b(consult\w*|design\w*|advis\w*|architect\w*|engineering consult\w*|it services?|software|saas|surveyor|interior design|project manag\w*|planner)\b/i
const CAR_TPL = /\b(contractor'?s'? all risks?|\bcar\b|erection all risks?|\bear\b)\b/i
const WORKMEN = /\b(workmen'?s? comp\w*|work injury|wica|employees?'? compensation)\b/i
const PI_CLAUSE = /\b(professional indemnity|\bpi\b|design liability|design responsibility)\b/i
const ATTENDANCE = /\b\d[\d,]*\s*(?:pax|guests?|attendees?|visitors?|people|participants?)\b/i
const DATE = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/i

export const reviewLiability: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  const requested = new Set(ctx.lines.map(l => l.product_line))
  // PL asked with a CAR or a bond is cover for that job, whatever the fields say.
  const onProject = requested.has('construction_car') || requested.has('surety_bonds')
  const flow = onProject ? 'contract' : liabilityFlow(line.spec)
  const asks: string[] = [], notes: string[] = [`Liability flow: ${flow}`]
  const companions: Companion[] = []
  let hold = false
  const clause = `${x.requirement ?? ''}`
  const words = `${clause}\n${ctx.text}`

  if (flow === 'contract') {
    // With a CAR on the job the letter of award is already asked for; the clause is asked, not waited on.
    if (!clause.trim()) { asks.push('The clause in the contract, tender or lease that sets out the insurance required, with the limit'); hold = !onProject }
    if (CAR_TPL.test(words) || requested.has('construction_car')) notes.push("Check whether the CAR policy's third-party section meets the clause before quoting a standalone PL")
    if (WORKMEN.test(clause) && !requested.has('wica')) companions.push({ product_line: 'wica', ask: 'The contract also asks for work injury compensation cover for your employees. Would you like us to quote it?', why: 'clause names workmen\'s compensation' })
    if (PI_CLAUSE.test(clause) && !requested.has('professional_indemnity')) companions.push({ product_line: 'professional_indemnity', ask: 'The contract also asks for professional indemnity cover for design work. Would you like us to quote it?', why: 'clause names PI or design liability' })
  }
  if (flow === 'products') {
    if (!String(x.products ?? '').trim()) { asks.push('Your products, and sales for the last year by country'); hold = true }
    if (US_CA.test(`${x.products ?? ''}\n${ctx.text}`)) { notes.push('USA or Canada exposure: most local insurers decline. Ask the casualty specialists first; consider a master policy with locally admitted US cover'); asks.push('Sales into the USA and Canada for the last year and the next 12 months, and whether you have a US entity') }
  }
  if (flow === 'event') {
    const missing = [!DATE.test(ctx.text) && 'the event dates', !/\bvenue|at\s+[A-Z]/.test(ctx.text) && !x.location && 'the venue', !ATTENDANCE.test(ctx.text) && 'the expected attendance per day', 'the activities (food, rides, stage, fireworks)'].filter(Boolean)
    if (missing.length > 1) { asks.push(`For the event: ${missing.join(', ')}`); hold = true }
  }
  if (flow === 'sme' && !String(x.turnover ?? '').trim()) asks.push('Your turnover for the last financial year and the estimate for the next 12 months')
  if (ADVICE.test(`${x.business ?? ''} ${line.spec.scope ?? ''}`) && !requested.has('professional_indemnity') && !companions.some(c => c.product_line === 'professional_indemnity')) {
    notes.push('Advice or design work: PL does not cover errors in it')
    companions.push({ product_line: 'professional_indemnity', ask: 'Your work includes advice or design. Public liability does not cover errors in that work. Would you also like a professional indemnity quote?', why: 'advice or design business' })
  }
  if (!String(x.claims_history ?? '').trim()) asks.push('Liability claims in the last 3 years, or "nil"')
  return { asks, hold, notes, companions }
}
