/**
 * GET  /api/group-benefits/folder → { url } of the Drive folder holding insurer brochures, calculators and TRS workbooks.
 * POST { company_name } → { url } of <company>/Employment Benefits in the company Drive, created on first call.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { EB_SUBFOLDER, ebSourceFolderUrl, ensureCompanyFolder } from '@/lib/company-drive'

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const url = ebSourceFolderUrl()
  return url ? NextResponse.json({ url }) : NextResponse.json({ error: 'GOOGLE_TRS_DRIVE_FOLDER_ID is not set' }, { status: 503 })
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  const b = await req.json().catch(() => ({})) as { company_name?: string }
  const name = (b.company_name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  try {
    return NextResponse.json({ url: await ensureCompanyFolder(name, EB_SUBFOLDER) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Drive folder failed' }, { status: 500 })
  }
}
