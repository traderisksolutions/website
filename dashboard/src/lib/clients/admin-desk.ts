/**
 * The admin desk for the top 20% (Client 360 phase 3, 14 Nov 2026): every open request of the
 * businesses that earn most, who it waits on and since when, and the requests that come round
 * again (a monthly enrolment, a weekly movement declaration), so the cycle can be prepared before
 * it arrives. Rules only; no model.
 *
 * cycleKey and detectCycles are pure; tested in src/__tests__/admin-desk.test.ts.
 */
import { requestType, type RequestType } from './portfolio'

export type DeskRequest = { id: string; what: string; type: RequestType; owner: string; status: string; since: string; due: string | null; thread_id: string | null }
export type Cycle = { label: string; thread_id: string; type: RequestType; count: number; everyDays: number; cadence: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'irregular'; last: string; next: string }
export type DeskBusiness = { id: string; name: string; rank: number; commission: number; members: string[]; open: DeskRequest[]; cycles: Cycle[]; nextRenewal: string | null }

const DAY = 86_400_000
const cadenceOf = (d: number): Cycle['cadence'] => d <= 10 ? 'weekly' : d <= 18 ? 'fortnightly' : d <= 45 ? 'monthly' : d <= 110 ? 'quarterly' : 'irregular'

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g

/** A subject with what changes each time taken out: replies, months, dates, numbers, names in brackets. Pure. */
export function cycleKey(subject: string): string {
  return subject.toLowerCase()
    .replace(/^(\s*(re|fw|fwd|aw)\s*:\s*)+/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(MONTHS, ' ')
    .replace(/\d+(st|nd|rd|th)?/g, ' ')
    .replace(/[^a-z&]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Work that comes round again: threads whose subjects are the same once the month, the date and
 * the numbers are taken out ("BCEI: Enrolment for November 2026"), at least three of them, started
 * on different days. The cycle is the median gap between their first emails; the next is the last
 * plus that gap. Pure.
 */
export function detectCycles(threads: { subject: string; first: string; thread_id: string }[]): Cycle[] {
  const groups = new Map<string, { subject: string; first: string; thread_id: string }[]>()
  for (const t of threads) { const k = cycleKey(t.subject); if (k.split(' ').length < 2) continue; groups.set(k, [...(groups.get(k) ?? []), t]) }
  const out: Cycle[] = []
  for (const [, ts] of groups) {
    const byDay = new Map<string, { subject: string; first: string; thread_id: string }>()
    for (const t of ts.sort((a, b) => a.first.localeCompare(b.first))) byDay.set(t.first.slice(0, 10), t)
    const days = [...byDay.keys()].sort()
    if (days.length < 3) continue
    const gaps = days.slice(1).map((d, i) => (Date.parse(d) - Date.parse(days[i])) / DAY).sort((a, b) => a - b)
    const mid = Math.floor(gaps.length / 2)
    const everyDays = Math.round(gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2)
    if (everyDays < 3) continue
    const last = byDay.get(days[days.length - 1])!
    out.push({ label: last.subject, type: requestType(last.subject), count: days.length, everyDays, cadence: cadenceOf(everyDays), last: days[days.length - 1], next: new Date(Date.parse(days[days.length - 1]) + everyDays * DAY).toISOString().slice(0, 10), thread_id: last.thread_id })
  }
  return out.sort((a, b) => b.count - a.count)
}

export const toDesk = (r: { id: string; what: string; owner_party: string; status: string; since_at: string; due_at: string | null; thread_id: string | null }): DeskRequest =>
  ({ id: r.id, what: r.what, type: requestType(r.what), owner: r.owner_party, status: r.status, since: r.since_at, due: r.due_at, thread_id: r.thread_id })
