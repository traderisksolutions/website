/**
 * GET /api/group-benefits/quote/[id]  → a saved quotation (inputs + computed results +
 * stored benefit analysis) plus its flattened per-member lines, for the detail view.
 */
import { fetchAllRows } from '@/lib/postgrest-all'
import { NextRequest, NextResponse } from 'next/server'
import { SB_URL } from '@/lib/sb'
import { withStaff } from '@/lib/auth/guard'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export const GET = withStaff(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  try {
    const [qRes, lines] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetchAllRows(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${id}&select=*&order=member_index,insurer_name,product_code`, sbH()),
    ])
    const quotation = qRes.ok ? (await qRes.json())[0] : null
    if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ quotation, lines })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}, { error: 'Not authenticated' })
