// When campaign emails go out. Pure; tested.
// Office hours: Monday to Friday, 09:00–17:00 in the recipient's market.

const OFFSET: Record<string, number> = { SG: 8, HK: 8, MY: 8, ID: 7, TH: 7, VN: 7 }
const offsetOf = (loc: string | null | undefined) => OFFSET[(loc ?? 'SG').toUpperCase()] ?? 8
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** First moment at or after t that is inside office hours in the market. */
export function nextOfficeTime(t: Date, location: string | null): Date {
  const off = offsetOf(location) * HOUR
  let local = new Date(t.getTime() + off) // fields read as UTC = local time
  for (let i = 0; i < 14; i++) {
    const day = local.getUTCDay()
    const h = local.getUTCHours() + local.getUTCMinutes() / 60
    if (day >= 1 && day <= 5 && h >= 9 && h < 17) return new Date(local.getTime() - off)
    const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
    local = new Date(day >= 1 && day <= 5 && h < 9 ? base + 9 * HOUR : base + DAY + 9 * HOUR)
  }
  return new Date(local.getTime() - off)
}

/** Expected send times of a whole sequence from its first send: each email waits its delay
 *  after the previous one, then the next office hour. */
export function estimateSequence(first: Date, delaysAfterPrevious: number[], location: string | null): Date[] {
  const out = [first]
  for (const d of delaysAfterPrevious) out.push(nextOfficeTime(new Date(out[out.length - 1].getTime() + d * DAY), location))
  return out
}

/** Singapore calendar day of an instant, YYYY-MM-DD. */
export const sgtDay = (t: Date) => new Date(t.getTime() + 8 * HOUR).toISOString().slice(0, 10)

/** First-send times for newly approved contacts: 15 minutes apart within office hours, no more
 *  than capPerDay first emails on any Singapore day (counting ones already scheduled). */
export function assignSlots(locations: (string | null)[], now: Date, capPerDay: number, takenByDay: Record<string, number>): Date[] {
  const taken = { ...takenByDay }
  const out: Date[] = []
  let cursor = nextOfficeTime(new Date(now.getTime() + 10 * 60_000), 'SG')
  for (const loc of locations) {
    let slot = nextOfficeTime(cursor, loc)
    while ((taken[sgtDay(slot)] ?? 0) >= capPerDay) {
      const off = offsetOf(loc) * HOUR
      const local = new Date(slot.getTime() + off)
      slot = nextOfficeTime(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DAY - off), loc)
    }
    taken[sgtDay(slot)] = (taken[sgtDay(slot)] ?? 0) + 1
    out.push(slot)
    cursor = new Date(slot.getTime() + 15 * 60_000)
  }
  return out
}

/** Pure: what came back in a thread we started, from its From headers. */
export type ThreadState = 'reply' | 'bounce' | 'none'
export function classifyThread(sender: string, froms: string[]): ThreadState {
  const others = froms.map(f => f.toLowerCase()).filter(f => f && !f.includes(sender.toLowerCase()))
  if (others.some(f => !/mailer-daemon|postmaster/.test(f))) return 'reply'
  if (others.length) return 'bounce'
  return 'none'
}
