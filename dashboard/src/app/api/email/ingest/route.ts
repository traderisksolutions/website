import { NextRequest, NextResponse } from 'next/server'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

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
  const res = await fetch(
    `${GMAIL_API}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
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

// POST /api/email/inbound — receives Gmail Pub/Sub push notifications
export async function POST(req: NextRequest) {
  // Validate token to reject forged webhooks
  const secret = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-pubsub-secret')
  if (secret !== process.env.GMAIL_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: { data?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Pub/Sub wraps the payload as base64-encoded JSON in message.data
  const rawData = body?.message?.data
  if (!rawData) return NextResponse.json({ ok: true }) // ack with no-op

  let notification: { emailAddress?: string; historyId?: string }
  try {
    notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8'))
  } catch {
    return NextResponse.json({ error: 'Bad notification payload' }, { status: 400 })
  }

  const { historyId } = notification
  if (!historyId) return NextResponse.json({ ok: true })

  try {
    const token = await getAccessToken()

    // startHistoryId is exclusive — subtract 1 so we include the change AT historyId
    const startId = Math.max(1, parseInt(historyId) - 1).toString()
    const histRes = await fetch(
      `${GMAIL_API}/history?startHistoryId=${startId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const histData = histRes.ok ? await histRes.json() : null
    const historyRecords: { messagesAdded?: { message: { id: string; threadId: string } }[] }[] =
      histData?.history ?? []

    for (const record of historyRecords) {
      for (const added of record.messagesAdded ?? []) {
        const { id: gmailMsgId, threadId: gmailThreadId } = added.message

        // Skip if already ingested
        const existsRes = await fetch(
          `${SB_URL}/rest/v1/email_messages?gmail_message_id=eq.${gmailMsgId}&select=id&limit=1`,
          { headers: sbHeaders('return=minimal') }
        )
        const exists = existsRes.ok ? await existsRes.json() : []
        if (Array.isArray(exists) && exists.length > 0) continue

        const msg = await fetchGmailMessage(token, gmailMsgId)
        if (!msg) continue

        const hdrs: { name: string; value: string }[] = msg.payload?.headers ?? []
        const subject    = headerVal(hdrs, 'Subject')
        const fromRaw    = headerVal(hdrs, 'From')   // "Name <email>" or "email"
        const toRaw      = headerVal(hdrs, 'To')
        const ccRaw      = headerVal(hdrs, 'Cc')
        const dateStr    = headerVal(hdrs, 'Date')
        const sentAt     = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

        const fromEmail  = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1]?.trim() ?? fromRaw.trim()
        const fromName   = fromRaw.includes('<') ? fromRaw.split('<')[0].trim().replace(/^"|"$/g, '') : null

        const bodyText = decodeBody(msg.payload?.parts ?? [msg.payload])

        // Determine direction: inbound if not from our domain
        const OPS_EMAIL = 'operations@trade-risksol.com'
        const direction = fromEmail.toLowerCase() === OPS_EMAIL ? 'outbound' : 'inbound'

        // 1. Upsert email_thread
        const threadUpsert = await fetch(
          `${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`,
          {
            method:  'POST',
            headers: sbHeaders('return=representation,resolution=merge-duplicates'),
            body: JSON.stringify({
              gmail_thread_id: gmailThreadId,
              subject,
              snippet:          bodyText.slice(0, 200),
              last_message_at:  sentAt,
              status:           'active',
            }),
          }
        )
        const threadRows = threadUpsert.ok ? await threadUpsert.json() : null
        const thread     = Array.isArray(threadRows) ? threadRows[0] : threadRows
        if (!thread?.id) continue

        // 2. Insert email_message
        const msgInsert = await fetch(`${SB_URL}/rest/v1/email_messages`, {
          method:  'POST',
          headers: sbHeaders('return=representation'),
          body: JSON.stringify({
            thread_id:       thread.id,
            gmail_message_id: gmailMsgId,
            direction,
            from_address:    fromEmail,
            subject,
            body_text:       bodyText,
            sent_at:         sentAt,
            has_attachments: (msg.payload?.parts ?? []).some(
              (p: { filename?: string }) => p.filename && p.filename.length > 0
            ),
          }),
        })
        const msgRows = msgInsert.ok ? await msgInsert.json() : null
        const dbMsg   = Array.isArray(msgRows) ? msgRows[0] : msgRows
        if (!dbMsg?.id) continue

        // 3. Resolve or create contact from sender email (inbound messages only)
        let contactId: string | null = null
        if (direction === 'inbound') {
          const contactUpsert = await fetch(
            `${SB_URL}/rest/v1/contacts?on_conflict=email`,
            {
              method:  'POST',
              headers: sbHeaders('return=representation,resolution=merge-duplicates'),
              body: JSON.stringify({
                full_name: fromName ?? fromEmail,
                email:     fromEmail,
                source:    'email',
              }),
            }
          )
          const contactRows = contactUpsert.ok ? await contactUpsert.json() : null
          const contact     = Array.isArray(contactRows) ? contactRows[0] : contactRows
          contactId = contact?.id ?? null

          // Link thread to contact
          if (contactId) {
            await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread.id}`, {
              method:  'PATCH',
              headers: sbHeaders('return=minimal'),
              body:    JSON.stringify({ contact_id: contactId }),
            })
          }
        }

        // 4. Insert email_participants (from, to, cc)
        type Participant = { thread_id: string; message_id: string; email: string; name: string | null; role: string; contact_id: string | null }
        const participants: Participant[] = []

        participants.push({
          thread_id:  thread.id,
          message_id: dbMsg.id,
          email:      fromEmail,
          name:       fromName,
          role:       'from',
          contact_id: direction === 'inbound' ? contactId : null,
        })

        const parseAddresses = (raw: string) =>
          raw.split(',').map(s => s.trim()).filter(Boolean).map(addr => {
            const m     = addr.match(/<(.+?)>/)
            const email = m ? m[1].trim() : addr.trim()
            const name  = addr.includes('<') ? addr.split('<')[0].trim().replace(/^"|"$/g, '') : null
            return { email, name }
          })

        for (const { email, name } of parseAddresses(toRaw)) {
          participants.push({ thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'to', contact_id: null })
        }
        for (const { email, name } of parseAddresses(ccRaw)) {
          participants.push({ thread_id: thread.id, message_id: dbMsg.id, email, name, role: 'cc', contact_id: null })
        }

        await fetch(`${SB_URL}/rest/v1/email_participants`, {
          method:  'POST',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify(participants),
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[email/inbound]', e)
    // Always return 200 to ack the Pub/Sub message — otherwise Google retries indefinitely
    return NextResponse.json({ ok: true })
  }
}
