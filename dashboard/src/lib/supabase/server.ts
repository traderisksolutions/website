/**
 * Server-side auth client.
 *
 * Was Supabase Auth; now backed by our own signed session cookie (see lib/auth/session.ts).
 * The shape is kept deliberately identical — `const { data: { user } } = await
 * supabase.auth.getUser()` — because 129 call sites across 110 API routes use exactly that
 * line. Keeping the shape means the migration touches this file instead of all of them.
 */
import { cookies } from 'next/headers'
import { readSession, SESSION_COOKIE, type SessionUser } from '@/lib/auth/session'

export interface AuthedUser {
  id: string
  email: string
  user_metadata: { name?: string | null; full_name?: string | null }
}

export interface AuthClient {
  auth: {
    getUser(): Promise<{ data: { user: AuthedUser | null }; error: null }>
    signOut(): Promise<{ error: null }>
  }
}

function toUser(s: SessionUser): AuthedUser {
  return { id: s.id, email: s.email, user_metadata: { name: s.name ?? null, full_name: s.name ?? null } }
}

export async function createClient(): Promise<AuthClient> {
  const jar = await cookies()
  const secret = process.env.AUTH_SECRET ?? ''
  return {
    auth: {
      async getUser() {
        const s = await readSession(jar.get(SESSION_COOKIE)?.value, secret)
        return { data: { user: s ? toUser(s) : null }, error: null }
      },
      async signOut() {
        try { jar.delete(SESSION_COOKIE) } catch { /* read-only context */ }
        return { error: null }
      },
    },
  }
}
