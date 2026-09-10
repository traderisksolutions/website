import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders }         from '@/lib/sb'
import { requireStaffOrCron }        from '@/lib/api-auth'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/contacts/[id]   { notes: string }
// Staff-editable notes layer for the Engagement customer profile (see
// src/lib/customer-profile.ts) — auto-saved from EngagementProfileTab's notes editor.
export async function PATCH(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const { notes } = await req.json() as { notes?: string }
    if (notes === undefined) return NextResponse.json({ error: 'notes required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${id}`, {
      method: 'PATCH', headers: sbHeaders('return=minimal'),
      body: JSON.stringify({ notes, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
