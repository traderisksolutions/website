// Google Analytics shapes and periods, shared by the server reader (ga4.ts) and the page.

/** The GA4 tag on each website's pages, read from the live sites on 20 Nov 2026. */
export const MEASUREMENT_IDS: Record<string, string> = {
  traderisksolutions: 'G-S10RY634MR',
  corpcover: 'G-9WZLS1MQ58',
  benefixe: 'G-0CH0TJTC33',
  newsouthsea: 'G-T59794Z21D',
}

export const PERIODS = ['d7', 'd28', 'm3', 'm6', 'm12'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_LABEL: Record<Period, string> = { d7: '7 days', d28: '28 days', m3: '3 months', m6: '6 months', m12: '12 months' }
export const PERIOD_DAYS: Record<Period, number> = { d7: 7, d28: 28, m3: 91, m6: 182, m12: 365 }
export const isPeriod = (s: string | null | undefined): s is Period => !!s && (PERIODS as readonly string[]).includes(s)

export type Range = { start: string; end: string }
export type Totals = { sessions: number; users: number; engagedSessions: number }
export type Row = Totals & { key: string }
export type Day = { date: string; sessions: number; users: number }

export type Traffic =
  | { status: 'ok'; property: string; range: Range; previousRange: Range; totals: Totals; previous: Totals; daily: Day[]
      channels: Row[]; sources: Row[]; landingPages: Row[]; devices: Row[]; countries: Row[]; fetchedAt: string }
  | { status: 'not_connected'; reason: string; account: string | null; measurementId: string | null }
