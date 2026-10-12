// The unsubscribe link every campaign email carries (Spam Control Act). Signed with an HMAC over
// the recipient row id, so it cannot be used to unsubscribe an arbitrary address by guessing
// ids. No expiry: a link that stops working is a compliance problem. CRON_SECRET is the key, as
// the earlier unsubscribe link used.
import { createHmac, timingSafeEqual } from 'node:crypto'

function key(): Buffer {
  const k = process.env.CRON_SECRET
  if (!k) throw new Error('CRON_SECRET not set')
  return createHmac('sha256', k).update('sales-unsubscribe').digest()
}

export function signUnsubscribeToken(contactId: string): string {
  return createHmac('sha256', key()).update(contactId).digest('base64url')
}

export function verifyUnsubscribeToken(contactId: string, token: string): boolean {
  try {
    const a = Buffer.from(token), b = Buffer.from(signUnsubscribeToken(contactId))
    return a.length === b.length && timingSafeEqual(a, b)
  } catch { return false }
}

export function unsubscribeUrl(baseUrl: string, contactId: string): string {
  return `${baseUrl}/api/public/sales/unsubscribe?c=${contactId}&t=${signUnsubscribeToken(contactId)}`
}
