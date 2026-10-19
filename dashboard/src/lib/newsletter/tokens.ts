// Signed links in newsletter email: confirm a subscription, unsubscribe. HMAC over the subscriber
// row id with a per-purpose key derived from CRON_SECRET, so ids cannot be guessed into a link.
// No expiry: an unsubscribe link that stops working is a compliance problem.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type TokenPurpose = 'newsletter-confirm' | 'newsletter-unsubscribe'

function key(purpose: TokenPurpose): Buffer {
  const k = process.env.CRON_SECRET
  if (!k) throw new Error('CRON_SECRET not set')
  return createHmac('sha256', k).update(purpose).digest()
}

export const signToken = (purpose: TokenPurpose, id: string) => createHmac('sha256', key(purpose)).update(id).digest('base64url')

export function verifyToken(purpose: TokenPurpose, id: string, token: string): boolean {
  try {
    const a = Buffer.from(token), b = Buffer.from(signToken(purpose, id))
    return a.length === b.length && timingSafeEqual(a, b)
  } catch { return false }
}
