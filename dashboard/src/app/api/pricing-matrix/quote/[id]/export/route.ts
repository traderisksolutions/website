/**
 * GET /api/pricing-matrix/quote/[id]/export?insurer=<calculator_id>&format=csv
 * Downloads a per-insurer CSV built from the stored quote results (numbers copied, not recomputed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/pm-storage'
import { buildInsurerCsv }           from '@/lib/pm-export'
import type { QuoteRow }             from '@/lib/pm-export'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const insurer = req.nextUrl.searchParams.get('insurer')
    if (!insurer) return NextResponse.json({ error: 'insurer (calculator_id) required' }, { status: 400 })

    const row = await fetch(`${SB_URL}/rest/v1/pm_quotations?id=eq.${id}&select=company_name,effective_date,census,selections,results&limit=1`, { headers: sbH(), cache: 'no-store' })
      .then(r => (r.ok ? r.json() : [])).then(rows => rows[0] ?? null) as QuoteRow | null
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { filename, csv } = buildInsurerCsv(row, insurer)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
