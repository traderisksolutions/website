import { NextRequest, NextResponse } from 'next/server'

// POST /api/engagement/refresh-summary
// Manually trigger AI analysis for a thread. Protected by Supabase middleware.
export async function POST(req: NextRequest) {
  let thread_id: string, message_id: string
  try {
    ;({ thread_id, message_id } = await req.json())
    if (!thread_id || !message_id) throw new Error('missing ids')
  } catch {
    return NextResponse.json({ error: 'thread_id and message_id required' }, { status: 400 })
  }

  const appUrl = process.env.APP_URL ?? `https://${process.env.VERCEL_URL}`
  try {
    const res = await fetch(`${appUrl}/api/engagement/auto-summarize`, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-internal-secret': process.env.CRON_SECRET ?? '',
      },
      body: JSON.stringify({ thread_id, message_id }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[refresh-summary] auto-summarize failed:', res.status, text)
      return NextResponse.json({ error: `Summarize failed: ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
