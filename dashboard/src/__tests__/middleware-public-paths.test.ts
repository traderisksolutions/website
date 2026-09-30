import { describe, it, expect } from 'vitest'
import { PUBLIC_PATHS } from '@/middleware'

const isPublic = (p: string) => PUBLIC_PATHS.some(x => p.startsWith(x))

describe('PUBLIC_PATHS', () => {
  it('lets a signed-out user start and finish sign-in', () => {
    // Omitting /auth/signin makes sign-in unreachable: the middleware bounces it to /login,
    // whose only button points back at /auth/signin.
    for (const p of ['/login', '/auth/signin', '/auth/signin?next=%2Fengagement', '/auth/callback?code=x', '/auth/signout'])
      expect(isPublic(p)).toBe(true)
  })

  it('still gates the application itself', () => {
    for (const p of ['/', '/engagement', '/companies', '/debit-notes', '/api/debit-notes', '/nexus'])
      expect(isPublic(p)).toBe(false)
  })
})
