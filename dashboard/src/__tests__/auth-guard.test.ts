import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { can, withCron, withStaff, withStaffOrCron, requireStaffOrCron } from '@/lib/auth/guard'

// The session is read through createClient(); swap the user per test.
let sessionUser: { id: string; email: string; user_metadata: Record<string, never> } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) } })),
}))

// Fake values only. The staff address has to be on the TRS domain for the domain rule to pass.
const STAFF = { id: 'u-test', email: 'test.user@trade-risksol.com', user_metadata: {} }
const OUTSIDER = { id: 'u-out', email: 'someone@example.invalid', user_metadata: {} }
const FAKE_CRON = 'fake-cron-value-for-tests'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('https://dashboard.example.invalid/api/x', { headers })
const ctx = { params: Promise.resolve({ id: 'abc' }) }
const ok = () => Response.json({ ok: true })

describe('lib/auth/guard', () => {
  const saved = process.env.CRON_SECRET
  beforeEach(() => { sessionUser = null; process.env.CRON_SECRET = FAKE_CRON })
  afterEach(() => { process.env.CRON_SECRET = saved })

  it('withStaff lets a signed-in TRS user through and hands over the user and context', async () => {
    sessionUser = STAFF
    const handler = vi.fn(async (_r: NextRequest, c: typeof ctx, a: { user: { email: string } }) =>
      Response.json({ id: (await c.params).id, email: a.user.email }))
    const res = await withStaff(handler)(req(), ctx)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ id: 'abc', email: STAFF.email })
  })

  it('withStaff answers 401 without a session, and the handler does not run', async () => {
    const handler = vi.fn(ok)
    const res = await withStaff(handler)(req(), ctx)
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({ error: 'unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('withStaff keeps the route’s own 401 body', async () => {
    const res = await withStaff(ok, { error: 'Not authenticated' })(req(), ctx)
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({ error: 'Not authenticated' })
  })

  it('withStaff refuses a session outside the TRS domain', async () => {
    sessionUser = OUTSIDER
    const res = await withStaff(ok)(req(), ctx)
    expect(res!.status).toBe(401)
  })

  it('withStaff does not accept the cron bearer', async () => {
    const res = await withStaff(ok)(req({ authorization: `Bearer ${FAKE_CRON}` }), ctx)
    expect(res!.status).toBe(401)
  })

  it('withCron lets the right bearer through', async () => {
    const res = await withCron(ok)(req({ authorization: `Bearer ${FAKE_CRON}` }), ctx)
    expect(res!.status).toBe(200)
  })

  it('withCron answers 401 to a wrong bearer, to no bearer and to a staff session', async () => {
    sessionUser = STAFF
    for (const h of [{ authorization: 'Bearer wrong-value' }, {}]) {
      const res = await withCron(ok, { error: 'Unauthorized' })(req(h), ctx)
      expect(res!.status).toBe(401)
      expect(await res!.json()).toEqual({ error: 'Unauthorized' })
    }
  })

  it('withCron refuses everything when no cron secret is set', async () => {
    delete process.env.CRON_SECRET
    const res = await withCron(ok)(req({ authorization: 'Bearer ' }), ctx)
    expect(res!.status).toBe(401)
  })

  it('withStaffOrCron accepts the bearer (user null) or a staff session (user set)', async () => {
    const seen: (string | null)[] = []
    const route = withStaffOrCron(async (_r, _c, { user }) => { seen.push(user?.email ?? null); return ok() })
    expect((await route(req({ authorization: `Bearer ${FAKE_CRON}` }), ctx))!.status).toBe(200)
    sessionUser = STAFF
    expect((await route(req(), ctx))!.status).toBe(200)
    expect(seen).toEqual([null, STAFF.email])
  })

  it('withStaffOrCron answers 401 to a wrong bearer with no session', async () => {
    const res = await withStaffOrCron(ok)(req({ authorization: 'Bearer wrong-value' }), ctx)
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({ error: 'unauthorized' })
  })

  it('requireStaffOrCron returns null when allowed and a 401 otherwise', async () => {
    expect(await requireStaffOrCron(req({ authorization: `Bearer ${FAKE_CRON}` }))).toBeNull()
    expect((await requireStaffOrCron(req()))!.status).toBe(401)
    sessionUser = STAFF
    expect(await requireStaffOrCron(req())).toBeNull()
  })

  it('can() is true for every staff user and false for anyone else', () => {
    expect(can(STAFF, 'policy.write')).toBe(true)
    expect(can(STAFF, 'anything.else')).toBe(true)
    expect(can(OUTSIDER, 'policy.write')).toBe(false)
    expect(can(null, 'policy.write')).toBe(false)
  })
})
