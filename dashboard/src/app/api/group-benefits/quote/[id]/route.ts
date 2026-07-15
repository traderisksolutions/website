/**
 * GET /api/group-benefits/quote/[id]  → a saved quotation (inputs + computed results +
 * stored benefit analysis) plus its flattened per-member lines, for the detail view.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [qRes, lRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/gb_quotations?id=eq.${id}&select=*&limit=1`, { headers: sbH(), cache: 'no-store' }),
      fetch(`${SB_URL}/rest/v1/gb_quote_lines?quotation_id=eq.${id}&select=*&order=member_index,insurer_name,product_code`, { headers: sbH(), cache: 'no-store' }),
    ])
    const quotation = qRes.ok ? (await qRes.json())[0] : null
    if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const lines = lRes.ok ? await lRes.json() : []
    return NextResponse.json({ quotation, lines })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
