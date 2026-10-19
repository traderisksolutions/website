import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  CLOSED_STATUSES, displayNameFromEmail, expiryFrom, formatReference, hashToken, isLinkExpired, isToken,
  LINK_TTL_DAYS, makeToken, nextReference, REFERENCE_RE,
} from '@/lib/hr/tokens'
import { allowRequest } from '@/lib/hr/rate-limit'
import { defaultMessage, hrLinkEmail, longDate } from '@/lib/hr/email'
import type { HrLink } from '@/lib/hr/types'

describe('HR Connect tokens', () => {
  it('makes a 32-byte base64url token that passes its own shape check and is unique', () => {
    const a = makeToken()
    const b = makeToken()
    expect(a).toHaveLength(43)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a).not.toBe(b)
    expect(isToken(a)).toBe(true)
    expect(Buffer.from(a, 'base64url')).toHaveLength(32)
  })

  it('rejects tokens of the wrong shape', () => {
    expect(isToken('')).toBe(false)
    expect(isToken('short')).toBe(false)
    expect(isToken('a'.repeat(43) + '/')).toBe(false)
    expect(isToken('x'.repeat(49))).toBe(false)
    expect(isToken(null)).toBe(false)
  })

  it('hashes with sha256 hex, deterministically', () => {
    const t = 'k7h2' + 'A'.repeat(39)
    const expected = createHash('sha256').update(t).digest('hex')
    expect(hashToken(t)).toBe(expected)
    expect(hashToken(t)).toHaveLength(64)
    expect(hashToken(t)).not.toBe(hashToken(t + 'x'))
  })
})

describe('HR Connect expiry', () => {
  it('expires 7 days after now', () => {
    const now = new Date('2026-10-19T10:00:00Z')
    expect(LINK_TTL_DAYS).toBe(7)
    expect(expiryFrom(now)).toBe('2026-10-26T10:00:00.000Z')
  })

  it('reads a link as expired after expires_at, or once submitted or closed', () => {
    const expires_at = '2026-10-26T10:00:00.000Z'
    expect(isLinkExpired({ status: 'sent', expires_at }, new Date('2026-10-20T00:00:00Z'))).toBe(false)
    expect(isLinkExpired({ status: 'opened', expires_at }, new Date('2026-10-26T10:00:00.001Z'))).toBe(true)
    expect(isLinkExpired({ status: 'submitted', expires_at }, new Date('2026-10-20T00:00:00Z'))).toBe(true)
    expect(isLinkExpired({ status: 'closed', expires_at }, new Date('2026-10-20T00:00:00Z'))).toBe(true)
    expect(isLinkExpired({ status: 'expired', expires_at }, new Date('2026-10-20T00:00:00Z'))).toBe(true)
    expect(isLinkExpired({ status: 'sent', expires_at: 'not a date' })).toBe(true)
    expect([...CLOSED_STATUSES].sort()).toEqual(['closed', 'expired', 'submitted'])
  })
})

describe('HR Connect references', () => {
  it('formats GB-<year>-<NNNN>', () => {
    expect(formatReference(2026, 142)).toBe('GB-2026-0142')
    expect(formatReference(2026, 1)).toBe('GB-2026-0001')
    expect(formatReference(2026, 12345)).toBe('GB-2026-12345')
    expect('GB-2026-0142').toMatch(REFERENCE_RE)
  })

  it('increments the highest reference of the same year and restarts for a new year', () => {
    expect(nextReference(null, 2026)).toBe('GB-2026-0001')
    expect(nextReference('GB-2026-0142', 2026)).toBe('GB-2026-0143')
    expect(nextReference('GB-2026-0142', 2027)).toBe('GB-2027-0001')
    expect(nextReference('GB-2026-9999', 2026)).toBe('GB-2026-10000')
    expect(nextReference('garbage', 2026)).toBe('GB-2026-0001')
  })
})

describe('HR Connect sender name', () => {
  it('capitalises the local part of the sender email', () => {
    expect(displayNameFromEmail('catherine.tan@trade-risksol.com')).toBe('Catherine Tan')
    expect(displayNameFromEmail('operations@trade-risksol.com')).toBe('Operations')
    expect(displayNameFromEmail('system:cron')).toBe('Operations')
    expect(displayNameFromEmail(null)).toBe('Operations')
  })
})

describe('HR Connect rate limit', () => {
  it('allows 60 requests in the window and refuses the 61st, per token', () => {
    const t = makeToken()
    const now = Date.now()
    for (let i = 0; i < 60; i++) expect(allowRequest(t, now)).toBe(true)
    expect(allowRequest(t, now)).toBe(false)
    expect(allowRequest(makeToken(), now)).toBe(true)
    expect(allowRequest(t, now + 10 * 60_000 + 1)).toBe(true)
  })
})

describe('HR Connect email', () => {
  const link: HrLink = {
    id: '00000000-0000-0000-0000-000000000001', reference: 'GB-2026-0142', company_id: null,
    company_name: 'Gembridge Capital Management Pte Ltd', quotation_id: null, effective_date: '2026-10-24',
    recipient_name: 'Ms Soh', recipient_email: 'hr@gembridge.sg', cc_email: 'bengwee@gembridge.sg', requested_by: 'How Beng Wee',
    message: '', status: 'sent', sent_by: 'catherine.tan@trade-risksol.com', sent_at: '2026-10-19T10:52:00Z',
    expires_at: '2026-10-26T10:52:00Z', opened_at: null, submitted_at: null, created_at: '2026-10-19T10:52:00Z', updated_at: '2026-10-19T10:52:00Z',
  }

  it('writes dates the long way', () => {
    expect(longDate('2026-10-24')).toBe('24 October 2026')
    expect(longDate('2026-01-05')).toBe('5 January 2026')
  })

  it('carries the reference in the subject and header, the URL in text, the expiry and the signature', () => {
    const url = 'https://dashboard.example/connect/' + 'k'.repeat(43)
    const m = hrLinkEmail(link, url)
    expect(m.subject).toBe("Employee list for Gembridge Capital Management Pte Ltd's group benefits quotation · ref GB-2026-0142")
    expect(m.html).toContain('Reference GB-2026-0142')
    expect(m.html).toContain('Dear Ms Soh,')
    expect(m.html).toContain('at the request of How Beng Wee')
    expect(m.html).toContain('effective 24 October 2026')
    expect(m.html).toContain('What we ask for')
    expect(m.html).toContain('What we do not ask for')
    expect(m.html).toContain('expires on 26 October 2026')
    expect(m.html).toContain('Catherine Tan')
    expect(m.html).toContain('[registered address, Singapore]')
    expect(m.html).toContain('[UEN]')
    expect(m.html).toContain('[insurance broker registration]')
    expect(m.html).toContain('[office number]')
    expect(m.html).toContain('hr@gembridge.sg')
    expect(m.text).toContain(url)
    expect(m.text).not.toContain('<')
    expect((m.html.match(/<a /g) ?? []).length).toBe(1)
  })

  it('uses the stored message when the sender edited it', () => {
    const m = hrLinkEmail({ ...link, message: 'Dear Lay Yen,\n\nAs discussed.' }, 'https://x/connect/t')
    expect(m.html).toContain('<p>Dear Lay Yen,</p>')
    expect(m.html).toContain('<p>As discussed.</p>')
    expect(m.html).not.toContain('Dear Ms Soh')
  })

  it('builds the default three paragraphs', () => {
    const d = defaultMessage(link)
    expect(d.split('\n\n')).toHaveLength(3)
    expect(d).not.toMatch(/!/)
  })
})
