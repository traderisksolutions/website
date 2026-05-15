import { NextRequest, NextResponse } from 'next/server'

const SB_URL          = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API       = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TRS_DOMAIN      = 'trade-risksol.com'   // all @trade-risksol.com = internal

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

// True for any TRS staff email — these are never stored as contacts
const isInternal = (email: string) =>
  email.toLowerCase().endsWith(`@${TRS_DOMAIN}`)

// True for automated senders that should be ignored entirely
const isAutomated = (email: string) => {
  const l = email.toLowerCase()
  return (
    l.includes('noreply') || l.includes('no-reply') || l.includes('donotreply') ||
    l.includes('mailer-daemon') || l.includes('postmaster') ||
    l === 'workspace-noreply@google.com'
  )
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

function parseAddresses(raw: string): { email: string; name: string | null }[] {
  if (!raw.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(addr => {
    const m     = addr.match(/<(.+?)>/)
    const email = m ? m[1].trim() : addr.trim()
    const name  = addr.includes('<') ? addr.split('<')[0].trim().replace(/^"|"$/g, '') : null
    return { email, name }
  })
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

  let notification: { emailAddress?: string; historyId?: string }
  try { notification = JSON.parse(Buffer.from(rawData, 'base64').toString('utf-8')) }
  catch { return NextResponse.json({ error: 'Bad notification payload' }, { status: 400 }) }

  if (!notification.historyId) return NextResponse.json({ ok: true })

  try {
    const token = await getAccessToken()
    console.log('[ingest] fetching recent INBOX messages')

    const listRes = await fetch(
      `${GMAIL_API}/messages?labelIds=INBOX&maxResults=25`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const messageRefs: { id: string; threadId: string }[] =
      (listRes.ok ? await listRes.json() : {})?.messages ?? []
    console.log('[ingest] INBOX count:', messageRefs.length)

    for (const { id: gmailMsgId, threadId: gmailThreadId } of messageRefs) {

      const msg = await fetchGmailMessage(token, gmailMsgId)
      if (!msg) continue

      const hdrs: { name: string; value: string }[] = msg.payload?.headers ?? []
      const subject = headerVal(hdrs, 'Subject')
      const fromRaw = headerVal(hdrs, 'From')
      const toRaw   = headerVal(hdrs, 'To')
      const ccRaw   = headerVal(hdrs, 'Cc')
      const dateStr = headerVal(hdrs, 'Date')
      const sentAt  = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()

      const fromEmail = (fromRaw.match(/<(.+?)>/) ?? [, fromRaw])[1]?.trim() ?? fromRaw.trim()
      const fromName  = fromRaw.includes('<')
        ? fromRaw.split('<')[0].trim().replace(/^"|"$/g, '')
        : null

      // Skip automated senders entirely
      if (isAutomated(fromEmail)) {
        console.log('[ingest] skipping automated sender:', fromEmail)
        continue
      }

      const bodyText = decodeBody(msg.payload?.parts ?? [msg.payload])

      // Direction: outbound if sent by TRS staff, inbound if sent by external party
      const direction: 'inbound' | 'outbound' = isInternal(fromEmail) ? 'outbound' : 'inbound'

      // Identify the primary external contact for this thread.
      // Priority: external 'from' > external 'to' > first external 'cc'
      const toList  = parseAddresses(toRaw)
      const ccList  = parseAddresses(ccRaw)

      const allParticipants = [
        { email: fromEmail, name: fromName },
        ...toList,
        ...ccList,
      ]
      const externalParty = allParticipants.find(
        p => !isInternal(p.email) && !isAutomated(p.email)
      )

      if (!externalParty) {
        console.log('[ingest] skipping internal-only message:', gmailMsgId)
        continue
      }

      console.log('[ingest] message:', gmailMsgId, '| direction:', direction, '| external contact:', externalParty.email)

      // 1. Upsert contact for the external party (regardless of direction)
      const contactUpsert = await fetch(
        `${SB_URL}/rest/v1/contacts?on_conflict=email`,
        {
          method:  'POST',
          headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body: JSON.stringify({
            full_name: externalParty.name ?? externalParty.email,
            email:     externalParty.email,
            source:    'email',
          }),
        }
      )
      if (!contactUpsert.ok) {
        console.error('[ingest] contact upsert failed:', contactUpsert.status, await contactUpsert.text())
      }
      const contactRows = contactUpsert.ok ? await contactUpsert.json() : null
      const contact     = Array.isArray(contactRows) ? contactRows[0] : contactRows
      const contactId   = contact?.id ?? null

      // 2. Upsert email_thread linked to the external contact
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
            contact_id:       contactId,
          }),
        }
      )
      if (!threadUpsert.ok) {
        console.error('[ingest] thread upsert failed:', threadUpsert.status, await threadUpsert.text())
        continue
      }
      const threadRows = await threadUpsert.json()
      const thread     = Array.isArray(threadRows) ? threadRows[0] : threadRows
      if (!thread?.id) { console.error('[ingest] thread upsert returned no id'); continue }

      // Always keep contact_id up to date on the thread (in case it was null before)
      if (contactId && !threadRows[0]?.contact_id) {
        await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${thread.id}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify({ contact_id: contactId }),
        })
      }

      // 3. Upsert email_message (ON CONFLICT ignore — safe to re-run)
      const msgInsert = await fetch(
        `${SB_URL}/rest/v1/email_messages?on_conflict=gmail_message_id`,
        {
          method:  'POST',
          headers: sbHeaders('return=representation,resolution=ignore-duplicates'),
          body: JSON.stringify({
            thread_id:        thread.id,
            gmail_message_id: gmailMsgId,
            direction,
            from_address:     fromEmail,
            subject,
            body_text:        bodyText,
            sent_at:          sentAt,
            has_attachments:  (msg.payload?.parts ?? []).some(
              (p: { filename?: string }) => p.filename && p.filename.length > 0
            ),
          }),
        }
      )
      if (!msgInsert.ok) {
        console.error('[ingest] message insert failed:', msgInsert.status, await msgInsert.text())
        continue
      }
      const msgRows = await msgInsert.json()
      const dbMsg   = Array.isArray(msgRows) ? msgRows[0] : msgRows
      if (!dbMsg?.id) {
        console.log('[ingest] already ingested, skipping participants:', gmailMsgId)
        continue
      }

      // 4. Insert participants (ON CONFLICT DO NOTHING prevents duplicates)
      type Participant = { thread_id: string; message_id: string; email: string; name: string | null; role: string; contact_id: string | null }
      const participants: Participant[] = [
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

      await fetch(
        `${SB_URL}/rest/v1/email_participants?on_conflict=message_id,email,role`,
        {
          method:  'POST',
          headers: sbHeaders('return=minimal,resolution=ignore-duplicates'),
          body:    JSON.stringify(participants),
        }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ingest] FATAL ERROR:', e)
    return NextResponse.json({ ok: true }) // always ack Pub/Sub
  }
}
