/**
 * Signed session cookie, replacing Supabase Auth.
 *
 * Uses Web Crypto rather than node:crypto because the middleware runs on the Edge runtime,
 * where node builtins are unavailable. That makes signing and verification async.
 *
 * Every TRS account signs in with Google, so there are no passwords to hold. A session is a
 * compact HS256-signed token carrying who the person is and when it expires. Pure functions,
 * no I/O, so the signing and verification rules are unit-testable.
 */

export const SESSION_COOKIE = 'trs_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12   // a working day

export interface SessionUser {
  id:    string
  email: string
  name?: string | null
}
export interface SessionPayload extends SessionUser { iat: number; exp: number }

const b64u = (b: Buffer | string) =>
  (Buffer.isBuffer(b) ? b : Buffer.from(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return b64u(Buffer.from(new Uint8Array(sig)))
}

/** Constant-time string compare; avoids leaking how much of a forged signature matched. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSession(user: SessionUser, secret: string, now = Date.now()): Promise<string> {
  if (!secret) throw new Error('AUTH_SECRET not set')
  const iat = Math.floor(now / 1000)
  const payload: SessionPayload = { ...user, iat, exp: iat + SESSION_TTL_SECONDS }
  const body = b64u(JSON.stringify(payload))
  return `${body}.${await hmac(body, secret)}`
}

/** Returns the session only if the signature is valid and it has not expired. Never throws. */
export async function readSession(token: string | undefined | null, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  if (!token || !secret) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const got  = token.slice(dot + 1)
  if (!safeEqual(got, await hmac(body, secret))) return null
  try {
    const p = JSON.parse(unb64u(body).toString()) as SessionPayload
    if (typeof p.exp !== 'number' || p.exp * 1000 <= now) return null
    if (!p.email || !p.id) return null
    return p
  } catch { return null }
}

/**
 * Only TRS staff may hold a session. Google is asked to prefer the TRS workspace, but that is a
 * hint the browser can ignore, so the domain is enforced here as well.
 */
export const ALLOWED_DOMAIN = 'trade-risksol.com'
export function isAllowedEmail(email: string | null | undefined, domain = ALLOWED_DOMAIN): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  return at > 0 && email.slice(at + 1).toLowerCase() === domain.toLowerCase()
}
