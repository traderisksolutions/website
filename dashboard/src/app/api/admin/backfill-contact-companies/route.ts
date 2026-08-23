/**
 * One-off backfill (Sales Loop v2, Phase 5 / F3): resolve contacts.company_id for existing
 * contacts that only have the free-text company name — the same resolveCompany dedup the three
 * lead-creation paths now run at intake, applied retroactively. Recommended, not mandatory:
 * absence just means a pre-existing contact keeps showing free text only, same as today.
 * Idempotent; run until remaining = 0. Mirrors backfill-thread-contacts/route.ts's response
 * shape, but NOT its offset semantics — this route filters at the query level
 * (company_id=is.null), so the matching set shrinks as rows succeed. The caller must always
 * call with offset=0 (a resolved row simply stops matching next call) rather than incrementing;
 * offset only exists here for API-shape consistency, not real pagination.
 *
 * POST /api/admin/backfill-contact-companies?limit=100
 * Auth: a signed-in employee (session) OR x-internal-secret: <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { resolveCompany }            from '@/lib/debit-note-commit'

export const maxDuration = 300

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

type ContactRow = { id: string; company: string | null }

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

    // Only rows that have a company name to resolve but no company_id yet — always from the
    // front (offset 0): a row that resolves successfully stops matching on the next call, so
    // there's nothing to "skip past."
    const listRes = await fetch(
      `${SB_URL}/rest/v1/contacts?select=id,company&company=not.is.null&company_id=is.null&order=created_at.asc&limit=${limit}`,
      { headers: sbH(), cache: 'no-store' },
    )
    const rows = (listRes.ok ? await listRes.json() : []) as ContactRow[]

    let processed = 0, updated = 0
    for (const c of rows) {
      processed++
      const name = c.company?.trim()
      if (!name) continue
      const companyId = await resolveCompany({ companyName: name }).catch(() => null)
      if (!companyId) continue
      const r = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${c.id}`, {
        method: 'PATCH', headers: sbH('return=minimal'),
        body: JSON.stringify({ company_id: companyId }),
      })
      if (r.ok) updated++
    }

    // done when nothing left to fetch, OR a full round made no progress (unresolvable rows) —
    // the caller should stop either way rather than re-fetching the same stuck rows forever.
    return NextResponse.json({ processed, updated, done: rows.length < limit || (rows.length > 0 && updated === 0) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
