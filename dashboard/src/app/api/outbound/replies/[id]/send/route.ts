import { NextRequest, NextResponse } from 'next/server'
import { createSign, randomUUID }    from 'node:crypto'
import { SB_URL, sbHeaders }         from '@/lib/sb'
import { requireStaffOrCron }        from '@/lib/api-auth'
import { createClient }              from '@/lib/supabase/server'
import { logActivity }               from '@/lib/log-activity'
import { buildRawEmail }             from '@/lib/email-mime'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// The persona outbound replies send as — a real Google Workspace user/alias the service
// account has domain-wide delegation to impersonate. Must exist in Workspace already; this
// route does not (and cannot) create it. Reply-To routes any further reply back into
// operations@, which the existing Gmail ingest pipeline watches, so the conversation continues
// in the normal Engagement inbox rather than needing a new, separate reply channel.
const REPLY_FROM_EMAIL = process.env.OUTBOUND_REPLY_FROM_EMAIL ?? 'alex@trade-risksol.com'
const REPLY_FROM_NAME  = process.env.OUTBOUND_REPLY_FROM_NAME  ?? 'Alex'
const REPLY_TO_EMAIL   = 'operations@trade-risksol.com'

function makeServiceAccountJWT(clientEmail: string, privateKey: string, subject: string): string {
  const now    = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail, sub: subject, scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }
  const enc   = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${enc(header)}.${enc(payload)}`
  const sign  = createSign('RSA-SHA256')
  sign.update(input)
  return `${input}.${sign.sign(privateKey, 'base64url')}`
}

async function getTokenForPersona(fromEmail: string): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa: { client_email: string; private_key: string } = JSON.parse(raw)
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const jwt = makeServiceAccountJWT(sa.client_email, privateKey, fromEmail)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(
      `Could not send as ${fromEmail}: ${JSON.stringify(data)}. ` +
      `Confirm ${fromEmail} exists as a real mailbox/alias in Google Workspace and the service ` +
      `account has domain-wide delegation for gmail.send.`
    )
  }
  return data.access_token as string
}

type Params = { params: Promise<{ id: string }> }

// POST /api/outbound/replies/[id]/send   { body: string }
// Sends the (human-reviewed, possibly edited) reply body as an email to the prospect. Never
// auto-triggered — always an explicit human action from Reply Review.
export async function POST(req: NextRequest, { params }: Params) {
  const unauthorized = await requireStaffOrCron(req)
  if (unauthorized) return unauthorized

  try {
    const { id } = await params
    const { body: replyBody } = await req.json() as { body?: string }
    if (!replyBody?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const eventRes = await fetch(
      `${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}&select=id,campaign_id,lead_id,lead_email,subject,draft_status&limit=1`,
      { headers: sbHeaders() }
    )
    const events = eventRes.ok ? await eventRes.json() : []
    const event  = Array.isArray(events) ? events[0] : null
    if (!event) return NextResponse.json({ error: 'Reply not found' }, { status: 404 })
    if (!event.lead_email) return NextResponse.json({ error: 'No email address on this reply' }, { status: 400 })
    if (event.draft_status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 })

    const token = await getTokenForPersona(REPLY_FROM_EMAIL)
    const subject = event.subject?.trim() ? (event.subject.startsWith('Re:') ? event.subject : `Re: ${event.subject}`) : 'Re: Your message'
    const rawEmail = buildRawEmail(
      event.lead_email, subject, replyBody, null, undefined, undefined, REPLY_TO_EMAIL,
      REPLY_FROM_EMAIL, undefined, { messageId: `<${randomUUID()}@trade-risksol.com>` }, REPLY_FROM_NAME
    )

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: rawEmail }),
    })
    if (!sendRes.ok) {
      const err = await sendRes.text()
      return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 502 })
    }
    const sent = await sendRes.json()
    const sentAt = new Date().toISOString()

    await fetch(`${SB_URL}/rest/v1/ob_reply_events?id=eq.${id}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({
        draft_body: replyBody, draft_status: 'sent', sent_at: sentAt,
        sent_by: user?.id ?? null, sent_from_email: REPLY_FROM_EMAIL, sent_gmail_message_id: sent.id ?? null,
      }),
    })

    void logActivity({
      action: 'outbound.reply_sent', resource_type: 'ob_reply_event', resource_id: id,
      new_value: { to: event.lead_email, from: REPLY_FROM_EMAIL, campaign_id: event.campaign_id, chars: replyBody.length },
    })

    return NextResponse.json({ ok: true, gmailMessageId: sent.id ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}
