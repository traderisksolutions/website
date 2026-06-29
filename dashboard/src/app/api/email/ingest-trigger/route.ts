import { NextRequest, NextResponse } from 'next/server'

// Called by the Refresh button in the engagement panel.
// Protected by the Supabase auth middleware — no additional auth required.
// Makes a server-side call to /api/email/ingest with CRON_SECRET so the
// client never needs access to the secret directly.
//
// Uses the request's own Host header for URL resolution — this is always
// the correct domain regardless of VERCEL_URL (which is deployment-specific).

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })

  // Derive origin from the incoming request — guaranteed to be the correct host
  const host   = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto  = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${proto}://${host}`

  try {
    // window=60 → pulls all Gmail INBOX messages from the last 60 minutes,
    // bypassing the History API. More reliable for manual refresh.
    const res = await fetch(`${origin}/api/email/ingest?window=60`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    })
    const data = res.ok ? await res.json() : { error: await res.text() }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
