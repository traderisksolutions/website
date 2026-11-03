/**
 * GET  /api/methods/renewal            → { current, versions, parsed, isDefault }
 * GET  /api/methods/renewal?version=n  → the same, viewing version n
 * POST /api/methods/renewal { text } | { restore: n } → saves a new version
 *
 * The renewal method admins edit: thresholds, overrides and drafting considerations the agents
 * read on every run (src/lib/methods/method.ts). Every save is a new version.
 */
import { NextRequest } from 'next/server'
import { actor, json } from '@/lib/sales/auth'
import { sb, sbTry, enc } from '@/lib/crm/db'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_RENEWAL_METHOD, METHOD_KEYS, clearMethodCache, parseMethod, type MethodKey } from '@/lib/methods/method'

export const dynamic = 'force-dynamic'
type Row = { version: number; text: string; created_by: string | null; created_at: string }
const MISSING = /does not exist|42P01|PGRST205/
/** Only an administrator changes the method; everyone signed in can read it. */
async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return false
  const [row] = await sbTry<{ is_admin: boolean | null }[]>(`employee_profiles?user_id=eq.${enc(user.id)}&select=is_admin&limit=1`, [])
  return !!row?.is_admin
}
const isKey = (k: string): k is MethodKey => (METHOD_KEYS as readonly string[]).includes(k)

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const { key } = await ctx.params
  if (!isKey(key)) return json({ error: 'Unknown method' }, 404)
  try {
    const versions = await sb<Omit<Row, 'text'>[]>(`agent_methods?key=eq.${enc(key)}&select=version,created_by,created_at&order=version.desc&limit=200`)
    const want = Number(req.nextUrl.searchParams.get('version') ?? 0)
    const [row] = await sb<Row[]>(`agent_methods?key=eq.${enc(key)}${want > 0 ? `&version=eq.${want}` : ''}&select=version,text,created_by,created_at&order=version.desc&limit=1`)
    const text = row?.text ?? DEFAULT_RENEWAL_METHOD
    return json({ current: row ?? null, versions, parsed: parseMethod(text, row?.version ?? null), text, isDefault: !row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (MISSING.test(msg)) return json({ current: null, versions: [], parsed: parseMethod(DEFAULT_RENEWAL_METHOD), text: DEFAULT_RENEWAL_METHOD, isDefault: true, migrationPending: true })
    return json({ error: msg }, 500)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const who = await actor(req)
  if (who instanceof Response) return who
  const { key } = await ctx.params
  if (!isKey(key)) return json({ error: 'Unknown method' }, 404)
  if (!(await isAdmin())) return json({ error: 'Only an administrator can change the renewal method.' }, 403)
  const b = await req.json().catch(() => ({})) as { text?: unknown; restore?: unknown }
  let text: string
  if (b.restore !== undefined) {
    const n = Math.floor(Number(b.restore))
    const [row] = n > 0 ? await sbTry<Row[]>(`agent_methods?key=eq.${enc(key)}&version=eq.${n}&select=text&limit=1`, []) : []
    if (!row) return json({ error: `Version ${String(b.restore)} not found` }, 404)
    text = row.text
  } else if (typeof b.text === 'string') text = b.text
  else return json({ error: 'text or restore required' }, 400)
  text = text.replace(/\r\n?/g, '\n').trim() + '\n'
  if (text.length < 40 || text.length > 100_000) return json({ error: 'The method must be between 40 and 100,000 characters' }, 400)
  if (!/^# Thresholds/m.test(text)) return json({ error: 'Keep the "# Thresholds" section: the rules read it' }, 400)
  try {
    const [last] = await sb<{ version: number }[]>(`agent_methods?key=eq.${enc(key)}&select=version&order=version.desc&limit=1`)
    const version = (last?.version ?? 0) + 1
    await sb('agent_methods', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ key, version, text, created_by: who.email }) })
    clearMethodCache()
    return json({ version, parsed: parseMethod(text, version) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (MISSING.test(msg)) return json({ error: 'Migration 20261103_agent_methods is not applied yet.', migrationPending: true }, 409)
    return json({ error: msg }, 500)
  }
}
