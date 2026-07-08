/**
 * POST /api/nexus/rfq/quotes   Body: { case_id }
 *
 * Quote comparison for a case. Reads persisted rfq_quotes; for any replied insurer
 * that has no quote yet (or a race with attachment parsing), extracts + persists on
 * the fly via the shared lib. Returns quotes with verbatim figures + evidence.
 */
import { NextRequest, NextResponse } from 'next/server'
import { productLineLabel }          from '@/lib/product-lines'
import { extractAndStoreQuote }      from '@/lib/rfq-quote-extract'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function POST(req: NextRequest) {
  try {
    const { case_id } = await req.json() as { case_id?: string }
    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 })

    // Replied dispatches on this case (via its request lines).
    const rRes = await fetch(`${SB_URL}/rest/v1/rfq_requests?case_id=eq.${case_id}&select=id`, { headers: sbH(), cache: 'no-store' })
    const reqIds = (rRes.ok ? await rRes.json() : []).map((r: { id: string }) => r.id)
    if (reqIds.length === 0) return NextResponse.json([])

    const dRes = await fetch(
      `${SB_URL}/rest/v1/rfq_dispatches?rfq_request_id=in.(${reqIds.join(',')})&status=eq.replied&thread_id=not.is.null&select=id,insurer_name,product_line`,
      { headers: sbH(), cache: 'no-store' }
    )
    const dispatches: { id: string; insurer_name: string | null; product_line: string | null }[] = dRes.ok ? await dRes.json() : []
    if (dispatches.length === 0) return NextResponse.json([])

    // Existing persisted quotes (fallback if a fresh extraction has nothing to read).
    const qRes = await fetch(`${SB_URL}/rest/v1/rfq_quotes?case_id=eq.${case_id}&select=*`, { headers: sbH(), cache: 'no-store' })
    const existing: Record<string, Record<string, unknown>> = {}
    for (const q of (qRes.ok ? await qRes.json() : [])) existing[q.dispatch_id as string] = q

    // "Compare" is a deliberate refresh: re-extract each replied insurer (upsert),
    // so figures added in attachments parsed after ingest are picked up.
    const quotes = await Promise.all(dispatches.map(async d => {
      await extractAndStoreQuote(d.id).catch(() => null)
      const rr = await fetch(`${SB_URL}/rest/v1/rfq_quotes?dispatch_id=eq.${d.id}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' })
      const q  = (rr.ok ? (await rr.json())[0] : undefined) ?? existing[d.id]
      return {
        dispatch_id:     d.id,
        insurer_name:    d.insurer_name ?? 'Insurer',
        product_line:    productLineLabel(d.product_line ?? ''),
        premium:         (q?.premium as string) ?? null,
        excess:          (q?.excess as string) ?? null,
        limit_indemnity: (q?.limit_indemnity as string) ?? null,
        validity:        (q?.validity as string) ?? null,
        key_terms:       (q?.key_terms as string[]) ?? [],
        exclusions:      (q?.exclusions as string[]) ?? [],
        summary:         (q?.summary as string) ?? null,
        evidence:        (q?.evidence as Record<string, { excerpt: string | null; source: string | null }>) ?? {},
        primary_source:  (q?.primary_source as string) ?? null,
      }
    }))

    return NextResponse.json(quotes)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
