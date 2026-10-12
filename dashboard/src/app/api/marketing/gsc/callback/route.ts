import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/sales/db'
import { getSite } from '@/lib/marketing/sites'
import { encryptSecret } from '@/lib/marketing/gsc/crypto'
import { emailFromIdToken, exchangeCode, listProperties, oauthRedirectUri, pickProperty, verifyState } from '@/lib/marketing/gsc/client'
import { syncSite } from '@/lib/marketing/gsc/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Google redirects the browser here after consent. No session or header can be relied on; the
// signed OAuth state (site id + timestamp, HMAC under AUTH_SECRET) is the credential. Open in
// src/lib/api-gate/policy.ts for that reason.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const state = p.get('state') ?? ''
  const siteId = state ? verifyState(state) : null
  const site = siteId ? await getSite(siteId) : null
  const dest = (q: string) => NextResponse.redirect(new URL(`/marketing/search-console?${site ? `site=${site.key}&` : ''}${q}`, req.url))
  if (p.get('error')) return dest(`error=${encodeURIComponent(p.get('error') ?? 'declined')}`)
  const code = p.get('code')
  if (!code || !site) return dest('error=bad_state')

  try {
    const tokens = await exchangeCode(code, oauthRedirectUri(req, '/api/marketing/gsc/callback'))
    const email = emailFromIdToken(tokens.id_token)
    const properties = await listProperties(tokens.access_token)
    const property = pickProperty(properties, site.domain)
    const now = new Date().toISOString()
    await sb('gsc_connections?on_conflict=site_id', {
      method: 'POST', prefer: 'return=minimal,resolution=merge-duplicates',
      body: JSON.stringify({
        site_id: site.id, google_email: email, available_sites: properties.map(s => s.siteUrl), scope: tokens.scope ?? null,
        property_url: property, status: property ? 'connected' : 'needs_property', last_error: null, updated_at: now,
        ...(tokens.refresh_token ? { refresh_token_encrypted: encryptSecret(tokens.refresh_token) } : {}),
      }),
    })
    if (property) { await syncSite(site.id); return dest('connected=1') }
    return dest('connected=1&pick=1')
  } catch (e) {
    console.error('[gsc] callback failed:', e instanceof Error ? e.message : e)
    return dest('error=oauth_failed')
  }
}
