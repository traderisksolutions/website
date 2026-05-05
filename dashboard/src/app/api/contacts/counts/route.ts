import { NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:        k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
  }
}

type StageRow = { engagement_stage: string | null }

export async function GET() {
  const zero = { engaged: 0, qualified: 0, proposal: 0, converted: 0 }
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/contacts?select=engagement_stage&engagement_stage=not.is.null`,
      { headers: sbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json(zero)

    const rows: StageRow[] = await res.json()
    if (!Array.isArray(rows)) return NextResponse.json(zero)

    const counts = { ...zero }
    for (const row of rows) {
      const s = row.engagement_stage
      if (s === 'engaged' || s === 'qualified' || s === 'proposal' || s === 'converted') {
        counts[s]++
      }
    }
    return NextResponse.json(counts)
  } catch {
    return NextResponse.json(zero)
  }
}
