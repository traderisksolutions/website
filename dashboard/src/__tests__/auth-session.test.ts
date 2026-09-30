import { describe, it, expect } from 'vitest'
import { createSession, readSession, isAllowedEmail, SESSION_TTL_SECONDS } from '@/lib/auth/session'

const S = 'a-test-secret-at-least-32-characters-long'
const u = { id: 'u1', email: 'nathan.budiutomo@trade-risksol.com', name: 'Nathan' }

describe('session', () => {
  it('round-trips a user', async () => {
    const p = await readSession(await createSession(u, S), S)
    expect(p?.email).toBe(u.email); expect(p?.id).toBe('u1')
  })

  it('rejects a tampered payload', async () => {
    const t = await createSession(u, S)
    const forged = Buffer.from(JSON.stringify({ ...u, email: 'attacker@evil.com', iat: 1, exp: 9e9 })).toString('base64url')
    expect(await readSession(`${forged}.${t.split('.')[1]}`, S)).toBeNull()
  })

  it('rejects a different signing secret', async () => {
    expect(await readSession(await createSession(u, S), 'another-secret-entirely-32-chars-x')).toBeNull()
  })

  it('rejects an expired session', async () => {
    const now = Date.now()
    const t = await createSession(u, S, now)
    expect(await readSession(t, S, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull()
    expect(await readSession(t, S, now + 1000)).not.toBeNull()
  })

  it('rejects junk without throwing', async () => {
    for (const bad of [undefined, null, '', 'x', 'a.b', '....']) expect(await readSession(bad as string, S)).toBeNull()
  })
})

describe('isAllowedEmail', () => {
  it('admits TRS staff only', async () => {
    expect(isAllowedEmail('angela@trade-risksol.com')).toBe(true)
    expect(isAllowedEmail('ANGELA@Trade-RiskSol.com')).toBe(true)
  })
  it('rejects lookalike and crafted domains', async () => {
    for (const e of ['a@evil.com', 'a@trade-risksol.com.evil.com', 'a@nottrade-risksol.com', 'trade-risksol.com', '', null])
      expect(isAllowedEmail(e as string)).toBe(false)
  })
})
