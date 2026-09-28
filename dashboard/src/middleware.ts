import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { isApiPath } from '@/lib/api-gate/policy'
import { apiGateMode, gateFailureResponse, logGateFailure, stampGateHeaders } from '@/lib/api-gate/runtime'
import { verifyApiRequest } from '@/lib/api-gate/verify'

// '/api/' is no longer here, and no longer excluded from the matcher
// either. It was in both, which is what left all 247 route handlers each
// responsible for their own protection — see src/lib/api-gate/policy.ts
// for what that cost in practice.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/unsubscribed']
const TRS_DOMAIN   = 'trade-risksol.com'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()         { return request.cookies.getAll() },
        setAll(toSet)    {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── /api/** ─────────────────────────────────────────────────────────
  // Two credentials before any handler runs: an x-api-key naming the
  // calling application, and an actor — a signed-in TRS user or the
  // CRON_SECRET bearer the cron routes already use. requireStaffOrCron()
  // stays in the handlers; this is a gate in front of it, not a
  // replacement for it.
  //
  // Checked after getUser() so the session is already resolved, and
  // before the redirect below because an API caller needs a status code,
  // not an HTML login page.
  if (isApiPath(pathname)) {
    const result = await verifyApiRequest({
      request,
      pathname,
      sessionEmail: user?.email?.toLowerCase().endsWith(`@${TRS_DOMAIN}`) ? user.email : null,
    })

    // Stamped on every path, pass or fail. stampGateHeaders deletes the
    // fields before writing, so a caller that sent its own
    // x-api-actor-email cannot have it survive into a handler.
    const apiHeaders = new Headers(request.headers)
    stampGateHeaders(apiHeaders, result)

    if (!result.ok) {
      const mode = apiGateMode()
      logGateFailure(mode, pathname, result)
      if (mode === 'enforce') return gateFailureResponse(result)
      // log-only: fall through unstamped, so a handler still sees an
      // unverified caller as unverified rather than as an approved one.
    }

    return NextResponse.next({ request: { headers: apiHeaders } })
  }

  // Not logged in → redirect to login (except public paths)
  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Logged in but not a TRS email → sign out and show error
  if (user && !user.email?.toLowerCase().endsWith(`@${TRS_DOMAIN}`)) {
    await supabase.auth.signOut()
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('error', 'domain')
    return NextResponse.redirect(loginUrl)
  }

  // Already logged in → skip the login page.
  // If a `next` query param is present, honour it (e.g. deep-link after session expiry).
  // Otherwise, send the user to `/` (the homepage).
  if (user && pathname === '/login') {
    const next = request.nextUrl.searchParams.get('next') ?? '/'
    return NextResponse.redirect(new URL(next, request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
