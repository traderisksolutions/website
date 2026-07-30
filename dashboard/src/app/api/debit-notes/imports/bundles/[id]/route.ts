/**
 * PATCH /api/debit-notes/imports/bundles/[id]  { merged: Partial<ExtractedDebitNote> }
 * "Save draft" — persists the reviewer's in-progress edits back onto the bundle without
 * approving it, so correcting a multi-field mismatch (e.g. the policy-number discrepancy) can
 * be done in stages without losing work if the page is left or refreshed. Status stays
 * `needs_review` — this never creates a debit note.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import type { ExtractedDebitNote }   from '@/lib/debit-note-extract'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { merged } = await req.json() as { merged?: Partial<ExtractedDebitNote> }
    if (!merged) return NextResponse.json({ error: 'merged required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, {
      method: 'PATCH', headers: sbH(), body: JSON.stringify({ merged }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
