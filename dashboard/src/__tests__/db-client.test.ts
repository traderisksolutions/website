import { describe, expect, it } from 'vitest'
import { DbError, one, rows } from '@/lib/db/client'

const ok = <T,>(data: T) => Promise.resolve({ data, error: null })
const fail = (message: string, code = 'PGRST201') => Promise.resolve({ data: null, error: { message, code, details: '', hint: '', name: 'PostgrestError' } })

describe('typed database client', () => {
  it('returns the rows of a query, and an empty list only when there are none', async () => {
    expect(await rows('Policies', ok([{ id: 'a' }]))).toEqual([{ id: 'a' }])
    expect(await rows('Policies', ok(null as unknown as { id: string }[]))).toEqual([])
  })

  it('throws on an error instead of answering an empty list (the 19 Nov policies bug)', async () => {
    await expect(rows('Policies', fail('Could not embed because more than one relationship was found'))).rejects.toThrow(DbError)
    await expect(rows('Policies', fail('Could not embed'))).rejects.toThrow('Policies failed: Could not embed (PGRST201)')
  })

  it('returns one row or null, and throws on an error', async () => {
    expect(await one('Policy', ok({ id: 'a' }))).toEqual({ id: 'a' })
    expect(await one('Policy', ok(null))).toBeNull()
    await expect(one('Policy', fail('permission denied', '42501'))).rejects.toThrow('Policy failed: permission denied (42501)')
  })
})
