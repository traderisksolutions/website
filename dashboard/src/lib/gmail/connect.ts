/**
 * The second half of /auth/gmail: Google's code becomes a stored, encrypted refresh token for
 * the person's own mailbox, and the mailbox starts sending notifications to ingest.
 */
import { GOOGLE_TOKEN, profileFromIdToken } from '@/lib/auth/google'
import { isAllowedEmail } from '@/lib/auth/session'
import { GMAIL_READ_SCOPE, getMailbox, saveMailbox, watchMailbox } from './mailboxes'

export type ConnectResult = { ok: true; email: string } | { ok: false; error: 'callback' | 'domain' | 'scope' | 'too_wide' | 'no_refresh' | 'watch' }

export async function connectMailbox(code: string, redirectUri: string): Promise<ConnectResult> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '', clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  if (!res.ok) return { ok: false, error: 'callback' }
  const j = await res.json() as { id_token?: string; refresh_token?: string; scope?: string }
  const profile = j.id_token ? profileFromIdToken(j.id_token, clientId) : null
  if (!profile) return { ok: false, error: 'callback' }
  if (!isAllowedEmail(profile.email)) return { ok: false, error: 'domain' }
  const scopes = (j.scope ?? '').split(' ')
  if (!scopes.includes(GMAIL_READ_SCOPE)) return { ok: false, error: 'scope' }
  // Read only, or not at all: a token that could send, change or delete mail is never stored.
  if (scopes.some(s => /gmail\.(send|compose|modify|insert|labels)|mail\.google\.com/.test(s))) return { ok: false, error: 'too_wide' }
  if (!j.refresh_token) return { ok: false, error: 'no_refresh' }
  await saveMailbox(profile.email, j.refresh_token)
  const m = await getMailbox(profile.email)
  try { if (m) await watchMailbox(m) } catch { return { ok: false, error: 'watch' } }
  return { ok: true, email: profile.email.toLowerCase() }
}
