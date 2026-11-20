/**
 * Browser-side auth client.
 *
 * Was Supabase's browser client. The session cookie is httpOnly, so the root layout reads the
 * signed session on the server and writes the user into the page (`window.__TRS_USER__`,
 * `sessionUserScript`); getUser() answers from that with no request. /api/auth/me remains the
 * fallback for a page rendered without it. The shape is kept so call sites
 * (`createClient().auth.getUser()`) do not change.
 */
export interface BrowserUser {
  id: string
  email: string
  user_metadata: { name?: string | null; full_name?: string | null }
}

import { from } from './query-shim'

declare global { interface Window { __TRS_USER__?: BrowserUser | null } }

/** The signed-in user written into the page by the root layout, or undefined when it was not. */
export function pageUser(): BrowserUser | null | undefined {
  return typeof window === 'undefined' ? undefined : window.__TRS_USER__
}

export function createClient() {
  return {
    // Reads and writes for the chat dock go through /api/db/<table>, which is session-guarded
    // and allow-lists only the chat tables. The browser holds no database credentials.
    from,
    auth: {
      async getUser(): Promise<{ data: { user: BrowserUser | null }; error: null }> {
        const known = pageUser()
        if (known !== undefined) return { data: { user: known }, error: null }
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
