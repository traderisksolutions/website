// Google Search Console OAuth + API over plain HTTPS. One Google OAuth client (the dashboard's
// Gmail client, or a dedicated GOOGLE_GSC_* pair) with the callback URL registered; the person
// connecting authorises read-only Search Console access with their own Google account and the
// dashboard holds the refresh token per site.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const GSC_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly'].join(' ')
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3'

const clientId = () => process.env.GOOGLE_GSC_CLIENT_ID || process.env.GMAIL_CLIENT_ID || ''
const clientSecret = () => process.env.GOOGLE_GSC_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || ''
export const gscConfigured = () => Boolean(clientId() && clientSecret())

// ── Signed state: CSRF plus the site id carried through the redirect ──────────
function stateKey(): Buffer {
  const k = process.env.AUTH_SECRET
  if (!k) throw new Error('AUTH_SECRET not set')
  return createHmac('sha256', k).update('gsc-oauth-state').digest()
}

export function signState(siteId: string, now = Date.now()): string {
  const payload = `${siteId}.${now}`
  const sig = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

/** The site id when the state is genuine and under 15 minutes old, else null. */
export function verifyState(state: string, now = Date.now()): string | null {
  const [payloadB64, sig] = state.split('.')
  if (!payloadB64 || !sig) return null
  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8')
  const expected = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const dot = payload.lastIndexOf('.')
  const siteId = payload.slice(0, dot), ts = Number(payload.slice(dot + 1))
  if (!siteId || !Number.isFinite(ts) || now - ts > 15 * 60_000) return null
  return siteId
}

/** The redirect URI Google must see: the public host, never the function's internal URL. */
export function oauthRedirectUri(req: Request, path: string): string {
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwarded || new URL(req.url).host
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  return `${local ? 'http' : 'https'}://${host}${path}`
}

export function buildAuthUrl(state: string, redirectUri: string, loginHint?: string): string {
  const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirectUri, response_type: 'code', scope: GSC_SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })
  if (loginHint) params.set('login_hint', loginHint)
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export type TokenResponse = { access_token: string; refresh_token?: string; scope?: string; id_token?: string; expires_in?: number }

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId(), client_secret: clientSecret(), grant_type: 'refresh_token' }), signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('no access_token in refresh response')
  return json.access_token
}

export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : null
  } catch { return null }
}

export type GscSite = { siteUrl: string; permissionLevel: string }

export async function listProperties(accessToken: string): Promise<GscSite[]> {
  const res = await fetch(`${API_BASE}/sites`, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`sites.list failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { siteEntry?: GscSite[] }).siteEntry ?? []
}

export type SearchAnalyticsRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }

export async function querySearchAnalytics(accessToken: string, siteUrl: string, body: { startDate: string; endDate: string; dimensions?: ('date' | 'query' | 'page' | 'country')[]; rowLimit?: number }): Promise<SearchAnalyticsRow[]> {
  const res = await fetch(`${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`searchAnalytics failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return ((await res.json()) as { rows?: SearchAnalyticsRow[] }).rows ?? []
}

/** The property matching a site's domain: sc-domain first, then a URL property on that host. */
export function pickProperty(sites: GscSite[], domain: string | null): string | null {
  const pool = sites.filter(s => s.permissionLevel !== 'siteUnverifiedUser')
  if (pool.length === 0) return null
  if (domain) {
    const root = domain.replace(/^www\./, '').toLowerCase()
    const domainProp = pool.find(s => s.siteUrl === `sc-domain:${root}`)
    if (domainProp) return domainProp.siteUrl
    const urlProp = pool.find(s => { try { const h = new URL(s.siteUrl).hostname.replace(/^www\./, '').toLowerCase(); return h === root || h.endsWith(`.${root}`) } catch { return false } })
    if (urlProp) return urlProp.siteUrl
  }
  return pool.length === 1 ? pool[0].siteUrl : null
}
