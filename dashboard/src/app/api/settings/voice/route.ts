/**
 * The house voice (soul.md).
 *
 *   GET    → the current text, whether it is the shipped default, and when it last changed
 *   PATCH  → { text } replace it. Administrators only.
 *   DELETE → go back to the shipped default. Administrators only.
 *
 * Every change is written to the activity log with the text it replaced, so an edit that makes
 * drafts worse can be read back and undone. The voice reaches every client draft; a bad edit
 * with no history would be hard to unwind.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { DEFAULT_SOUL, VOICE_KEY, invalidateVoice } from '@/lib/voice'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
/** Long enough for a real house style; short enough that it never crowds an agent's task out of
 *  the context. About 3,000 words. */
const MAX_CHARS = 20_000

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

async function stored(): Promise<{ value: string | null; updated_at: string | null }> {
  const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${VOICE_KEY}&select=value,updated_at&limit=1`,
    { headers: sbH(), cache: 'no-store' })
  const rows = res.ok ? await res.json() as { value: string | null; updated_at: string | null }[] : []
  return rows[0] ?? { value: null, updated_at: null }
}

async function admin(): Promise<{ id: string; email: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const res = await fetch(`${SB_URL}/rest/v1/employee_profiles?user_id=eq.${user.id}&select=is_admin&limit=1`,
    { headers: sbH(), cache: 'no-store' })
  const rows = res.ok ? await res.json() as { is_admin: boolean | null }[] : []
  if (!rows[0]?.is_admin) return NextResponse.json({ error: 'Only an administrator can change the tone of voice.' }, { status: 403 })
  return { id: user.id, email: user.email ?? '' }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  try {
    const row = await stored()
    const text = row.value?.trim() ? row.value : DEFAULT_SOUL
    return NextResponse.json({ text, isDefault: !row.value?.trim(), updatedAt: row.updated_at, defaultText: DEFAULT_SOUL })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const who = await admin()
  if (who instanceof NextResponse) return who
  try {
    const { text } = await req.json() as { text?: string }
    const next = (text ?? '').replace(/\r\n/g, '\n').trim()
    if (!next) return NextResponse.json({ error: 'The tone of voice cannot be empty. Use Restore default instead.' }, { status: 400 })
    if (next.length > MAX_CHARS) {
      return NextResponse.json({ error: `Keep it under ${MAX_CHARS.toLocaleString()} characters. It is ${next.length.toLocaleString()}.` }, { status: 400 })
    }
    const before = await stored()
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=key`, {
      method: 'POST', headers: sbH('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify({ key: VOICE_KEY, value: next, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) return NextResponse.json({ error: (await res.text()).slice(0, 200) }, { status: 500 })
    invalidateVoice()
    void logActivity({ action: 'voice.updated', resource_type: 'app_settings', resource_id: VOICE_KEY,
                       old_value: { text: before.value ?? DEFAULT_SOUL }, new_value: { text: next } })
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function DELETE() {
  const who = await admin()
  if (who instanceof NextResponse) return who
  try {
    const before = await stored()
    await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${VOICE_KEY}`, { method: 'DELETE', headers: sbH() })
    invalidateVoice()
    void logActivity({ action: 'voice.restored_default', resource_type: 'app_settings', resource_id: VOICE_KEY,
                       old_value: { text: before.value } })
    return NextResponse.json({ ok: true, text: DEFAULT_SOUL })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
