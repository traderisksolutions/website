/** GET /api/group-benefits/folder → { url } of the Drive folder holding insurer brochures, calculators and TRS workbooks. */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { ebSourceFolderUrl } from '@/lib/company-drive'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const url = ebSourceFolderUrl()
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: 'GOOGLE_TRS_DRIVE_FOLDER_ID is not set' }, { status: 503 })
}
