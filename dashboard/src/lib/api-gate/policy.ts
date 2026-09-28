// What each API route requires.
//
// Read by middleware.ts on every /api/** request, and by
// scripts/check-api-coverage.mjs at build time.
//
// The default is `key+actor` and it applies to all 247 route handlers
// unless this file says otherwise. That direction is deliberate. Before
// this, middleware.ts excluded /api/ twice over — once in PUBLIC_PATHS and
// again in the matcher — so a route was protected only if somebody
// remembered to call requireStaffOrCron(), and nothing failed when nobody
// did. /api/inbound/draft is what that looked like in practice: an
// unauthenticated POST that spends Gemini quota, in an app whose own
// api-auth.ts says every route spending money must check auth itself.

export type ApiScope = 'web' | 'machine'

/**
 * - `key+actor` — an x-api-key naming the application, PLUS an actor: a
 *                 signed-in @trade-risksol.com user, or the CRON_SECRET
 *                 bearer token the cron routes already use.
 * - `open`      — the gate requires neither, because the route carries a
 *                 credential the gate cannot see: an HMAC-signed link, a
 *                 webhook secret, a third-party OAuth callback. Every
 *                 entry names which. `open` never means "unprotected".
 */
export type ApiRequirement = 'open' | 'key+actor'

export interface ApiRule {
  prefix: string
  requirement: ApiRequirement
  reason: string
}

export const API_RULES: ApiRule[] = [
  {
    // Google and Microsoft redirect the browser back here after consent.
    // Neither will attach our header, and there is no session yet on a
    // first connect. The OAuth `state` parameter is the credential.
    prefix: '/api/auth/gmail/callback',
    requirement: 'open',
    reason: 'Google OAuth redirect; a third party cannot send our header and the OAuth state is the check.',
  },
  {
    prefix: '/api/auth/onedrive/callback',
    requirement: 'open',
    reason: 'Microsoft OAuth redirect; same reasoning as the Gmail callback.',
  },
  {
    // Clicked from an email body by a recipient who has no login and never
    // will. The link carries an HMAC over the lead id
    // (src/lib/unsubscribe-token.ts) so it cannot be used to unsubscribe
    // an arbitrary lead by guessing UUIDs.
    prefix: '/api/unsubscribe',
    requirement: 'open',
    reason: 'Recipient-facing unsubscribe link, signed with an HMAC; the recipient has no account.',
  },
  {
    // Instantly.ai posts reply events here. It cannot hold one of our
    // keys, so it authenticates with INSTANTLY_WEBHOOK_SECRET in
    // x-webhook-secret instead.
    //
    // Worth knowing: that check is written as "verify IF configured", so
    // leaving the variable unset silently makes this endpoint accept
    // anything. That is a fair thing to tighten, but it belongs in the
    // route rather than here — the gate cannot require a key from a
    // third-party webhook regardless.
    prefix: '/api/outbound/webhooks',
    requirement: 'open',
    reason: 'Third-party webhook from Instantly.ai, authenticated by its own shared secret header.',
  },
]

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** Longest matching prefix, or null when nothing covers the path.
 *
 * Null does NOT mean allowed. middleware.ts treats an unmatched path as
 * key+actor — the safe reading — and scripts/check-api-coverage.mjs makes
 * the build say so rather than leaving it to be discovered later. */
export function matchApiRule(pathname: string): ApiRule | null {
  let best: ApiRule | null = null
  for (const rule of API_RULES) {
    if (pathname !== rule.prefix && !pathname.startsWith(`${rule.prefix}/`)) continue
    if (!best || rule.prefix.length > best.prefix.length) best = rule
  }
  return best
}

/** What an unmatched /api/** path gets. Named rather than inlined so the
 * fallback is visible to a reader and to the build check. */
export const DEFAULT_API_RULE: ApiRule = {
  prefix: '',
  requirement: 'key+actor',
  reason: 'Not listed in API_RULES — fully protected by default.',
}
