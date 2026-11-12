/**
 * GET /api/group-benefits/brochures
 * → the brochure and rate file each priced product is read from, newest plan year per product, with
 *   its Drive link: the five products of the house comparison (RCC Enhanced III, Income FlexCare,
 *   Steadfast MCare+, Singlife MyBenefits Plus, AIA Flexi Vital Care Plus). From the Pricing Matrix
 *   Drive folder (insurer / plan year / file); a new file dropped there appears here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffOrCron } from '@/lib/api-auth'
import { driveConfigured, listSourceFiles, type SourceFile } from '@/lib/gb/drive'
import { brochureRows, type BrochureRow } from '@/lib/gb/brochures'

let cache: { at: number; rows: BrochureRow[] } | null = null

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized
  if (!driveConfigured()) return NextResponse.json({ rows: [], configured: false })
  if (cache && Date.now() - cache.at < 10 * 60_000) return NextResponse.json({ rows: cache.rows, configured: true })
  try {
    const files: SourceFile[] = await listSourceFiles()
    cache = { at: Date.now(), rows: brochureRows(files) }
    return NextResponse.json({ rows: cache.rows, configured: true })
  } catch (e) {
    return NextResponse.json({ rows: [], error: e instanceof Error ? e.message : 'Drive could not be read' }, { status: 502 })
  }
}
