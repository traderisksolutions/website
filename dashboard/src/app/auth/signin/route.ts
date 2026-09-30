import { NextRequest, NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/auth/google'
import { ALLOWED_DOMAIN } from '@/lib/auth/session'

/** Starts Google sign-in. The client secret never leaves the server, so this is a redirect. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const raw = searchParams.get('next')
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/engagement'
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''
  if (!clientId) return NextResponse.redirect(`${origin}/login?error=config`)
  return NextResponse.redirect(authorizeUrl({
    clientId,
    redirectUri: `${origin}/auth/callback`,
    state: next,
    hd: ALLOWED_DOMAIN,
  }))
}
