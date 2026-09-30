import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/auth/google'
import { createSession, isAllowedEmail, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session'
import { lookupStaff } from '@/lib/auth/users'

/**
 * Google redirects here with an authorization code. We exchange it server-side with our client
 * secret, check the account is TRS staff, and set our own signed session cookie.
 *
 * `next` is validated as a same-site path: an attacker who can craft the callback URL must not
 * be able to bounce a freshly signed-in user to another origin.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/engagement'
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = safeNext(searchParams.get('next'))

  if (searchParams.get('error')) return NextResponse.redirect(`${origin}/login?error=oauth`)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=callback`)

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''
  const authSecret   = process.env.AUTH_SECRET ?? ''
  if (!clientId || !clientSecret || !authSecret) {
    console.error('[auth/callback] GOOGLE_OAUTH_CLIENT_ID/SECRET or AUTH_SECRET not configured')
    return NextResponse.redirect(`${origin}/login?error=config`)
  }

  const profile = await exchangeCode({
    code, clientId, clientSecret, redirectUri: `${origin}/auth/callback`,
  })
  if (!profile) return NextResponse.redirect(`${origin}/login?error=callback`)

  // Google's `hd` hint is only a hint; the domain is enforced here.
  if (!isAllowedEmail(profile.email)) return NextResponse.redirect(`${origin}/login?error=domain`)

  // The session carries the user's original id, not Google's `sub`, so existing records stay
  // attached to the right person. An address not on the staff list cannot sign in.
  const staff = await lookupStaff(profile.email)
  if (!staff) return NextResponse.redirect(`${origin}/login?error=domain`)

  const token = await createSession({ id: staff.id, email: staff.email, name: staff.name ?? profile.name }, authSecret)
  const res = NextResponse.redirect(`${origin}${next}`)
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_TTL_SECONDS,
  })
  return res
}
