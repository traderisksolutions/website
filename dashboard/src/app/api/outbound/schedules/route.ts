import { NextRequest, NextResponse } from 'next/server'

const SB = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function h(extra: Record<string, string> = {}) {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', ...extra }
}

// GET — list all schedules
export async function GET() {
  const res = await fetch(
    `${SB}/rest/v1/outbound_schedules?select=*&order=created_at.desc`,
    { headers: h(), cache: 'no-store' }
  )
  return NextResponse.json(await res.json())
}

// POST — create a schedule
export async function POST(req: NextRequest) {
  const body = await req.json()
  const row = {
    query:         body.query,
    roles:         body.roles        ?? ['CEO', 'CTO', 'Founder'],
    max_companies: body.maxCompanies ?? 8,
    frequency:     body.frequency    ?? 'daily',
    is_active:     true,
    next_run_at:   new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  }
  const res = await fetch(`${SB}/rest/v1/outbound_schedules`, {
    method: 'POST',
    headers: h({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  return NextResponse.json(await res.json())
}

// PATCH — toggle is_active
export async function PATCH(req: NextRequest) {
  const { id, is_active } = await req.json()
  await fetch(`${SB}/rest/v1/outbound_schedules?id=eq.${id}`, {
    method: 'PATCH',
    headers: h({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ is_active }),
  })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a schedule
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await fetch(`${SB}/rest/v1/outbound_schedules?id=eq.${id}`, {
    method: 'DELETE', headers: h(),
  })
  return NextResponse.json({ ok: true })
}
