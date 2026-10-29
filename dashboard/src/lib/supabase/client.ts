/**
 * Browser-side auth client.
 *
 * Was Supabase's browser client; now reads the signed session through /api/auth/me, because the
 * session cookie is httpOnly and deliberately unreadable from JavaScript. The shape is kept so
 * existing call sites (`createClient().auth.getUser()`) do not change.
 */
export interface BrowserUser {
  id: string
  email: string
  user_metadata: { name?: string | null; full_name?: string | null }
}

import { from } from './query-shim'

export function createClient() {
  return {
    // Reads and writes for the chat dock go through /api/db/<table>, which is session-guarded
    // and allow-lists only the chat tables. The browser holds no database credentials.
    from,
    auth: {
      async getUser(): Promise<{ data: { user: BrowserUser | null }; error: null }> {
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' })
          if (!res.ok) return { data: { user: null }, error: null }
          const j = await res.json() as { user: BrowserUser | null }
          return { data: { user: j.user ?? null }, error: null }
        } catch { return { data: { user: null }, error: null } }
      },
      async signOut(): Promise<{ error: null }> {
        window.location.href = '/auth/signout'
        return { error: null }
      },
    },
  }
}
