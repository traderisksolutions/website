/**
 * Google access tokens: one place that signs service-account JWTs and runs the OAuth refresh grant.
 *
 * Service accounts:
 *   'trs'           GOOGLE_TRS_DRIVE_SA_JSON (ai-engagement@trs-ai-project). The default.
 *   'trs-or-legacy' GOOGLE_TRS_DRIVE_SA_JSON, else GOOGLE_SERVICE_ACCOUNT_JSON.
 *   'legacy'        GOOGLE_SERVICE_ACCOUNT_JSON only (the older key, still used for Gmail impersonation
 *                   and the knowledge folder).
 *
 * Tokens are cached per account, subject and scope (or per refresh token and scope) until 60 s
 * before Google's expiry. Concurrent requests for the same token share one call to Google.
 *
 * Errors name the env var, the account and the scope. They never carry a key, a refresh token or
 * the raw credential string: GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON in some environments.
 *
 * `/api/email/send` and the modules it imports (gdrive-write.ts, gmail-send.ts, gmail/mailboxes.ts)
 * keep their own token code on purpose; that route is not changed.
 */
import { createHash, createSign } from 'node:crypto'

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
const EARLY_MS = 60_000
const TIMEOUT_MS = 15_000

export type ServiceAccount = 'trs' | 'trs-or-legacy' | 'legacy'

const ACCOUNT_ENV: Record<ServiceAccount, readonly string[]> = {
  trs: ['GOOGLE_TRS_DRIVE_SA_JSON'],
  'trs-or-legacy': ['GOOGLE_TRS_DRIVE_SA_JSON', 'GOOGLE_SERVICE_ACCOUNT_JSON'],
  legacy: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
}

export class GoogleAuthError extends Error {
  /** HTTP status from Google, or 0 when the failure is local (missing or malformed credential). */
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

type Key = { env: string; clientEmail: string; privateKey: string }
type Cached = { token: string; until: number }

const cache = new Map<string, Cached>()
const inflight = new Map<string, Promise<string>>()

/** Test hook: forget every cached token. */
export function clearGoogleTokenCache(): void {
  cache.clear()
  inflight.clear()
}

function readKey(which: ServiceAccount): Key {
  const names = ACCOUNT_ENV[which]
  const env = names.find(n => !!process.env[n])
  if (!env) throw new GoogleAuthError(`Google service account not configured: set ${names.join(' or ')}`, 0)
  let parsed: unknown
  try {
    parsed = JSON.parse(process.env[env] as string)
  } catch {
    throw new GoogleAuthError(`${env} is not valid JSON`, 0)
  }
  const c = (parsed ?? {}) as { client_email?: unknown; private_key?: unknown }
  if (typeof c.client_email !== 'string' || !c.client_email || typeof c.private_key !== 'string' || !c.private_key) {
    throw new GoogleAuthError(`${env} has no client_email or private_key`, 0)
  }
  // Keys pasted into env editors often carry literal "\n"; PEM needs real newlines.
  return { env, clientEmail: c.client_email, privateKey: c.private_key.replace(/\\n/g, '\n') }
}

/** The service account's email, or null when its key is missing or unreadable. Never throws. */
export function serviceAccountEmail(which: ServiceAccount = 'trs'): string | null {
  try { return readKey(which).clientEmail } catch { return null }
}

const fresh = (k: string) => {
  const hit = cache.get(k)
  return hit && hit.until - EARLY_MS > Date.now() ? hit.token : null
}

/** One cached, de-duplicated token mint. */
async function cached(k: string, mint: () => Promise<{ token: string; expiresIn: number }>): Promise<string> {
  const hit = fresh(k)
  if (hit) return hit
  const pending = inflight.get(k)
  if (pending) return pending
  const p = mint()
    .then(({ token, expiresIn }) => {
      cache.set(k, { token, until: Date.now() + expiresIn * 1000 })
      return token
    })
    .finally(() => inflight.delete(k))
  inflight.set(k, p)
  return p
}

async function postToken(body: URLSearchParams, what: string): Promise<{ token: string; expiresIn: number }> {
  let res: Response
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new GoogleAuthError(`Google token for ${what} failed: ${e instanceof Error ? e.name : 'network error'}`, 0)
  }
  const j = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown }
  if (!res.ok || typeof j.access_token !== 'string' || !j.access_token) {
    // Google's error code and description never contain the credential.
    const reason = [j.error, j.error_description].filter(x => typeof x === 'string' && x).join(': ') || 'no access token'
    throw new GoogleAuthError(`Google token for ${what} failed: ${res.status} ${reason}`, res.status)
  }
  const expiresIn = Number(j.expires_in)
  return { token: j.access_token, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600 }
}

function b64url(x: string | Buffer): string {
  return Buffer.from(x).toString('base64url')
}

/**
 * An access token for a service account, signed as RS256 and exchanged with Google.
 * `subject` impersonates a Workspace user (domain-wide delegation), e.g. the operations mailbox.
 */
export async function serviceAccountToken(scope: string, which: ServiceAccount = 'trs', subject?: string): Promise<string> {
  const key = readKey(which)
  const what = `${key.clientEmail}${subject ? ` as ${subject}` : ''} (${scope})`
  return cached(`sa|${key.env}|${key.clientEmail}|${subject ?? ''}|${scope}`, () => {
    const now = Math.floor(Date.now() / 1000)
    const claims = { iss: key.clientEmail, ...(subject ? { sub: subject } : {}), scope, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
    let signature: string
    try {
      signature = createSign('RSA-SHA256').update(unsigned).sign(key.privateKey, 'base64url')
    } catch {
      return Promise.reject(new GoogleAuthError(`${key.env} private_key could not sign a token for ${what}`, 0))
    }
    return postToken(new URLSearchParams({ grant_type: JWT_BEARER, assertion: `${unsigned}.${signature}` }), what)
  })
}

/**
 * An access token from an OAuth refresh token, cached per refresh token and scope.
 * `account` labels errors (a mailbox or env var name); the refresh token itself is never shown.
 */
export async function refreshToken(clientId: string, clientSecret: string, token: string, scope?: string, account = 'refresh token'): Promise<string> {
  const what = `${account}${scope ? ` (${scope})` : ''}`
  if (!clientId || !clientSecret || !token) throw new GoogleAuthError(`Google token for ${what} failed: client id, client secret or refresh token missing`, 0)
  const id = createHash('sha256').update(`${clientId}\u0000${token}`).digest('base64url')
  return cached(`rt|${id}|${scope ?? ''}`, () => {
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: token, grant_type: 'refresh_token' })
    if (scope) body.set('scope', scope)
    return postToken(body, what)
  })
}

/** The operations mailbox's token, from GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN. */
export async function gmailToken(): Promise<string> {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) throw new GoogleAuthError('Gmail not connected: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN', 0)
  return refreshToken(process.env.GMAIL_CLIENT_ID as string, process.env.GMAIL_CLIENT_SECRET as string, process.env.GMAIL_REFRESH_TOKEN as string, undefined, 'GMAIL_REFRESH_TOKEN mailbox')
}
