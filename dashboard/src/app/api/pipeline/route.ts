import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'
import { requireStaffOrCron } from '@/lib/api-auth'

// GET /api/pipeline
// ?origin=inbound|outbound   filter to one side of the union (default: both)
// ?status=new|in_progress|closed|spam
// ?q=text                    search display_name/email/company (ilike)
// Queries the unified_pipeline view (supabase/migrations/20260817_unified_pipeline_view.sql)
// server-side with the service key — outbound_leads has RLS enabled with no policies
// (implicitly service-role-only), so this must never be queried client-side/anon.
export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const params = req.nextUrl.searchParams
    const origin = params.get('origin')
    const status = params.get('status')
    const q      = params.get('q')

    const filters: string[] = []
    if (origin) filters.push(`origin=eq.${encodeURIComponent(origin)}`)
    if (status) filters.push(`status_bucket=eq.${encodeURIComponent(status)}`)
    if (q) {
      const like = encodeURIComponent(`%${q}%`)
      filters.push(`or=(display_name.ilike.${like},email.ilike.${like},company.ilike.${like})`)
    }

    const query =
      `${SB_URL}/rest/v1/unified_pipeline?select=*&order=created_at.desc&limit=500` +
      (filters.length ? `&${filters.join('&')}` : '')

    const res = await fetch(query, { headers: sbHeaders(), cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })

    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

// DELETE /api/pipeline   { rows: { origin: 'inbound' | 'outbound'; id: string }[] }
// Bulk delete straight from the underlying table (inbound_leads / outbound_leads) — the
// unified_pipeline view itself isn't writable. Dependent rows (contacts.*_lead_id,
// ob_campaign_leads, ob_people_dump, etc.) are all ON DELETE CASCADE/SET NULL per schema —
// nothing needs manual cleanup first. Mainly for clearing test/junk leads out of the pipeline.
export async function DELETE(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { rows } = await req.json() as { rows?: { origin: string; id: string }[] }
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    const inboundIds  = rows.filter(r => r.origin === 'inbound').map(r => r.id)
    const outboundIds = rows.filter(r => r.origin === 'outbound').map(r => r.id)

    const [inboundRes, outboundRes] = await Promise.all([
      inboundIds.length
        ? fetch(`${SB_URL}/rest/v1/inbound_leads?id=in.(${inboundIds.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: sbHeaders() })
        : null,
      outboundIds.length
        ? fetch(`${SB_URL}/rest/v1/outbound_leads?id=in.(${outboundIds.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: sbHeaders() })
        : null,
    ])

    // The two deletes hit independent tables with no shared transaction — report exactly which
    // side failed and how many rows actually went through, rather than a single opaque error
    // that could describe only half of what happened.
    const failures: string[] = []
    if (inboundRes && !inboundRes.ok)   failures.push(`inbound: ${await inboundRes.text()}`)
    if (outboundRes && !outboundRes.ok) failures.push(`outbound: ${await outboundRes.text()}`)

    if (failures.length) {
      const deleted = rows.length
        - (inboundRes && !inboundRes.ok ? inboundIds.length : 0)
        - (outboundRes && !outboundRes.ok ? outboundIds.length : 0)
      return NextResponse.json({ error: failures.join('; '), deleted, partial: deleted > 0 }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted: rows.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
