import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }                 from '@vercel/functions'

// Called by the Refresh button and the 3-minute background sync.
// Protected by the Supabase auth middleware — no CRON_SECRET exposed to client.
//
// Uses the request's own Host header for URL resolution — always correct
// regardless of VERCEL_URL (which is deployment-specific and changes per deploy).

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })

  const host   = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto  = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${proto}://${host}`

  // Silently check/renew Gmail watch in the background on every trigger.
  // The gmail-watch route skips renewal if the watch has > 24h remaining,
  // so this is cheap. Keeps Pub/Sub alive even if the 6-day cron misses a run.
  waitUntil(
    fetch(`${origin}/api/cron/gmail-watch`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    }).catch(() => {})
  )

  try {
    // window=60 → Gmail date-search for last 60 min, bypasses History API.
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
