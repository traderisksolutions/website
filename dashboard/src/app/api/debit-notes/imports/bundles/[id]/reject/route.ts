/** POST /api/debit-notes/imports/bundles/[id]/reject — marks a staged bundle rejected; kept for audit. */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH }               from '@/lib/debit-note-storage'
import { logActivity }               from '@/lib/log-activity'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/debit_note_bundles?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'rejected' }) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    void logActivity({ action: 'debit_note_bundle.rejected', resource_type: 'debit_note_bundle', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
