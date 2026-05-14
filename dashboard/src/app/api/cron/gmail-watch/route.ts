import { NextRequest, NextResponse } from 'next/server'

// GET /api/cron/gmail-watch
// Called by Vercel cron every 6 days to renew the Gmail Pub/Sub watch
// (watch expires after 7 days — renew early to avoid gaps)
// Also call this manually once during initial setup.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const { access_token } = await tokenRes.json()
  if (!access_token) return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 })

  const watchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName:  process.env.GMAIL_PUBSUB_TOPIC,  // e.g. "projects/your-project/topics/gmail-inbound-trs"
      labelIds:   ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    }),
  })

  const result = await watchRes.json()
  if (!watchRes.ok) return NextResponse.json({ error: result }, { status: 500 })

  return NextResponse.json({ ok: true, historyId: result.historyId, expiration: result.expiration })
}
