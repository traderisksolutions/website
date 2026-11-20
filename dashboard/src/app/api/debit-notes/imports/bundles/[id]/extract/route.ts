/**
 * POST /api/debit-notes/imports/bundles/[id]/extract
 * Runs the extraction on every member file (src/lib/debit-notes/extract-bundle.ts) and parks the
 * bundle at needs_review, or error when every file failed, for a person to confirm. Idempotent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { extractBundle } from '@/lib/debit-notes/extract-bundle'
import { withStaff } from '@/lib/auth/guard'

export const maxDuration = 180

export const POST = withStaff(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const r = await extractBundle(id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, merged: r.merged, warning: r.warning, suggestedCompanyId: r.suggestedCompanyId, matchConfidence: r.matchConfidence })
}, { error: 'Not authenticated' })
