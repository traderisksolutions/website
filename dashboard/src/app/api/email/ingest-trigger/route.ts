import { NextResponse } from 'next/server'

// Called by the Refresh button in the engagement panel.
// Protected by the Supabase auth middleware — no additional auth required.
// Makes a server-side call to /api/email/ingest with CRON_SECRET so the
// client never needs access to the secret directly.

export const maxDuration = 60

export async function POST() {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    const res = await fetch(`${origin}/api/email/ingest`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    })
    const data = res.ok ? await res.json() : { error: await res.text() }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
