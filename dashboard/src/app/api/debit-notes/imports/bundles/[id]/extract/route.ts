/**
 * POST /api/debit-notes/imports/bundles/[id]/extract
 * Runs the extraction on every member file (src/lib/debit-notes/extract-bundle.ts) and parks the
 * bundle at needs_review, or error when every file failed, for a person to confirm. Idempotent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractBundle } from '@/lib/debit-notes/extract-bundle'

export const maxDuration = 180

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const r = await extractBundle(id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, merged: r.merged, warning: r.warning, suggestedCompanyId: r.suggestedCompanyId, matchConfidence: r.matchConfidence })
}
