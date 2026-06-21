import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'
const ALERT_TO        = 'developer@trade-risksol.com'

// ── Supabase ──────────────────────────────────────────────────────────────────

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY!
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
}

async function readConfig(key: string): Promise<string | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/system_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0]?.value ? String(rows[0].value) : null
}

async function writeConfig(key: string, value: string) {
  const current = await readConfig(key)
  const url    = current !== null
    ? `${SB_URL}/rest/v1/system_config?key=eq.${encodeURIComponent(key)}`
    : `${SB_URL}/rest/v1/system_config`
  await fetch(url, {
    method:  current !== null ? 'PATCH' : 'POST',
    headers: sbHeaders(),
    body:    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  })
}

// ── Gmail OAuth ───────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth failed: ${data.error ?? JSON.stringify(data)}`)
  return data.access_token as string
}

// ── Gmail watch ───────────────────────────────────────────────────────────────

async function renewWatch(token: string): Promise<{ historyId: string; expiration: string }> {
  const res = await fetch(`${GMAIL_API}/watch`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      topicName:           process.env.GMAIL_PUBSUB_TOPIC!,
      labelIds:            ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail watch API error ${res.status}: ${JSON.stringify(data)}`)
  if (!data.expiration || !data.historyId) throw new Error(`Unexpected watch response: ${JSON.stringify(data)}`)
  return { historyId: String(data.historyId), expiration: String(data.expiration) }
}

// ── Alert email via Gmail ─────────────────────────────────────────────────────

function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

async function sendAlert(token: string, subject: string, body: string): Promise<void> {
  const raw = [
    `To: ${ALERT_TO}`,
    `Subject: ${encodeSubject(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')

  await fetch(`${GMAIL_API}/messages/send`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
  })
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 2000
): Promise<{ result: T; attempt: number } | { error: string }> {
  let lastError = ''
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await fn()
      return { result, attempt: i }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.error(`[gmail-watch] attempt ${i}/${attempts} failed:`, lastError)
      if (i < attempts) await new Promise(r => setTimeout(r, baseDelayMs * i))
    }
  }
  return { error: lastError }
}

// ── Handler ───────────────────────────────────────────────────────────────────

// GET /api/cron/gmail-watch
// • Vercel cron: runs every 6 days (Authorization: Bearer CRON_SECRET)
// • Manual trigger: ?token=CRON_SECRET or ?token=GMAIL_PUBSUB_VERIFICATION_TOKEN
// • Force renewal regardless of expiry: &force=1
export async function GET(req: NextRequest) {
  const secret      = process.env.CRON_SECRET                     ?? ''
  const pubsubToken = process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN ?? ''
  const qToken      = req.nextUrl.searchParams.get('token')       ?? ''
  const bearerOk    = req.headers.get('authorization') === `Bearer ${secret}`
  const tokenOk     = (qToken === secret && secret !== '') || (qToken === pubsubToken && pubsubToken !== '')
  if (!bearerOk && !tokenOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const forced = req.nextUrl.searchParams.get('force') === '1'
  const now    = Date.now()

  // ── 1. Get access token ────────────────────────────────────────────────────
  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[gmail-watch] OAuth failed:', msg)
    return NextResponse.json({ error: `OAuth failed: ${msg}` }, { status: 500 })
  }

  // ── 2. Check current expiration ────────────────────────────────────────────
  const storedExpiry    = await readConfig('gmail_watch_expiration')
  const expiryMs        = storedExpiry ? parseInt(storedExpiry) : 0
  const msUntilExpiry   = expiryMs - now
  const hoursRemaining  = msUntilExpiry / 3_600_000
  const expiresAt       = expiryMs > 0 ? new Date(expiryMs).toISOString() : 'unknown'

  console.log(`[gmail-watch] current expiry: ${expiresAt} (${hoursRemaining.toFixed(1)}h remaining)`)

  // Skip if still healthy and not forced
  if (!forced && msUntilExpiry > 24 * 3_600_000) {
    return NextResponse.json({ ok: true, skipped: true, expiresAt, hoursRemaining: Math.round(hoursRemaining) })
  }

  // Warn if imminent (< 24h left) but renewal has not yet failed
  if (msUntilExpiry > 0 && msUntilExpiry < 24 * 3_600_000) {
    console.warn(`[gmail-watch] ⚠ Watch expires in ${hoursRemaining.toFixed(1)}h — renewing now`)
    sendAlert(token,
      '[TRS Alert] Gmail watch expiring soon — renewing',
      `The Gmail push notification watch expires in ${hoursRemaining.toFixed(1)} hours.\n\nRenewal is running now. You will only receive another alert if renewal fails.\n\nTimestamp: ${new Date().toISOString()}`
    ).catch(e => console.error('[gmail-watch] warning alert failed:', e))
  }

  // ── 3. Renew with retry ────────────────────────────────────────────────────
  const outcome = await withRetry(() => renewWatch(token), 3, 2000)

  if ('error' in outcome) {
    // All 3 attempts failed — send failure alert
    const alertBody = [
      '🚨 Gmail Watch Renewal FAILED — emails may stop ingesting',
      '',
      `All 3 renewal attempts failed at ${new Date().toISOString()}.`,
      `Last error: ${outcome.error}`,
      '',
      'IMPACT: New emails will NOT be pushed in real-time.',
      'The daily 9am SGT cron will still ingest, but with up to 24h delay.',
      '',
      'ACTION REQUIRED — manually trigger renewal:',
      `https://trs-dashboard-pi.vercel.app/api/cron/gmail-watch?token=${pubsubToken}`,
      '',
      'If this keeps failing, check in Vercel Environment Variables:',
      '  • GMAIL_CLIENT_ID',
      '  • GMAIL_CLIENT_SECRET',
      '  • GMAIL_REFRESH_TOKEN',
      '  • GMAIL_PUBSUB_TOPIC',
    ].join('\n')

    console.error('[gmail-watch] 🚨 all retries failed, sending alert')
    await sendAlert(token, '🚨 [TRS URGENT] Gmail watch renewal failed', alertBody)
      .catch(e => console.error('[gmail-watch] failure alert email failed:', e))

    return NextResponse.json({ error: 'Watch renewal failed after 3 attempts', lastError: outcome.error }, { status: 500 })
  }

  // ── 4. Persist new expiration + historyId ─────────────────────────────────
  const { result } = outcome
  const newExpiresAt = new Date(parseInt(result.expiration)).toISOString()

  await Promise.allSettled([
    writeConfig('gmail_watch_expiration', result.expiration),
    writeConfig('gmail_history_id',       result.historyId),
  ])

  console.log(`[gmail-watch] ✓ renewed on attempt ${outcome.attempt}, expires: ${newExpiresAt}`)
  return NextResponse.json({
    ok:        true,
    attempt:   outcome.attempt,
    historyId: result.historyId,
    expiresAt: newExpiresAt,
  })
}
