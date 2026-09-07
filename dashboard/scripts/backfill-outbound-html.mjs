#!/usr/bin/env node
/**
 * One-off backfill: email_messages.body_html is NULL for every outbound message sent before
 * the fix in src/app/api/email/send/route.ts and src/app/api/inbound/reply/route.ts (both
 * built the real HTML for Gmail but never persisted it — only a plain-text flattening). That
 * means anything with a table/rich formatting renders as flattened plain text in Engagement's
 * own thread view, even though the actual sent email (and the recipient's copy) was fine.
 *
 * The periodic Gmail ingest sync (src/app/api/email/ingest/route.ts) can't fix this on its
 * own — it inserts with resolution=ignore-duplicates, so a gmail_message_id that's already in
 * the table (which every affected row's is, recorded at send-time) is silently skipped, never
 * updated.
 *
 * Strategy: operations@trade-risksol.com is CC'd on every non-ops send (see FROM_EMAIL /
 * finalCc in email/send/route.ts), so its mailbox holds a copy of every outbound message
 * regardless of which address actually sent it — including ones sent from a personal employee
 * Gmail we have no stored token for. This script authenticates as ops (the same legacy shared
 * token email/ingest/route.ts already uses for full-content reads — note this is a different,
 * broader-scoped token than the service-account one email/send/route.ts uses just for sending),
 * searches ops's mailbox by the message's own rfc822_message_id (universal across mailboxes,
 * unlike Gmail's per-mailbox internal message id), and patches the real HTML back in.
 *
 * Usage:
 *   node scripts/backfill-outbound-html.mjs [--dry-run] [--limit=N]
 *
 * Env required (same names email/ingest/route.ts's getAccessToken() reads):
 *   SUPABASE_SERVICE_KEY
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN     — ops@trade-risksol.com's refresh token
 *
 * Safe to re-run: only ever touches rows still missing body_html, so an interrupted or
 * partially-failed run just picks up where it left off.
 */

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const args    = process.argv.slice(2)
const dryRun  = args.includes('--dry-run')
const limitArg = args.find(a => a.startsWith('--limit='))
const limit   = limitArg ? Number(limitArg.split('=')[1]) : 500

function requireEnv(name) {
  const v = process.env[name]
  if (!v) { console.error(`✗ ${name} is not set`); process.exit(1) }
  return v
}
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_KEY')
const GMAIL_CLIENT_ID      = requireEnv('GMAIL_CLIENT_ID')
const GMAIL_CLIENT_SECRET  = requireEnv('GMAIL_CLIENT_SECRET')
const GMAIL_REFRESH_TOKEN  = requireEnv('GMAIL_REFRESH_TOKEN')

function sbHeaders(prefer = 'return=representation') {
  return {
    apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json', Prefer: prefer,
  }
}

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Failed to get Gmail access token: ${JSON.stringify(data)}`)
  return data.access_token
}

// Recursive MIME walk — mirrors decodeHtml() in email/ingest/route.ts exactly, so a message
// that ingests correctly there extracts identically here.
function decodeHtml(parts) {
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.parts) {
      const nested = decodeHtml(part.parts)
      if (nested) return nested
    }
  }
  return ''
}

async function findOpsCopyByRfc822Id(token, rfc822MessageId) {
  const bare = rfc822MessageId.replace(/^<|>$/g, '')
  const res = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(`rfc822msgid:${bare}`)}&maxResults=1`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.messages?.[0]?.id ?? null
}

async function fetchMessageHtml(token, gmailMessageId) {
  const res = await fetch(`${GMAIL_API}/messages/${gmailMessageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const msg = await res.json()
  const parts = msg.payload?.parts ?? [msg.payload]
  return decodeHtml(parts) || null
}

async function main() {
  console.log(dryRun ? '── DRY RUN — no writes will be made ──' : '── Live run ──')

  const rowsRes = await fetch(
    `${SB_URL}/rest/v1/email_messages?direction=eq.outbound&body_html=is.null&select=id,gmail_message_id,rfc822_message_id,from_address,subject,sent_at&order=sent_at.asc&limit=${limit}`,
    { headers: sbHeaders() },
  )
  if (!rowsRes.ok) { console.error('✗ Could not load rows:', await rowsRes.text()); process.exit(1) }
  const rows = await rowsRes.json()
  console.log(`Found ${rows.length} outbound message(s) missing body_html (limit ${limit}).`)
  if (rows.length === 0) return

  const token = await getAccessToken()

  let fixed = 0, noRfc822 = 0, notFoundInOps = 0, noHtml = 0, errored = 0

  for (const row of rows) {
    const label = `${row.id} (${row.sent_at}) "${row.subject ?? ''}" from ${row.from_address}`
    try {
      if (!row.rfc822_message_id) { console.log(`  skip — no rfc822_message_id: ${label}`); noRfc822++; continue }

      const opsMsgId = await findOpsCopyByRfc822Id(token, row.rfc822_message_id)
      if (!opsMsgId) { console.log(`  skip — not found in ops mailbox: ${label}`); notFoundInOps++; continue }

      const html = await fetchMessageHtml(token, opsMsgId)
      if (!html) { console.log(`  skip — no HTML part on the message: ${label}`); noHtml++; continue }

      if (dryRun) {
        console.log(`  would fix: ${label} (${html.length} chars)`)
      } else {
        const patchRes = await fetch(`${SB_URL}/rest/v1/email_messages?id=eq.${row.id}`, {
          method: 'PATCH', headers: sbHeaders('return=minimal'),
          body: JSON.stringify({ body_html: html }),
        })
        if (!patchRes.ok) { console.error(`  ✗ patch failed for ${label}:`, await patchRes.text()); errored++; continue }
        console.log(`  ✓ fixed: ${label} (${html.length} chars)`)
      }
      fixed++
    } catch (e) {
      console.error(`  ✗ error on ${label}:`, e instanceof Error ? e.message : e)
      errored++
    }
    // Be polite to Gmail API quota — this is a one-off batch job, not latency-sensitive.
    await new Promise(r => setTimeout(r, 150))
  }

  console.log('──────────────────────────────────────')
  console.log(`${dryRun ? 'Would fix' : 'Fixed'}: ${fixed}`)
  console.log(`Skipped — no rfc822_message_id: ${noRfc822}`)
  console.log(`Skipped — not found in ops mailbox: ${notFoundInOps}`)
  console.log(`Skipped — no HTML part: ${noHtml}`)
  console.log(`Errored: ${errored}`)
}

main().catch(e => { console.error('✗ Fatal:', e); process.exit(1) })
