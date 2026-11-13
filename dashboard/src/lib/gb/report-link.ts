/**
 * A link a client opens without a login, to the client report as it was sent: the Drive copy kept
 * when it was sent, named by its Drive id, signed with an HMAC under AUTH_SECRET and expiring.
 * The token is the only credential (`/api/public/gb-report/<token>`); a tampered or expired one is
 * refused. Pure apart from the secret; tested in src/__tests__/gb-report-link.test.ts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const REPORT_LINK_DAYS = 30
const secret = () => { const k = process.env.AUTH_SECRET; if (!k) throw new Error('AUTH_SECRET not set'); return k }
const sign = (body: string, key: string) => createHmac('sha256', key).update(`gb-report:${body}`).digest('base64url')

export function reportToken(driveId: string, now = Date.now(), key = secret()): string {
  const body = `${driveId}.${Math.floor(now / 1000) + REPORT_LINK_DAYS * 86_400}`
  return `${body}.${sign(body, key)}`
}

/** The Drive id a token names, or null when it is tampered with, malformed or expired. */
export function readReportToken(token: string, now = Date.now(), key = secret()): string | null {
  const m = /^([\w-]{10,200})\.(\d{9,11})\.([\w-]{43})$/.exec(token)
  if (!m) return null
  const [, id, exp, sig] = m
  const want = Buffer.from(sign(`${id}.${exp}`, key)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  return Number(exp) * 1000 > now ? id : null
}
