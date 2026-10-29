/**
 * POST /api/group-benefits/rate-tables/[id]/calculator/upload-url  { filename, size? } → { uploadUrl }
 * Opens a Drive resumable upload (group-benefits/calculators/<YYYY-MM>/) for the insurer's .xlsx
 * calculator, so the browser uploads directly (past Vercel's ~4.5 MB body limit). The browser PUTs
 * the file to uploadUrl, Google answers { id }, and the caller posts storage_path 'drivefile:<id>'
 * to ../calculator.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { openDriveUpload }           from '@/lib/storage/drive-upload'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { filename, size } = await req.json().catch(() => ({})) as { filename?: string; size?: number }
    const uploadUrl = await openDriveUpload({
      folder: 'group-benefits/calculators', filename: `${id} ${filename || 'calculator.xlsx'}`, mimeType: XLSX_MIME, size,
      origin: req.headers.get('origin') ?? new URL(req.url).origin,
    })
    return NextResponse.json({ uploadUrl })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
