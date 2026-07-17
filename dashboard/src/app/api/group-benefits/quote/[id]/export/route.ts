/**
 * GET /api/group-benefits/quote/[id]/export?insurer=<name>&format=xlsx|csv
 * Builds a per-insurer quote file (one insurer per file) as a download. Numbers come
 * straight from the saved quotation + lines — nothing is recomputed here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { buildExportData, buildInsurerCsv, buildInsurerXlsx, safeFileStem } from '@/lib/gb-export'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const insurer = req.nextUrl.searchParams.get('insurer')
    const format  = (req.nextUrl.searchParams.get('format') ?? 'xlsx').toLowerCase()
    if (!insurer) return NextResponse.json({ error: 'insurer required' }, { status: 400 })

    const data = await buildExportData(id, insurer)
    if (!data) return NextResponse.json({ error: 'No lines for that insurer' }, { status: 404 })

    const stem = safeFileStem(data)
    if (format === 'csv') {
      return new NextResponse(buildInsurerCsv(data), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${stem}.csv"` },
      })
    }
    const buf = await buildInsurerXlsx(data)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${stem}.xlsx"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
