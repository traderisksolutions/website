/**
 * One-off backfill (#3): re-attribute threads whose CONTACT is missing or generic (no
 * email — i.e. the old "Trade Risk Solutions" company placeholder) to the real client, or
 * failing that the TRS employee who handled it. Idempotent; run until remaining = 0.
 *
 * POST /api/admin/backfill-thread-contacts?limit=100&offset=0
 * Auth: a signed-in employee (session) OR x-internal-secret: <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { resolveBestContactForThread } from '@/lib/resolve-thread-contact'

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type ThreadRow = {
  id: string
  contact_id: string | null
  contact: { email: string | null; first_name: string | null; is_employee: boolean | null } | null
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (secret !== (process.env.CRON_SECRET ?? '__none__')) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const sp     = new URL(req.url).searchParams
    const limit  = Math.min(Number(sp.get('limit') ?? 100), 200)
    const offset = Math.max(Number(sp.get('offset') ?? 0), 0)

    // Newest first; embed the current contact so we can tell which threads need fixing.
    const listRes = await fetch(
      `${SB_URL}/rest/v1/email_threads?select=id,contact_id,contact:contacts(email,first_name,is_employee)&order=last_message_at.desc&offset=${offset}&limit=${limit}`,
      { headers: sbH(), cache: 'no-store' },
    )
    const rows = (listRes.ok ? await listRes.json() : []) as ThreadRow[]

    let processed = 0, updated = 0
    for (const t of rows) {
      processed++
      // Needs fixing when there's no contact, or the contact has no email (the generic
      // company placeholder). A contact that already has an email is left untouched.
      const needsFix = !t.contact_id || !t.contact?.email
      if (!needsFix) continue

      const resolved = await resolveBestContactForThread(t.id)
      if (resolved.contactId && resolved.contactId !== t.contact_id) {
        const r = await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${t.id}`, {
          method: 'PATCH', headers: sbH('return=minimal'),
          body: JSON.stringify({ contact_id: resolved.contactId }),
        })
        if (r.ok) updated++
      }
    }

    return NextResponse.json({ processed, updated, nextOffset: offset + rows.length, done: rows.length < limit })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
