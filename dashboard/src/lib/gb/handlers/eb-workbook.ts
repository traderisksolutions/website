/**
 * The house workbook (src/lib/gb/workbook.ts).
 *
 * GET  → { file }   the saved copy: name, Drive id, Drive modifiedTime, import time
 * POST → { file }   a person's Reload workbook: re-imports the newest TRS EB Calculator from Drive
 *
 * A person only; no model is called.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { errorResponse, fail, gate } from '@/lib/placement/api'
import { importWorkbook, loadWorkbook } from '@/lib/gb/workbook'
import { logActivity } from '@/lib/log-activity'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const { unauthorized } = await gate(req)
  if (unauthorized) return unauthorized
  try {
    const wb = await loadWorkbook()
    return NextResponse.json({ file: wb?.file ?? null })
  } catch (e) { return errorResponse(e) }
}

export async function POST(req: NextRequest) {
  const { unauthorized, actor } = await gate(req)
  if (unauthorized) return unauthorized
  if (actor === 'system') return fail('Sign in first.', 401)
  try {
    const wb = await importWorkbook()
    void logActivity({ action: 'gb.workbook_reloaded', resource_type: 'app_settings', resource_id: 'gb_workbook', new_value: { name: wb.file.name, modifiedAt: wb.file.modifiedAt }, metadata: { by: actor } })
    return NextResponse.json({ file: wb.file })
  } catch (e) { return errorResponse(e) }
}
