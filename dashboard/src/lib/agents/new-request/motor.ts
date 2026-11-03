/**
 * Motor sub-agent for a new request. Pure; tested in src/lib/agents/__tests__/new-request.test.ts.
 *
 * The calls Nathan makes (threads Jun–Nov 2026):
 *   - fleet rating needs the claims history by vehicle; with heavy claims, individual renewals can
 *     beat a fleet
 *   - insurers ask the drivers' ages and licence pass dates, and name driver exclusions
 *   - vehicles expiring on different dates are aligned to one date (each policy at least a year)
 *   - the sum insured is checked against the market value of each vehicle
 */
import type { LineReviewer } from './types'

const FLEET = /\b(fleet|\d{1,3}\s*(?:vehicles|lorries|trucks|vans|cars|buses|trailers))\b/i
const SPECIAL = /\b(autonomous|self-driving|electric bus|ev bus|forklift|crane|prime mover)\b/i

export const reviewMotor: LineReviewer = (line, ctx) => {
  const x = line.spec.fields ?? {}
  const asks: string[] = [], notes: string[] = []
  const fleet = FLEET.test(`${ctx.text} ${x.vehicle_list ?? ''}`)
  asks.push("Each driver's age and driving licence pass date")
  if (!/\bncd|no[- ]claims? discount\b/i.test(ctx.text)) asks.push('The no-claim discount on each vehicle')
  if (fleet) {
    asks.push("Each vehicle's current expiry date, so the renewals can be aligned to one date")
    notes.push('Fleet: rated on the claims by vehicle; with heavy claims compare individual renewals')
  }
  if (SPECIAL.test(ctx.text)) notes.push('Specialist vehicles: few motor markets write them; ask the specialists first')
  return { asks, hold: false, notes, companions: [] }
}
