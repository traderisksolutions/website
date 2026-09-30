/**
 * Google sign-in, the authorization-code flow.
 *
 * The id_token comes back over TLS in the direct response to our client-authenticated token
 * request, so per OIDC the code flow does not require re-verifying its signature. We still
 * check the audience and issuer, and the caller must check the email domain.
 */
export const GOOGLE_AUTH  = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'

export interface GoogleProfile { sub: string; email: string; name?: string | null; hd?: string | null }

export function authorizeUrl(opts: { clientId: string; redirectUri: string; state: string; hd?: string }): string {
  const u = new URL(GOOGLE_AUTH)
  u.searchParams.set('client_id', opts.clientId)
  u.searchParams.set('redirect_uri', opts.redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', opts.state)
  u.searchParams.set('access_type', 'online')
  u.searchParams.set('prompt', 'select_account')
  if (opts.hd) u.searchParams.set('hd', opts.hd)
  return u.toString()
}

/** Decodes a JWT payload. Does not verify — only safe on a token fetched directly from Google. */
export function decodeIdToken(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) }
  catch { return null }
}

export function profileFromIdToken(idToken: string, expectedAud: string): GoogleProfile | null {
  const p = decodeIdToken(idToken)
  if (!p) return null
  const iss = String(p.iss ?? '')
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') return null
  if (String(p.aud ?? '') !== expectedAud) return null
  if (p.email_verified === false) return null
  const email = typeof p.email === 'string' ? p.email : ''
  const sub   = typeof p.sub === 'string' ? p.sub : ''
  if (!email || !sub) return null
  return { sub, email, name: typeof p.name === 'string' ? p.name : null, hd: typeof p.hd === 'string' ? p.hd : null }
}

export async function exchangeCode(opts: {
  code: string; clientId: string; clientSecret: string; redirectUri: string
}): Promise<GoogleProfile | null> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code, client_id: opts.clientId, client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri, grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return null
  const j = await res.json() as { id_token?: string }
  return j.id_token ? profileFromIdToken(j.id_token, opts.clientId) : null
}
