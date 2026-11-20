import { describe, it, expect, vi, beforeEach } from 'vitest'
import { staffAction } from '@/lib/auth/action'

// The session is read through createClient(); swap the user per test.
let sessionUser: { id: string; email: string; user_metadata: Record<string, never> } | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) } })),
}))

const STAFF = { id: 'u-test', email: 'Test.User@trade-risksol.com', user_metadata: {} }
const OUTSIDER = { id: 'u-out', email: 'someone@example.invalid', user_metadata: {} }

describe('lib/auth/action staffAction', () => {
  beforeEach(() => { sessionUser = null; vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('runs for a TRS staff session and passes the email lower-cased', async () => {
    sessionUser = STAFF
    const fn = vi.fn(async (u: { email: string }) => u.email)
    expect(await staffAction('t', fn)).toEqual({ ok: true, data: 'test.user@trade-risksol.com' })
  })

  it('refuses no session and an outside address without running the action', async () => {
    const fn = vi.fn(async () => 'ran')
    expect(await staffAction('t', fn)).toEqual({ ok: false, error: 'Please sign in again.' })
    sessionUser = OUTSIDER
    expect(await staffAction('t', fn)).toEqual({ ok: false, error: 'Please sign in again.' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns a thrown error as its message instead of throwing', async () => {
    sessionUser = STAFF
    expect(await staffAction('t', async () => { throw new Error('Company id is not valid') })).toEqual({ ok: false, error: 'Company id is not valid' })
  })
})
