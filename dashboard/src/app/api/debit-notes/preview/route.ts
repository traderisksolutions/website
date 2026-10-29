/**
 * POST /api/debit-notes/preview { data } → the debit note PDF for the form's current values.
 * Rendered by the same server function that writes the real file on Approve, so the preview is
 * the document. Nothing is saved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderDebitNotePdf } from '@/lib/debit-note-pdf-server'
import type { DebitNotePdfData } from '@/lib/debit-note-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const b = await req.json().catch(() => null) as { data?: DebitNotePdfData } | null
  const d = b?.data
  if (!d || typeof d !== 'object' || !Array.isArray(d.lineItems)) return NextResponse.json({ error: 'Debit note data is missing' }, { status: 400 })
  try {
    const pdf = await renderDebitNotePdf(d)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[debit-notes/preview]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Preview failed' }, { status: 500 })
  }
}
