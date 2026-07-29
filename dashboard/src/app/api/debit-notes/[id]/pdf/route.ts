/**
 * GET /api/debit-notes/[id]/pdf → redirects to a short-lived signed URL for the stored PDF.
 * Used directly as a link/download href from the Debit Note list, detail drawer, and Calendar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { SB_URL, sbH, signRead }     from '@/lib/debit-note-storage'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${SB_URL}/rest/v1/debit_notes?id=eq.${id}&select=pdf_storage_url&limit=1`, { headers: sbH(), cache: 'no-store' })
    const row = res.ok ? (await res.json())[0] : null
    if (!row?.pdf_storage_url) return NextResponse.json({ error: 'PDF not available' }, { status: 404 })

    const url = await signRead(row.pdf_storage_url)
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
