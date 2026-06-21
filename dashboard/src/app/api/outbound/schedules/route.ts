import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

// GET — list all schedules
export async function GET() {
  const res = await fetch(
    `${SB_URL}/rest/v1/outbound_schedules?select=*&deleted_at=is.null&order=created_at.desc`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  return NextResponse.json(await res.json())
}

// POST — create a schedule
// Body: { sector, locations, headcount_ranges, product_type, frequency }
// These match the apollo-search params so the cron can call it directly.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const row = {
    sector:           body.sector           ?? body.query ?? '',
    locations:        body.locations        ?? ['Singapore'],
    headcount_ranges: body.headcount_ranges ?? [],
    product_type:     body.product_type     ?? 'General',
    frequency:        body.frequency        ?? 'daily',
    is_active:        true,
    next_run_at:      new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  }
  const res = await fetch(`${SB_URL}/rest/v1/outbound_schedules`, {
    method:  'POST',
    headers: sbHeaders('return=representation'),
    body:    JSON.stringify(row),
  })
  return NextResponse.json(await res.json())
}

// PATCH — update schedule (toggle is_active, change next_run_at, etc.)
export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await fetch(`${SB_URL}/rest/v1/outbound_schedules?id=eq.${id}`, {
    method:  'PATCH',
    headers: sbHeaders(),
    body:    JSON.stringify(updates),
  })
  return NextResponse.json({ ok: true })
}

// DELETE — soft-delete a schedule
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await fetch(`${SB_URL}/rest/v1/outbound_schedules?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(),
    body:   JSON.stringify({ deleted_at: new Date().toISOString() }),
  })
  return NextResponse.json({ ok: true })
}
