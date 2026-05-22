import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

// GET /api/cron/gmail-watch
// Called by Vercel cron every 6 days to renew the Gmail Pub/Sub watch
// (watch expires after 7 days — renew early to avoid gaps)
// Also call this manually once during initial setup.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
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

  // Seed the historyId into system_config so the ingest History API starts from the right point
  if (result.historyId) {
    const existing = await fetch(
      `${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id&select=key&limit=1`,
      { headers: sbHeaders() }
    )
    const rows  = existing.ok ? await existing.json() : []
    const hasRow = Array.isArray(rows) && rows.length > 0
    await fetch(
      hasRow ? `${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id` : `${SB_URL}/rest/v1/system_config`,
      {
        method:  hasRow ? 'PATCH' : 'POST',
        headers: sbHeaders(),
        body:    JSON.stringify({ key: 'gmail_history_id', value: String(result.historyId), updated_at: new Date().toISOString() }),
      }
    )
    console.log('[gmail-watch] historyId seeded:', result.historyId)
  }

  console.log('[gmail-watch] renewed, expires:', result.expiration)
  return NextResponse.json({ ok: true, historyId: result.historyId, expiration: result.expiration })
}
