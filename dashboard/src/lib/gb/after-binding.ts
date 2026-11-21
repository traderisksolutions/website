/**
 * After binding (docs/eb-v2.md section 5 step 4, P6, gap G27), by code from records already held:
 *
 *   bill check   the premium billed on the policy's new-business or renewal debit notes against the
 *                kept quotation's figure for that insurer (and the policy's own premium); equal within
 *                2%, or the same price with 9% GST, is a match
 *   movements    each member movement on file, and whether an endorsement debit or credit note
 *                followed within 60 days
 *   claims       settled claims against premium billed for the period: the loss ratio
 *
 * Pure; tested in gb-after-binding.test.ts. No model.
 */

export const BILL_TOLERANCE = 0.02
export const FOLLOW_DAYS = 60
const GST = 0.09

export type BillStatus = 'match' | 'gst' | 'differs' | 'no_quote' | 'no_bill'
export type BillCheck = { billed: number | null; expected: number | null; source: 'quotation' | 'policy' | null; diff: number | null; pct: number | null; status: BillStatus }

export function billCheck(billed: number | null, quoted: number | null, policyPremium: number | null): BillCheck {
  const expected = quoted ?? policyPremium
  const source = quoted != null ? 'quotation' : policyPremium != null ? 'policy' : null
  if (billed == null || billed === 0) return { billed: null, expected, source, diff: null, pct: null, status: 'no_bill' }
  if (expected == null || expected === 0) return { billed, expected: null, source: null, diff: null, pct: null, status: 'no_quote' }
  const diff = billed - expected, pct = diff / expected
  if (Math.abs(pct) <= BILL_TOLERANCE) return { billed, expected, source, diff, pct, status: 'match' }
  if (Math.abs(billed - expected * (1 + GST)) <= Math.max(1, expected * 0.005)) return { billed, expected, source, diff, pct, status: 'gst' }
  return { billed, expected, source, diff, pct, status: 'differs' }
}

const day = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)

export type Movement = { id: string; date: string; filename: string }
export type Note = { date: string; kind: string; amount: number | null }
export type Followed = Movement & { note: Note | null }

/** Each movement with the first endorsement debit or credit note issued within 60 days after it. */
export function followMovements(movements: readonly Movement[], notes: readonly Note[]): Followed[] {
  const endorsements = notes.filter(n => /endorse|credit|reversal|movement/i.test(n.kind)).sort((a, b) => a.date.localeCompare(b.date))
  return [...movements].sort((a, b) => a.date.localeCompare(b.date)).map(m => {
    const from = day(m.date), to = from + FOLLOW_DAYS * 86_400_000
    return { ...m, note: endorsements.find(n => day(n.date) >= from && day(n.date) <= to) ?? null }
  })
}

/** Claims settled over premium billed; null without premium. */
export const lossRatio = (settled: number, premium: number | null): number | null => (premium && premium > 0 ? settled / premium : null)
