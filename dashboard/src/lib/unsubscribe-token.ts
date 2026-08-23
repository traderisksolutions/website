import { createHmac, timingSafeEqual } from 'crypto'

// Signs a lead id so a public, no-login unsubscribe link can't be used to enumerate or
// unsubscribe arbitrary leads by guessing UUIDs. Reuses CRON_SECRET as the HMAC key —
// no new secret to provision, and it's already a server-only env var never exposed to the
// browser. Not a JWT/session token; this is a single-purpose, non-expiring link signature.
function key(): string {
  const k = process.env.CRON_SECRET
  if (!k) throw new Error('CRON_SECRET not set — required to sign/verify unsubscribe links')
  return k
}

export function signLeadId(leadId: string): string {
  return createHmac('sha256', key()).update(leadId).digest('base64url')
}

export function verifyLeadIdSignature(leadId: string, signature: string): boolean {
  try {
    const expected = Buffer.from(signLeadId(leadId))
    const given     = Buffer.from(signature)
    return expected.length === given.length && timingSafeEqual(expected, given)
  } catch {
    return false
  }
}

export function buildUnsubscribeUrl(origin: string, leadId: string): string {
  const sig = signLeadId(leadId)
  return `${origin}/api/unsubscribe?lead=${encodeURIComponent(leadId)}&sig=${encodeURIComponent(sig)}`
}
