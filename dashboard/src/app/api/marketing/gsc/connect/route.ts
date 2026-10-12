import { NextRequest, NextResponse } from 'next/server'
import { actor } from '@/lib/marketing/auth'
import { isResponse, siteFromReq } from '@/lib/marketing/request'
import { buildAuthUrl, gscConfigured, oauthRedirectUri, signState } from '@/lib/marketing/gsc/client'

export const dynamic = 'force-dynamic'

/** Sends the signed-in user to Google's consent screen. The signed state carries the site id. */
export async function GET(req: NextRequest) {
  const who = await actor(req)
  if (who instanceof Response) return NextResponse.redirect(new URL('/login', req.url))
  const site = await siteFromReq(req)
  if (isResponse(site)) return NextResponse.redirect(new URL('/marketing/search-console?error=no_site', req.url))
  if (!gscConfigured()) return NextResponse.redirect(new URL(`/marketing/search-console?site=${site.key}&error=not_configured`, req.url))
  return NextResponse.redirect(buildAuthUrl(signState(site.id), oauthRedirectUri(req, '/api/marketing/gsc/callback'), who.email.includes('@') ? who.email : undefined))
}
