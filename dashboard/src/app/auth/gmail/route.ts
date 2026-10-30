import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { GOOGLE_AUTH } from '@/lib/auth/google'
import { ALLOWED_DOMAIN } from '@/lib/auth/session'
import { GMAIL_READ_SCOPE } from '@/lib/gmail/mailboxes'

/**
 * GET /auth/gmail[?email=] → Google's consent screen for read-only Gmail access. The person signs
 * in with their TRS account and allows it once; Google returns to /auth/callback, which stores the
 * mailbox. No dashboard login needed: the link is sent to the person.
 */
export const GMAIL_STATE_COOKIE = 'trs_gmail_state'

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url)
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''
  if (!clientId) return NextResponse.redirect(`${origin}/connect/gmail?error=config`)
  const nonce = randomBytes(16).toString('hex')
  const u = new URL(GOOGLE_AUTH)
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', `${origin}/auth/callback`)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', `openid email ${GMAIL_READ_SCOPE}`)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('hd', ALLOWED_DOMAIN)
  u.searchParams.set('state', `gmail.${nonce}`)
  const hint = searchParams.get('email')
  if (hint && hint.endsWith(`@${ALLOWED_DOMAIN}`)) u.searchParams.set('login_hint', hint)
  const res = NextResponse.redirect(u.toString())
  res.cookies.set(GMAIL_STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 })
  return res
}
