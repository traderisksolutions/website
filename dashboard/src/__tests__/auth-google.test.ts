import { describe, it, expect } from 'vitest'
import { authorizeUrl, profileFromIdToken } from '@/lib/auth/google'

const tok = (p: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`
const good = { iss: 'https://accounts.google.com', aud: 'CID', sub: '123', email: 'a@trade-risksol.com', email_verified: true, name: 'A' }

describe('authorizeUrl', () => {
  it('asks Google for the right thing', () => {
    const u = new URL(authorizeUrl({ clientId: 'CID', redirectUri: 'https://x/cb', state: 'S', hd: 'trade-risksol.com' }))
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('scope')).toBe('openid email profile')
    expect(u.searchParams.get('state')).toBe('S')
    expect(u.searchParams.get('hd')).toBe('trade-risksol.com')
  })
})

describe('profileFromIdToken', () => {
  it('accepts a well-formed Google token', () => {
    expect(profileFromIdToken(tok(good), 'CID')?.email).toBe('a@trade-risksol.com')
  })
  it('rejects a token minted for another application', () => {
    expect(profileFromIdToken(tok({ ...good, aud: 'SOMEONE_ELSE' }), 'CID')).toBeNull()
  })
  it('rejects a token from another issuer', () => {
    expect(profileFromIdToken(tok({ ...good, iss: 'https://evil.example' }), 'CID')).toBeNull()
  })
  it('rejects an unverified email', () => {
    expect(profileFromIdToken(tok({ ...good, email_verified: false }), 'CID')).toBeNull()
  })
  it('rejects malformed input', () => {
    for (const t of ['', 'a.b', 'a.b.c']) expect(profileFromIdToken(t, 'CID')).toBeNull()
  })
})
