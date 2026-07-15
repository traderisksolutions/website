import { NextRequest, NextResponse } from 'next/server'
import { createSign, randomUUID }     from 'node:crypto'
import { waitUntil }                  from '@vercel/functions'
import { runDraftEvaluation }         from '@/lib/run-draft-evaluation'
import { createClient }               from '@/lib/supabase/server'
import { buildRawEmail, htmlToText, type ThreadingHeaders } from '@/lib/email-mime'
import { buildQuotedHistory }         from '@/lib/build-reply-thread'

const SB_URL       = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API    = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_FROM = 'operations@trade-risksol.com'

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

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getTokenViaServiceAccount(fromEmail: string): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa: { client_email: string; private_key: string } = JSON.parse(raw)
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const now    = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email, sub: fromEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }
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
  if (!data.access_token) throw new Error(`Service account token failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

// 1. Personal Gmail (employee refresh token) → 2. Service account → 3. Legacy refresh token
async function getTokenForSender(fromEmail: string, userId: string | null): Promise<string> {
  if (userId) {
    try {
      const k = process.env.SUPABASE_SERVICE_KEY
      if (k) {
        const profileRes = await fetch(
          `${SB_URL}/rest/v1/employee_profiles?user_id=eq.${userId}&select=gmail_email,gmail_refresh_token&limit=1`,
          { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
        )
        const profiles = profileRes.ok ? await profileRes.json() : []
        const profile  = Array.isArray(profiles) ? profiles[0] : null
        if (profile?.gmail_refresh_token && profile?.gmail_email === fromEmail) {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     process.env.GMAIL_CLIENT_ID!,
              client_secret: process.env.GMAIL_CLIENT_SECRET!,
              refresh_token: profile.gmail_refresh_token as string,
              grant_type:    'refresh_token',
            }),
          })
          const tokenData = await tokenRes.json()
          if (tokenData.access_token) return tokenData.access_token as string
        }
      }
    } catch { /* fall through */ }
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return getTokenViaServiceAccount(fromEmail)
  }
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

// POST /api/inbound/reply
// Body: { leadId, name, email, company, topic, originalMessage, htmlBody, fromEmail?, draftId? }
// Sends reply via Gmail, creates contact + thread, updates lead status to 'contacted'.
// If draftId is provided, updates ai_drafts and triggers an eval so the system learns from edits.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const { leadId, name, email, company, topic, originalMessage, htmlBody, fromEmail: requestedFrom, draftId } =
      await req.json() as {
        leadId:           string
        name:             string
        email:            string
        company?:         string | null
        topic?:           string | null
        originalMessage?: string | null
        htmlBody:         string
        fromEmail?:       string
        draftId?:         string | null
      }

    if (!leadId || !email || !htmlBody) {
      return NextResponse.json({ error: 'leadId, email, and htmlBody are required' }, { status: 400 })
    }

    const FROM_EMAIL = (requestedFrom && requestedFrom.includes('@')) ? requestedFrom : DEFAULT_FROM
    const plainText  = htmlToText(htmlBody)
    const subject    = `Re: Your enquiry | Trade Risk Solutions`
    const sentAt     = new Date().toISOString()

    // When sending from a personal address, auto-CC and Reply-To operations@ so
    // the Gmail watch picks up lead replies and keeps the thread synced.
    const autoCC    = FROM_EMAIL !== DEFAULT_FROM ? [DEFAULT_FROM] : []
    const replyTo   = FROM_EMAIL !== DEFAULT_FROM ? DEFAULT_FROM  : undefined

    // The original web-form enquiry — quoted below our reply so the recipient sees the
    // context they submitted. It's a form, not an email, so there's no In-Reply-To to set;
    // we still assign a Message-ID so the lead's reply threads back to us.
    const enquiryText = [
      topic           ? `Topic: ${topic}`     : null,
      company         ? `Company: ${company}`  : null,
      originalMessage ? `\n${originalMessage}` : null,
    ].filter(Boolean).join('\n')

    let htmlToSend = htmlBody
    if (enquiryText.trim()) {
      const quote = buildQuotedHistory([{
        from_address: email, from_name: name?.trim() || null, sent_at: sentAt,
        body_text: enquiryText, body_html: null, rfc822_message_id: null,
      }])
      if (quote.html) htmlToSend = `${htmlBody}<br><br>${quote.html}`
    }

    const ourMessageId = `<${randomUUID()}@trade-risksol.com>`
    const threading: ThreadingHeaders = { messageId: ourMessageId }

    // 1. Send via Gmail
    const token    = await getTokenForSender(FROM_EMAIL, userId)
    const rawEmail = buildRawEmail(email, subject, plainText, htmlToSend, autoCC, undefined, replyTo, FROM_EMAIL, undefined, threading)

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

    // Read back the authoritative Message-ID (Gmail may rewrite ours) so the References
    // chain stays continuous when the lead replies. Falls back to ours on failure.
    let storedMessageId = ourMessageId
    if (gmailMsgId) {
      try {
        const mRes = await fetch(`${GMAIL_API}/messages/${gmailMsgId}?format=metadata&metadataHeaders=Message-ID`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (mRes.ok) {
          const meta = await mRes.json()
          const hdr  = (meta.payload?.headers ?? []).find((h: { name: string }) => h.name.toLowerCase() === 'message-id')
          if (hdr?.value) storedMessageId = hdr.value
        }
      } catch { /* keep ourMessageId */ }
    }

    // 2. Upsert contact
    const nameParts  = (name ?? '').trim().split(/\s+/)
    const firstName  = nameParts[0] ?? null
    const lastName   = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
    const upsertRes  = await fetch(`${SB_URL}/rest/v1/contacts?on_conflict=email`, {
      method:  'POST',
      headers: sbHeaders('return=representation,resolution=merge-duplicates'),
      body: JSON.stringify({
        first_name:      firstName,
        last_name:       lastName,
        email,
        company:         company ?? null,
        source:          'website',
        inbound_lead_id: leadId,
      }),
    })
    if (!upsertRes.ok) {
      const errText = await upsertRes.text()
      console.error('[inbound/reply] contact upsert failed:', upsertRes.status, errText)
    }
    const upserted   = upsertRes.ok ? await upsertRes.json() : null
    const contactRow = Array.isArray(upserted) ? upserted[0] : upserted
    const contactId  = contactRow?.id ?? null

    // Promote contact to 'engaged' if not already at a higher stage
    if (contactId) {
      const stageRes = await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contactId}&select=engagement_stage&limit=1`, {
        headers: sbHeaders('return=representation'),
      })
      const stageRows    = stageRes.ok ? await stageRes.json() : []
      const currentStage = Array.isArray(stageRows) ? stageRows[0]?.engagement_stage : null
      const STAGE_ORDER  = ['prospect', 'engaged', 'qualified', 'proposal', 'converted']
      if (!currentStage || STAGE_ORDER.indexOf(currentStage) < STAGE_ORDER.indexOf('engaged')) {
        await fetch(`${SB_URL}/rest/v1/contacts?id=eq.${contactId}`, {
          method:  'PATCH',
          headers: sbHeaders('return=minimal'),
          body:    JSON.stringify({ engagement_stage: 'engaged' }),
        })
      }
    }

    // 3. Upsert email thread
    let threadId: string | null = null
    if (contactId) {
      const threadRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?on_conflict=gmail_thread_id`,
        {
          method:  'POST',
          headers: sbHeaders('return=representation,resolution=merge-duplicates'),
          body: JSON.stringify({
            contact_id:      contactId,
            gmail_thread_id: gmailThreadId,
            subject:         `Enquiry: ${topic || 'General Insurance'}`,
            status:          'active',
            last_message_at: sentAt,
          }),
        }
      )
      if (!threadRes.ok) {
        const errText = await threadRes.text()
        console.error('[inbound/reply] email_thread upsert failed:', threadRes.status, errText)
      }
      const threads = threadRes.ok ? await threadRes.json() : null
      const thread  = Array.isArray(threads) ? threads[0] : threads
      threadId = thread?.id ?? null
    }

    // 4. Record messages in email_messages (original enquiry + our reply)
    if (threadId) {
      if (enquiryText) {
        await fetch(`${SB_URL}/rest/v1/email_messages`, {
          method:  'POST',
          headers: sbHeaders('return=minimal'),
          body: JSON.stringify({
            thread_id:        threadId,
            gmail_message_id: `inbound_lead_${leadId}`,
            direction:        'inbound',
            from_address:     email,
            subject:          `Enquiry: ${topic || 'General Insurance'}`,
            body_text:        enquiryText,
            sent_at:          sentAt,
            has_attachments:  false,
          }),
        })
      }

      await fetch(`${SB_URL}/rest/v1/email_messages`, {
        method:  'POST',
        headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          thread_id:         threadId,
          gmail_message_id:  gmailMsgId,
          rfc822_message_id: storedMessageId,
          direction:         'outbound',
          from_address:      FROM_EMAIL,
          subject,
          body_text:         plainText,
          sent_at:           sentAt,
          has_attachments:   false,
        }),
      })
    }

    // 5. Update lead: status → contacted, link contact + thread
    const patchBody: Record<string, unknown> = { status: 'contacted' }
    if (contactId) patchBody.contact_id = contactId
    if (threadId)  patchBody.thread_id  = threadId

    await fetch(`${SB_URL}/rest/v1/inbound_leads?id=eq.${leadId}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify(patchBody),
    })

    // 6. Back-fill ai_drafts and mark as sent
    if (draftId) {
      const draftPatch: Record<string, unknown> = { status: 'sent', sent_at: sentAt }
      if (contactId) draftPatch.contact_id = contactId
      if (threadId)  draftPatch.thread_id  = threadId
      await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}`, {
        method:  'PATCH',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify(draftPatch),
      })
    }

    // 7. Trigger auto-summarize (fire-and-forget)
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

    // 8. Run draft evaluation (plain text passed so eval never races on DB insert)
    if (draftId) {
      waitUntil(runDraftEvaluation(draftId, threadId, plainText))
    }

    return NextResponse.json({ ok: true, contactId, threadId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
