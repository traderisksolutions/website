import { describe, expect, it, beforeAll } from 'vitest'
import { seal, unseal } from '@/lib/gmail/mailboxes'
import { PUBLIC_PATHS } from '@/middleware'

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-for-gmail-mailboxes' })

describe('refresh token sealing', () => {
  it('round-trips and never stores the token in clear', () => {
    const sealed = seal('1//0refresh-token')
    expect(sealed).not.toContain('refresh-token')
    expect(unseal(sealed)).toBe('1//0refresh-token')
  })
  it('rejects a tampered token', () => {
    const [iv, tag, body] = seal('1//0refresh-token').split('.')
    expect(() => unseal([iv, tag, body.slice(0, -2) + 'AA'].join('.'))).toThrow()
  })
})

describe('the consent link', () => {
  it('opens without a dashboard session', () => {
    expect(PUBLIC_PATHS.some(p => '/auth/gmail'.startsWith(p))).toBe(true)
    expect(PUBLIC_PATHS.some(p => '/connect/gmail'.startsWith(p))).toBe(true)
  })
})
