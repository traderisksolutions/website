import { NextRequest, NextResponse } from 'next/server'

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TRS_DOMAIN      = 'trade-risksol.com'

function sbHeaders(prefer = 'return=representation') {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return {
    apikey:         k,
    Authorization:  `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer:         prefer,
  }
}

const isInternal  = (e: string) => e.toLowerCase().endsWith(`@${TRS_DOMAIN}`)
const isAutomated = (e: string) => {
  const l = e.toLowerCase()
  return l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') ||
         l.includes('mailer-daemon') || l.includes('postmaster')
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Gmail access token')
  return data.access_token
}

async function fetchGmailMessage(token: string, messageId: string) {
  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok ? await res.json() : null
}

function headerVal(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBody(parts: { mimeType: string; body: { data?: string }; parts?: unknown[] }[]): string {
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8')
    }
    if (part.parts) {
      const nested = decodeBody(part.parts as typeof parts)
      if (nested) return nested
    }
  }
  return ''
}

function splitDisplayName(name: string | null): { first_name: string | null; last_name: string | null } {
  if (!name?.trim()) return { first_name: null, last_name: null }
  const parts = name.trim().split(/\s+/)
  return { first_name: parts[0] || null, last_name: parts.length > 1 ? parts.slice(1).join(' ') : null }
}

function parseAddresses(raw: string): { email: string; name: string | null }[] {
  if (!raw.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(addr => {
    const m     = addr.match(/<(.+?)>/)
    const email = m ? m[1].trim() : addr.trim()
    const name  = addr.includes('<') ? addr.split('<')[0].trim().replace(/^"|"$/g, '') : null
    return { email, name }
  })
}

// Read the last stored Gmail history ID from DB
async function getStoredHistoryId(): Promise<string> {
  const res = await fetch(
    `${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id&select=value&limit=1`,
    { headers: sbHeaders('return=representation') }
  )
  const rows = res.ok ? await res.json() : []
  return Array.isArray(rows) && rows[0]?.value ? rows[0].value : '0'
}

// Persist the new history ID so next webhook knows where to start
async function saveHistoryId(historyId: string) {
  await fetch(`${SB_URL}/rest/v1/system_config?key=eq.gmail_history_id`, {
    method:  'PATCH',
    headers: sbHeaders('return=minimal'),
    body:    JSON.stringify({ value: historyId, updated_at: new Date().toISOString() }),
  })
}

// Use Gmail History API to get only new message IDs since the last historyId.
// Falls back to fetching the 25 most recent INBOX messages if history is unavailable.
async function getNewMessageIds(token: string): Promise<string[]> {
  const storedId = await getStoredHistoryId()

  // If we have a valid stored ID, use the History API — processes only new messages
  if (storedId !== '0') {
    const histRes = await fetch(
      `${GMAIL_API}/history?startHistoryId=${storedId}&labelId=INBOX`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (histRes.ok) {
      const histData = await histRes.json()
      const ids = new Set<string>()
      for (const record of histData.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id)
        }
        // Also catch messages that had INBOX label added (forwarded/moved emails)
        for (const labeled of record.labelsAdded ?? []) {
          if (labeled.labelIds?.includes('INBOX') && labeled.message?.id) {
            ids.add(labeled.message.id)
          }
        }
      }
      if (ids.size > 0) {
        console.log('[ingest] history API: found', ids.size, 'new message(s)')
        return Array.from(ids)
      }
      console.log('[ingest] history API returned 0 new messages — using INBOX fallback')
    }
  }

  // Fallback: fetch recent INBOX messages (used on first run or if history is stale)
  console.log('[ingest] fallback: fetching recent INBOX messages')
  const listRes = await fetch(
    `${GMAIL_API}/messages?labelIds=INBOX&maxResults=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listData = listRes.ok ? await listRes.json() : {}
  return (listData.messages ?? []).map((m: { id: string }) => m.id)
}

// Core: ingest a single Gmail message into the database
async function ingestMessage(token: string, gmailMsgId: string) {
  const msg = await fetchGmailMessage(token, gmailMsgId)
  if (!msg) return

  const hdrs     = msg.payload?.headers ?? []
  const subject  = headerVal(hdrs, 'Subject')
  const fromRaw  = headerVal(hdrs, 'From')
  const toRaw    = headerVal(hdrs, 'To')
  const ccRaw    = headerVal(hdrs, 'Cc')
  const dateStr  = headerVal(hdrs, 'Date')
  const sentAt   = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
  const gmailThreadId = msg.threadId

  const fromEmail = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1]?.trim() ?? fromRaw.trim()
  const fromName  = fromRaw.includes('<') ? fromRaw.split('<')[0].trim().replace(/^"|"$/g, '') : null

  if (isAutomated(fromEmail)) {
    console.log('[ingest] skip automated:', fromEmail)
    return
  }

  const bodyText  = decodeBody(msg.payload?.parts ?? [msg.payload])
  const direction: 'inbound' | 'outbound' = isInternal(fromEmail) ? 'outbound' : 'inbound'

  // Identify the primary external (non-TRS) contact for this thread
  const toList  = parseAddresses(toRaw)
  const ccList  = parseAddresses(ccRaw)
  const allParticipants = [{ email: fromEmail, name: fromName }, ...toList, ...ccList]
  const externalParty   = allParticipants.find(p => !isInternal(p.email) && !isAutomated(p.email))

  if (!externalParty) {
    console.log('[ingest] skip internal-only message:', gmailMsgId)
    return
  }

  console.log('[ingest]', gmailMsgId, '|', direction, '|', externalParty.email)

  // 1. Upsert primary external contact using first_name/last_name (omit nulls to avoid overwriting existing names)
  const { first_name: pFirst, last_name: pLast } = splitDisplayName(externalParty.name)
  const primaryBody: Record<string, unknown> = { email: externalParty.email, source: 'email' }
  if (pFirst) primaryBody.first_name = pFirst
  if (pLast)  primaryBody.last_name  = pLast
  const contactUpsert = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
    method:  'POST',
    headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
    body:    JSON.stringify(primaryBody),
  })
  if (!contactUpsert.ok) console.error('[ingest] contact upsert failed:', await contactUpsert.text())
  const contactFetch = await fetch(
    `${SB_URL}/rest/v1/contacts?email=eq.${encodeURIComponent(externalParty.email)}&select=id&limit=1`,
    { headers: sbHeaders() }
  )
  const contactFetchRows = contactFetch.ok ? await contactFetch.json() : []
  const contactId = Array.isArray(contactFetchRows) && contactFetchRows[0]?.id ? contactFetchRows[0].id : null

  // 2. Upsert thread linked to external contact
  const threadUpsert = await fetch(`${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=merge-duplicates'),
    body:    JSON.stringify({
      gmail_thread_id: gmailThreadId,
      subject,
      snippet:         bodyText.slice(0, 200),
      last_message_at: sentAt,
      status:          'active',
      contact_id:      contactId,
    }),
  })
  if (!threadUpsert.ok) { console.error('[ingest] thread upsert failed:', await threadUpsert.text()); return }
  const threadRows = await threadUpsert.json()
  const thread     = Array.isArray(threadRows) ? threadRows[0] : threadRows
  if (!thread?.id) { console.error('[ingest] thread has no id'); return }

  // Ensure contact_id is set (merge-duplicates may have returned the old row without it)
  if (contactId && !thread.contact_id) {
    await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread.id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ contact_id: contactId }),
    })
  }

  // 3. Insert message (ON CONFLICT ignore = safe to re-run, returns empty if duplicate)
  const msgInsert = await fetch(`${SB_URL}/rest/v1/email_messages?on_conflict=gmail_message_id`, {
    method:  'POST',
    headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
    body:    JSON.stringify({
      thread_id:        thread.id,
      gmail_message_id: gmailMsgId,
      direction,
      from_address:     fromEmail,
      subject,
      body_text:        bodyText,
      sent_at:          sentAt,
      has_attachments:  (msg.payload?.parts ?? []).some((p: { filename?: string }) => p.filename && p.filename.length > 0),
    }),
  })
  if (!msgInsert.ok) { console.error('[ingest] message insert failed:', await msgInsert.text()); return }
  const msgRows = await msgInsert.json()
  const dbMsg   = Array.isArray(msgRows) ? msgRows[0] : msgRows
  if (!dbMsg?.id) return // already existed — no need to re-insert participants

  // 4. Insert participants (ON CONFLICT DO NOTHING via unique constraint)
  type P = { thread_id: string; message_id: string; email: string; name: string | null; role: string; contact_id: string | null }
  const participants: P[] = [
    { thread_id: thread.id, message_id: dbMsg.id, email: fromEmail, name: fromName, role: 'from',
      contact_id: !isInternal(fromEmail) ? contactId : null },
    ...toList.map(({ email, name }) => ({
      thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'to',
      contact_id: email === externalParty.email ? contactId : null,
    })),
    ...ccList.map(({ email, name }) => ({
      thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'cc',
      contact_id: email === externalParty.email ? contactId : null,
    })),
  ]
  await fetch(`${SB_URL}/rest/v1/email_participants?on_conflict=message_id,email,role`, {
    method:  'POST',
    headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
    body:    JSON.stringify(participants),
  })

  // 5. Upsert contacts for all other external participants (To + CC) to capture their names
  const otherExternal = allParticipants.filter(
    p => p.email !== externalParty.email && !isInternal(p.email) && !isAutomated(p.email)
  )
  await Promise.allSettled(otherExternal.map(async p => {
    const { first_name, last_name } = splitDisplayName(p.name)
    const body: Record<string, unknown> = { email: p.email, source: 'email' }
    if (first_name) body.first_name = first_name
    if (last_name)  body.last_name  = last_name
    const res = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
      method:  'POST',
      headers: sbHeaders('return=minimal,resolution=merge-duplicates'),
      body:    JSON.stringify(body),
    })
    if (!res.ok) console.error('[ingest] cc contact upsert failed for', p.email, ':', await res.text())
  }))

  // 6. Trigger AI summary as a separate serverless invocation (non-blocking)
  const appUrl = process.env.APP_URL ?? `https://${process.env.VERCEL_URL}`
  fetch(`${appUrl}/api/engagement/auto-summarize`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET ?? '' },
    body:    JSON.stringify({ thread_id: thread.id, message_id: dbMsg.id }),
  }).catch(e => console.error('[ingest] auto-summarize trigger failed:', e))
}

// POST /api/email/ingest — receives Gmail Pub/Sub push notifications
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-pubsub-secret')
  if (secret !== process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: { data?: string } }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const rawData = body?.message?.data
  if (!rawData) return NextResponse.json({ ok: true })

  let notification: { historyId?: string }
  try { notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8')) }
  catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }) }

  const { historyId } = notification
  if (!historyId) return NextResponse.json({ ok: true })

  try {
    const token      = await getAccessToken()
    const messageIds = await getNewMessageIds(token)
    console.log('[ingest] processing', messageIds.length, 'message(s)')

    // Process each new message
    await Promise.allSettled(messageIds.map(id => ingestMessage(token, id)))

    // Persist new historyId so next webhook only fetches newer messages
    await saveHistoryId(historyId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ingest] FATAL:', e)
    return NextResponse.json({ ok: true }) // always ack Pub/Sub
  }
}
