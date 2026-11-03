/**
 * Renewal sub-agents: what each desk asks the client at the 90-day mark, what the broker should
 * know, and for project cover the extension check that replaces a renewal. Pure; tested in
 * src/lib/agents/__tests__/renewal-claims.test.ts. See docs/agent-routing.md (phase 4).
 *
 * From TRS's renewals Jun–Nov 2026: EB loads came in at QBE +25%, Income +15% to +40%; a
 * claims-driven WICA loading needed a call before the terms went out; financial lines renew on a
 * signed declaration with no gap in claims-made cover; an insurer asked a nil-claims confirmation
 * for a late renewal; project cover (CAR, bonds) is extended, never renewed.
 */
import { deskFor, type Desk } from '../desks'
import type { RenewalFlow } from '@/lib/cases/renewal'

export type RenewalFacts = { line: string | null; flow: RenewalFlow; endDate: string; employees?: number | null }
export type RenewalReview = {
  desk: Desk
  /** Items for the data request to the client. Empty: the line's usual documents (lines.ts). */
  asks: string[]
  notes: string[]
  /** Project cover: no renewal; ask whether the period must be extended before it ends. */
  extension: boolean
}

const PROJECT_LINES = new Set(['construction_car', 'surety_bonds'])
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function reviewRenewal(f: RenewalFacts): RenewalReview {
  const desk = deskFor(f.line)
  const up = f.flow === 'increase'
  if (f.line && PROJECT_LINES.has(f.line)) {
    return {
      desk, extension: true,
      asks: [`Whether the works will be complete by ${fmt(f.endDate)}. If not, the new completion date, so the cover is extended before it ends`, 'Whether the maintenance (defects liability) period has started, and when it ends'],
      notes: ['Project cover is extended, not renewed. An extension asked after the end date needs the insurer\'s agreement and a nil-claims letter'],
    }
  }
  switch (desk) {
    case 'eb': return {
      desk, extension: false,
      asks: ['The updated member list: date of birth, plan and dependants for each member, with joiners and leavers since the last renewal', 'Any change to the benefits you would like for the coming year', 'Whether any member is under treatment for a serious condition'],
      notes: [
        ...(up ? ['Loss ratio over the method\'s threshold: expect a load (2026 renewals: QBE +25%, Income +15% to +40%)'] : []),
        ...(f.employees != null && f.employees <= 100 ? [`${f.employees} employees: compare the package cards against the renewal terms`] : []),
      ],
    }
    case 'wica': return {
      desk, extension: false,
      asks: ['Estimated annual wages and headcount for each category of work for the coming year', 'Work injuries in the past year, including any reported to MOM'],
      notes: up ? ['Claims-driven loading likely: explain it to the client by phone before the terms go out'] : [],
    }
    case 'financial': return {
      desk, extension: false,
      asks: ['The renewal proposal form, signed and dated within 30 days of the renewal date', 'Revenue for the last year by country', 'Whether you know of any incident or complaint that could lead to a claim'],
      notes: ['Claims-made cover: bind before the end date so there is no gap; the retroactive date carries over'],
    }
    case 'property': return {
      desk, extension: false,
      asks: ["Sums insured by item, updated to today's cost of rebuilding and replacing", 'Any change in what the premises are used for, or any new location'],
      notes: ['A sum insured below value is cut by the average clause at claim time; check it is current'],
    }
    case 'motor': return {
      desk, extension: false,
      asks: ['Vehicles added or sold since the last renewal', 'Drivers added, with age and licence pass date', 'Accidents in the past year, including those not claimed'],
      notes: up ? ['Claims this year: compare the fleet renewal with renewing vehicles one by one'] : [],
    }
    case 'liability': return {
      desk, extension: false,
      asks: ['Turnover for the last year and the estimate for the next 12 months', 'Any contract or lease that now asks for this cover, or a higher limit', 'Liability claims or complaints in the past year'],
      notes: [],
    }
    default: return { desk, extension: false, asks: [], notes: [] }
  }
}
