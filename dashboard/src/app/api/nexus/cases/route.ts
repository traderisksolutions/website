import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: prefer }
}

// GET /api/nexus/cases — list all cases with thread count + last activity
export async function GET() {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/cases?order=updated_at.desc&select=*`,
      { headers: sbHeaders() }
    )
    const cases = res.ok ? await res.json() : []
    if (!Array.isArray(cases)) return NextResponse.json([])

    // Enrich with thread count + last activity in parallel
    const enriched = await Promise.all(cases.map(async (c: { id: string }) => {
      const ctRes = await fetch(
        `${SB_URL}/rest/v1/case_threads?case_id=eq.${c.id}&select=thread_id`,
        { headers: sbHeaders() }
      )
      const ctRows: { thread_id: string }[] = ctRes.ok ? await ctRes.json() : []
      const threadIds = Array.isArray(ctRows) ? ctRows.map(r => r.thread_id) : []

      let last_activity: string | null = null
      if (threadIds.length > 0) {
        const tRes = await fetch(
          `${SB_URL}/rest/v1/email_threads?id=in.(${threadIds.join(',')})&select=last_message_at&order=last_message_at.desc&limit=1`,
          { headers: sbHeaders() }
        )
        const tRows: { last_message_at: string | null }[] = tRes.ok ? await tRes.json() : []
        last_activity = Array.isArray(tRows) && tRows[0] ? tRows[0].last_message_at : null
      }

      return { ...c, thread_count: threadIds.length, last_activity }
    }))

    return NextResponse.json(enriched)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/nexus/cases — create a new case
export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json() as { name: string; description?: string }
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const res = await fetch(`${SB_URL}/rest/v1/cases`, {
      method:  'POST',
      headers: sbHeaders('return=representation'),
      body:    JSON.stringify({ name: name.trim(), description: description?.trim() ?? null, status: 'open' }),
    })
    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status })
    const rows = await res.json()
    return NextResponse.json(Array.isArray(rows) ? rows[0] : rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
