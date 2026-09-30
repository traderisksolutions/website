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
    // Supabase issued a signed URL and the browser uploaded straight to storage. Drive has no
    // equivalent, so the bytes go to our own route, which writes them into the Shared Drive.
    // The signature is kept so the five existing call sites do not change; the token argument
    // is no longer meaningful and is ignored.
    storage: {
      from(bucket: string) {
        return {
          async uploadToSignedUrl(path: string, _token: string, file: File | Blob, opts?: { contentType?: string; upsert?: boolean }) {
            try {
              const res = await fetch(`/api/files/upload?path=${encodeURIComponent(`${bucket}/${path}`)}`, {
                method: 'POST',
                headers: { 'Content-Type': opts?.contentType || (file as File).type || 'application/octet-stream' },
                body: file,
              })
              if (!res.ok) {
                const t = await res.text()
                return { data: null, error: { message: t.slice(0, 200) || `HTTP ${res.status}` } }
              }
              return { data: await res.json() as { path: string }, error: null }
            } catch (e) {
              return { data: null, error: { message: e instanceof Error ? e.message : 'upload failed' } }
            }
          },
        }
      },
    },
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
