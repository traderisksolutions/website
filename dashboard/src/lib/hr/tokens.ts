// HR Connect: reference numbers, link tokens, expiry. Pure, so the test needs no database.
//
// The URL token is 32 random bytes, base64url (43 characters). Only its sha256 is stored, so a
// read of the table cannot be turned into a working link. The reference is GB-<year>-<NNNN>,
// counted per year from the highest reference already issued.
import { createHash, randomBytes } from 'node:crypto'

export const LINK_TTL_DAYS = 7
export const REFERENCE_RE = /^GB-(\d{4})-(\d{4,})$/
/** base64url of 32 bytes is 43 characters; allow a little slack either side, nothing else. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,48}$/

export function makeToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isToken(s: string | null | undefined): s is string {
  return !!s && TOKEN_RE.test(s)
}

export function expiryFrom(now: Date = new Date(), days = LINK_TTL_DAYS): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString()
}

export function formatReference(year: number, n: number): string {
  return `GB-${year}-${String(n).padStart(4, '0')}`
}

/** The next reference for `year`, given the highest one already issued for that year (or null). */
export function nextReference(highest: string | null | undefined, year: number): string {
  const m = highest ? REFERENCE_RE.exec(highest) : null
  const n = m && Number(m[1]) === year ? Number(m[2]) + 1 : 1
  return formatReference(year, n)
}

export const CLOSED_STATUSES = new Set(['expired', 'closed', 'submitted'])

/** A link is expired when its time has passed or it has been submitted or closed. */
export function isLinkExpired(link: { status: string; expires_at: string }, now: Date = new Date()): boolean {
  if (CLOSED_STATUSES.has(link.status)) return true
  const t = Date.parse(link.expires_at)
  return !Number.isFinite(t) || now.getTime() > t
}

/** `catherine.tan@trade-risksol.com` → `Catherine Tan`; the cron actor → `Operations`. */
export function displayNameFromEmail(email: string | null | undefined): string {
  const local = String(email ?? '').split('@')[0].trim()
  if (!local || local.startsWith('system:')) return 'Operations'
  return local.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}
