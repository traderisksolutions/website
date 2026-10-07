/**
 * GET  /api/group-benefits/quote        → list saved quotations
 * POST /api/group-benefits/quote        → compute a census across selected approved tables,
 *                                          save the quotation + flattened lines, return results.
 *   body: { company_name?, effective_date, gst_rate?, products[], rate_table_ids[],
 *           category_map, census[], source? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { createQuotation, QuotationInputError, type QuotationInput } from '@/lib/gb/quotation'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://trs-api-335840130686.asia-southeast1.run.app'
function sbH(prefer = 'return=minimal') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}
async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    if (!await requireUser()) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const res = await fetch(`${SB_URL}/rest/v1/gb_quotations?select=id,company_name,effective_date,product_codes,member_count,results,source,created_at&order=created_at.desc&limit=100`, { headers: sbH(), cache: 'no-store' })
    return NextResponse.json(res.ok ? await res.json() : [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as QuotationInput
    const { quotationId, result } = await createQuotation(body, user.id)

    void logActivity({ action: 'gb.quote_generated', resource_type: 'gb_quotation', resource_id: quotationId ?? undefined, new_value: { company: body.company_name, members: body.census?.length ?? 0, insurers: body.rate_table_ids?.length ?? 0 } })
    return NextResponse.json({ quotation_id: quotationId, ...result })
  } catch (e) {
    if (e instanceof QuotationInputError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
