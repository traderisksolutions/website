/** POST /api/debit-notes/imports/[id]/reject — marks a staged import rejected; kept for audit. */
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

    const res = await fetch(`${SB_URL}/rest/v1/pdf_import_items?id=eq.${id}`, { method: 'PATCH', headers: sbH(), body: JSON.stringify({ status: 'rejected' }) })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 })
    void logActivity({ action: 'pdf_import.rejected', resource_type: 'pdf_import_item', resource_id: id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
