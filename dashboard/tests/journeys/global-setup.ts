/**
 * Signs the journeys in as a real TRS user: a session cookie minted with the app's own
 * createSession and AUTH_SECRET, as Nathan (a mailbox owner) unless JOURNEY_USER_EMAIL names another
 * app_users row. Run the server with API_GATE_MODE=log-only locally: a local build has no WEB_API_KEY.
 */
import { writeFileSync } from 'node:fs'
import { createSession, SESSION_COOKIE } from '../../src/lib/auth/session'

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY, secret = process.env.AUTH_SECRET
  if (!url || !key || !secret) throw new Error('Journey tests need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY and AUTH_SECRET (source .env.local)')
  const who = process.env.JOURNEY_USER_EMAIL ?? 'nathan.budiutomo@trade-risksol.com'
  const res = await fetch(`${url}/rest/v1/app_users?select=id,email,name&email=eq.${encodeURIComponent(who)}&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const [u] = await res.json() as { id: string; email: string; name: string | null }[]
  if (!u) throw new Error('No TRS user in app_users')
  const token = await createSession({ id: u.id, email: u.email, name: u.name ?? u.email }, secret)
  const base = new URL(process.env.JOURNEY_BASE_URL ?? `http://localhost:${process.env.JOURNEY_PORT ?? 3118}`)
  writeFileSync('tests/journeys/.auth.json', JSON.stringify({
    cookies: [{ name: SESSION_COOKIE, value: token, domain: base.hostname, path: '/', expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: base.protocol === 'https:', sameSite: 'Lax' }],
    origins: [],
  }))
}
