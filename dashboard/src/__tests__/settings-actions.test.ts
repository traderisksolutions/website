import { describe, it, expect, vi, beforeEach } from 'vitest'

// The session, the administrator flag and the database are swapped per test.
let sessionUser: { id: string; email: string; user_metadata: Record<string, never> } | null = null
let admin = false
const writes: { table: string; op: string; value: unknown }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) } })),
}))
vi.mock('@/lib/auth/admin', () => ({ isAdmin: vi.fn(async () => admin) }))
vi.mock('@/lib/log-activity', () => ({ logActivity: vi.fn() }))

/** A query builder that records inserts, updates and upserts and answers with no rows. */
function builder(table: string) {
  const result = { data: null as unknown, error: null }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'or', 'order', 'limit', 'ilike', 'in', 'delete']) b[m] = () => b
  for (const op of ['insert', 'update', 'upsert']) b[op] = (value: unknown) => { writes.push({ table, op, value }); result.data = { id: 'new-id', email: 'x' }; return b }
  b.maybeSingle = () => b
  b.single = () => b
  b.then = (ok: (r: typeof result) => unknown) => Promise.resolve(result).then(ok)
  return b
}
vi.mock('@/lib/db/client', () => ({
  db: () => ({ from: (t: string) => builder(t) }),
  rows: async (_w: string, q: PromiseLike<{ data: unknown }>) => ((await q).data ?? []) as unknown[],
  one: async (_w: string, q: PromiseLike<{ data: unknown }>) => (await q).data ?? null,
}))

const STAFF = { id: '00000000-0000-0000-0000-000000000001', email: 'test.user@trade-risksol.com', user_metadata: {} }

describe('Settings actions: who may change what', () => {
  beforeEach(() => { sessionUser = STAFF; admin = false; writes.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('refuses every action without a TRS session', async () => {
    const { getSetting } = await import('@/app/settings/actions')
    sessionUser = null
    expect(await getSetting('anything')).toEqual({ ok: false, error: 'Please sign in again.' })
  })

  it('lets staff change an ordinary setting but only an administrator the shared senders', async () => {
    const { setSetting } = await import('@/app/settings/actions')
    expect((await setSetting('debit_note_email_template', '{}')).ok).toBe(true)
    expect(await setSetting('shared_email_senders', '[]')).toEqual({ ok: false, error: 'Admin access required' })
    admin = true
    expect((await setSetting('shared_email_senders', '[]')).ok).toBe(true)
  })

  it('changing access needs an administrator, and never your own', async () => {
    const { changeAccess } = await import('@/app/settings/actions')
    expect(await changeAccess({ userId: 'someone', role: 'administrator' })).toEqual({ ok: false, error: 'Only an administrator can change access.' })
    admin = true
    expect(await changeAccess({ userId: STAFF.id, active: false })).toEqual({ ok: false, error: 'You cannot change your own access. Ask another administrator.' })
    expect(writes).toEqual([])
  })

  it('adds a person on the TRS domain with an id (app_users.id has no default)', async () => {
    const { addTeamMember } = await import('@/app/settings/actions')
    admin = true
    expect((await addTeamMember('someone@example.invalid')).ok).toBe(false)
    expect((await addTeamMember('New.Person@trade-risksol.com', 'New Person')).ok).toBe(true)
    const insert = writes.find(w => w.table === 'app_users' && w.op === 'insert')?.value as { id?: string; email: string }
    expect(insert.email).toBe('new.person@trade-risksol.com')
    expect(insert.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
