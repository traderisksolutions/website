/**
 * Google Analytics 4 for the four websites, read the way Pen reads alpswills.com (20 Nov 2026,
 * Jarod: "emulate what we have done for Alps Wills, just the Google Analytics; no ads").
 *
 * Reads run as the TRS service account (GOOGLE_TRS_DRIVE_SA_JSON) with analytics.readonly. That
 * account must be a Viewer on each GA4 property, and the Analytics Data and Admin APIs must be on
 * in its Google Cloud project. Each site's property is found from the measurement id its pages
 * carry, through the Admin API; GA4_PROPERTY_<KEY> overrides that. Figures are cached per
 * instance for 30 minutes. GA4 settles a day behind, so every period ends yesterday.
 */
import { createSign } from 'node:crypto'
import { MEASUREMENT_IDS, PERIOD_DAYS, type Period, type Range, type Row, type Totals, type Traffic } from './ga4-types'

export { isPeriod } from './ga4-types'

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** The period ending yesterday, and the same number of days before it. */
export function periodRanges(period: Period, today = new Date()): { range: Range; previous: Range } {
  const days = PERIOD_DAYS[period]
  const at = (back: number) => { const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())); d.setUTCDate(d.getUTCDate() - back); return iso(d) }
  return { range: { start: at(days), end: at(1) }, previous: { start: at(2 * days), end: at(days + 1) } }
}

/** GA4 writes dates as 20261109. */
export const isoDay = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d)

type ReportRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }

/** A runReport answer as rows; counts that do not parse become 0. */
export function rowsFrom(rows: ReportRow[] | undefined): Row[] {
  const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0 }
  return (rows ?? []).map(r => ({
    key: (r.dimensionValues ?? []).map(d => d.value ?? '').join('\u0000'),
    sessions: num(r.metricValues?.[0]?.value),
    users: num(r.metricValues?.[1]?.value),
    engagedSessions: num(r.metricValues?.[2]?.value),
  }))
}

function credentials(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_TRS_DRIVE_SA_JSON
  if (!raw) return null
  try { const c = JSON.parse(raw); return c?.client_email && c?.private_key ? c : null } catch { return null }
}

export const analyticsAccount = () => credentials()?.client_email ?? null

const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

let token: { value: string; until: number } | null = null
async function accessToken(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value
  const c = credentials()
  if (!c) throw new Error('GOOGLE_TRS_DRIVE_SA_JSON is not set')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: c.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`
  const signer = createSign('RSA-SHA256'); signer.update(unsigned)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signer.sign(c.private_key))}` }),
    signal: AbortSignal.timeout(15_000),
  })
  const j = await res.json().catch(() => ({}))
  if (!j.access_token) throw new Error('Google sign-in for the service account failed')
  token = { value: j.access_token, until: Date.now() + Number(j.expires_in ?? 3600) * 1000 }
  return token.value
}

async function google<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error?.message ? `Google Analytics: ${String(j.error.message).split('. ')[0]}` : `Google Analytics answered ${res.status}`)
  return j as T
}

/** The numeric property behind a measurement id: GA4_PROPERTY_<KEY>, else found through the Admin API. */
async function propertyFor(siteKey: string, measurementId: string): Promise<string> {
  const set = process.env[`GA4_PROPERTY_${siteKey.toUpperCase()}`]
  if (set && /^\d+$/.test(set)) return set
  const summaries = await google<{ accountSummaries?: { propertySummaries?: { property: string }[] }[] }>(`${ADMIN_API}/accountSummaries?pageSize=200`)
  const properties = (summaries.accountSummaries ?? []).flatMap(a => a.propertySummaries ?? []).map(p => p.property)
  if (properties.length === 0) throw new Error('The service account cannot see any Google Analytics property')
  for (const p of properties) {
    const streams = await google<{ dataStreams?: { webStreamData?: { measurementId?: string } }[] }>(`${ADMIN_API}/${p}/dataStreams?pageSize=50`)
    if ((streams.dataStreams ?? []).some(s => s.webStreamData?.measurementId === measurementId)) return p.replace('properties/', '')
  }
  throw new Error(`No property the service account can see carries ${measurementId}`)
}

const METRICS = [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }]

async function report(property: string, range: Range, dimension: string | null, limit = 25): Promise<Row[]> {
  const r = await google<{ rows?: ReportRow[] }>(`${DATA_API}/properties/${property}:runReport`, {
    dateRanges: [{ startDate: range.start, endDate: range.end }],
    dimensions: dimension ? [{ name: dimension }] : [],
    metrics: METRICS,
    orderBys: dimension === 'date' ? [{ dimension: { dimensionName: 'date' } }] : [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  })
  return rowsFrom(r.rows)
}

const zero: Totals = { sessions: 0, users: 0, engagedSessions: 0 }
const CACHE_MS = 30 * 60_000
const cache = new Map<string, { at: number; value: Traffic }>()

/** One site's traffic for one period. A failed read is not cached, so access shows on the next open. */
export async function siteTraffic(siteKey: string, period: Period, opts: { fresh?: boolean } = {}): Promise<Traffic> {
  const measurementId = MEASUREMENT_IDS[siteKey] ?? null
  const account = analyticsAccount()
  if (!measurementId) return { status: 'not_connected', reason: 'No Google Analytics tag recorded for this website', account, measurementId }
  const key = `${siteKey}:${period}`
  const hit = cache.get(key)
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value
  try {
    const property = await propertyFor(siteKey, measurementId)
    const { range, previous } = periodRanges(period)
    const [now, before, days, channels, sources, landingPages, devices, countries] = await Promise.all([
      report(property, range, null), report(property, previous, null), report(property, range, 'date', 400),
      report(property, range, 'sessionDefaultChannelGroup'), report(property, range, 'sessionSourceMedium'),
      report(property, range, 'landingPage'), report(property, range, 'deviceCategory'), report(property, range, 'country', 10),
    ])
    const value: Traffic = {
      status: 'ok', property, range, previousRange: previous, totals: now[0] ?? zero, previous: before[0] ?? zero,
      daily: days.map(d => ({ date: isoDay(d.key), sessions: d.sessions, users: d.users })),
      channels, sources, landingPages, devices, countries, fetchedAt: new Date().toISOString(),
    }
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (e) {
    return { status: 'not_connected', reason: e instanceof Error ? e.message : 'Google Analytics could not be read', account, measurementId }
  }
}
