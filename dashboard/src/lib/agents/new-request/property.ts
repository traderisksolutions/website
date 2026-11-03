/**
 * Property sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The calls Nathan makes (threads Jun–Nov 2026):
 *   - the exact occupation decides the fire rating and whether a package (Shopcare, Officecare,
 *     BizSupreme) takes the risk; some trades are excluded (mobile phone shops from BizSupreme)
 *   - a tenant insures contents and renovation; the building is the landlord's unless the lease says
 *   - a lender's clause decides the building cover and the loss payee
 *   - business interruption is offered when one event would stop the business
 *   - many sites or assets declared through the year go on an open cover
 */
import type { LineReviewer } from './types'

const TENANT = /\b(tenan\w*|lease\w*|rent\w*|landlord)\b/i
const LENDER = /\b(bank|lender|financ\w*|mortgag\w*|loan)\b/i
const PORTFOLIO = /\b(portfolio|sites|locations|assets|solar|declar\w*)\b/i
const SME = /\b(shop|office|cafe|café|restaurant|clinic|retail|food stall|salon|f ?& ?b|tuition|centre)\b/i

const EQUIPMENT = new Set(['machinery_breakdown', 'electronic_equipment'])

export const reviewProperty: LineReviewer = (line, ctx) => {
  const words = ctx.text
  // Equipment and stock are insured by item and location, not as premises.
  if (EQUIPMENT.has(line.product_line)) return { asks: ['The equipment list: make, model, year, replacement value and where each item is used'], hold: false, notes: [], companions: [] }
  if (line.product_line === 'stock_throughput') return { asks: ['Stock values by location, the most held at any one location, and the yearly value moved in transit'], hold: false, notes: [], companions: [] }
  const asks: string[] = ['What the premises are used for, exactly (the trade carried on there), and the sums insured by item: building, renovation, contents, stock, machinery']
  const notes: string[] = []
  if (TENANT.test(words)) asks.push('The tenancy agreement clause on insurance, so we know whether you or the landlord insures the building')
  if (LENDER.test(words)) asks.push("The lender's insurance clause and the name to be shown as mortgagee or loss payee")
  if (!/\b(business interruption|loss of (?:profit|revenue)|bi\b)\b/i.test(words)) asks.push('Whether you would like business interruption cover, and if so your annual gross profit')
  if (PORTFOLIO.test(words)) notes.push('Several sites or assets: consider an open cover with periodic declarations')
  if (SME.test(words)) notes.push('Small premises: check the package plans (Shopcare, Officecare, BizSupreme) and their excluded trades')
  return { asks, hold: false, notes, companions: [] }
}
