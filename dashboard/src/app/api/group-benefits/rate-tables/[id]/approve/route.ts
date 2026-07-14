/**
 * POST /api/group-benefits/rate-tables/[id]/approve
 * Human sign-off: mark this table approved, archive any previously-approved table for the
 * same insurer + product (keeping history), and assign the next version number.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const tRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}&select=insurer_id,product_code,insurer_name&limit=1`, { headers: sbH(), cache: 'no-store' })
    const t = tRes.ok ? (await tRes.json())[0] : null
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Prior approved tables for the same insurer + product → count for versioning + archive.
    const insurerFilter = t.insurer_id ? `insurer_id=eq.${t.insurer_id}` : `insurer_name=eq.${encodeURIComponent(t.insurer_name ?? '')}`
    const priorRes = await fetch(`${SB_URL}/rest/v1/gb_rate_tables?${insurerFilter}&product_code=eq.${encodeURIComponent(t.product_code)}&status=eq.approved&select=id`, { headers: sbH(), cache: 'no-store' })
    const prior: { id: string }[] = priorRes.ok ? await priorRes.json() : []
    for (const p of prior) {
      await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${p.id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'archived' }) }).catch(() => {})
    }

    await fetch(`${SB_URL}/rest/v1/gb_rate_tables?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(),
      body: JSON.stringify({ status: 'approved', version: prior.length + 1, approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })
    void logActivity({ action: 'gb.approved', resource_type: 'gb_rate_table', resource_id: id, new_value: { version: prior.length + 1, archived_prior: prior.length } })
    return NextResponse.json({ ok: true, version: prior.length + 1 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
