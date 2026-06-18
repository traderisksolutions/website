import { NextRequest, NextResponse } from 'next/server'
import { createSign }                 from 'node:crypto'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const OPS_EMAIL = 'operations@trade-risksol.com'

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

async function getAccessToken(sendAs = OPS_EMAIL): Promise<string> {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const sa: { client_email: string; private_key: string } = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    const privateKey = sa.private_key.replace(/\\n/g, '\n')
    const now    = Math.floor(Date.now() / 1000)
    const header  = { alg: 'RS256', typ: 'JWT' }
    const payload = { iss: sa.client_email, sub: sendAs, scope: 'https://www.googleapis.com/auth/gmail.send', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
    const enc   = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const input = `${enc(header)}.${enc(payload)}`
    const sign  = createSign('RSA-SHA256')
    sign.update(input)
    const jwt = `${input}.${sign.sign(privateKey, 'base64url')}`
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    })
    const data = await res.json()
    if (data.access_token) return data.access_token as string
  }
  // Legacy fallback
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
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

function buildRawEmail(to: string, subject: string, body: string): string {
  const lines = [
    `From: Trade Risk Solutions <${OPS_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

// POST /api/inbound/reply
// Body: { leadId, name, email, company, topic, originalMessage, draft }
// Sends reply via Gmail, creates contact + thread, updates lead status to 'contacted'.
export async function POST(req: NextRequest) {
  try {
    const { leadId, name, email, company, topic, originalMessage, draft } =
      await req.json() as {
        leadId:          string
        name:            string
        email:           string
        company?:        string | null
        topic?:          string | null
        originalMessage?: string | null
        draft:           string
      }

    if (!leadId || !email || !draft) {
      return NextResponse.json({ error: 'leadId, email, and draft are required' }, { status: 400 })
    }

    const subject = `Re: Your enquiry — Trade Risk Solutions`
    const sentAt  = new Date().toISOString()

    // 1. Send via Gmail
    const token    = await getAccessToken()
    const rawEmail = buildRawEmail(email, subject, draft)

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: rawEmail }),
    })

    if (!sendRes.ok) {
      const err = await sendRes.text()
      return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 502 })
    }

    const sent          = await sendRes.json()
    const gmailMsgId    = sent.id as string
    const gmailThreadId = sent.threadId as string

    // 2. Upsert contact — find first to avoid downgrading pipeline stage
    const encoded       = encodeURIComponent(email)
    const findContactRes = await fetch(`${SB_URL}/rest/v1/contacts?email=eq.${encoded}&select=id,engagement_stage&limit=1`, {
      headers: sbHeaders('return=representation'),
    })
    const foundContacts = findContactRes.ok ? await findContactRes.json() : []
    const foundContact  = Array.isArray(foundContacts) ? foundContacts[0] : null

    const upsertRes = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body: JSON.stringify({
        full_name:        name,
        email,
        company:          company ?? null,
        source:           'inbound_lead',
        stage:            'engaged',
        engagement_stage: foundContact?.engagement_stage ?? 'engaged',
        inbound_lead_id:  leadId,
      }),
    })
    const upserted  = upsertRes.ok ? await upsertRes.json() : null
    const contactRow = Array.isArray(upserted) ? upserted[0] : upserted
    const contactId  = contactRow?.id ?? null

    // 3. Create email thread in Supabase
    let threadId: string | null = null
    if (contactId) {
      const threadRes = await fetch(`${SB_URL}/rest/v1/email_threads`, {
        method:  'POST',
        headers: sbHeaders('return=representation'),
        body: JSON.stringify({
          contact_id:       contactId,
          gmail_thread_id:  gmailThreadId,
          subject:          `Enquiry: ${topic || 'General Insurance'}`,
          status:           'active',
          last_message_at:  sentAt,
        }),
      })
      const threads = threadRes.ok ? await threadRes.json() : null
      const thread  = Array.isArray(threads) ? threads[0] : threads
      threadId = thread?.id ?? null
    }

    // 4. Record messages in email_messages (original enquiry + our reply)
    if (threadId) {
      const enquiryBody = [
        topic            ? `Topic: ${topic}`           : null,
        company          ? `Company: ${company}`        : null,
        originalMessage  ? `\n${originalMessage}`       : null,
      ].filter(Boolean).join('\n')

      // Original inbound enquiry
      if (enquiryBody) {
        await fetch(`${SB_URL}/rest/v1/email_messages`, {
          method:  'POST',
          headers: sbHeaders('return=minimal'),
          body: JSON.stringify({
            thread_id:        threadId,
            gmail_message_id: `inbound_lead_${leadId}`,
            direction:        'inbound',
            from_address:     email,
            subject:          `Enquiry: ${topic || 'General Insurance'}`,
            body_text:        enquiryBody,
            sent_at:          sentAt,
            has_attachments:  false,
          }),
        })
      }

      // Our reply
      await fetch(`${SB_URL}/rest/v1/email_messages`, {
        method:  'POST',
        headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          thread_id:        threadId,
          gmail_message_id: gmailMsgId,
          direction:        'outbound',
          from_address:     OPS_EMAIL,
          subject,
          body_text:        draft,
          sent_at:          sentAt,
          has_attachments:  false,
        }),
      })
    }

    // 5. Update lead: status → contacted, link contact
    const patchBody: Record<string, unknown> = { status: 'contacted' }
    if (contactId) patchBody.contact_id = contactId

    await fetch(`${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify(patchBody),
    })

    // 6. Trigger auto-summarize (fire-and-forget — non-blocking)
    if (threadId) {
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      fetch(`${origin}/api/engagement/auto-summarize`, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-internal-secret': process.env.CRON_SECRET ?? '',
        },
        body: JSON.stringify({ thread_id: threadId, message_id: gmailMsgId }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, contactId, threadId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
