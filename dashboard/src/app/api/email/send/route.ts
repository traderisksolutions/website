import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }                  from '@vercel/functions'
import { createSign }                 from 'node:crypto'
import { runDraftEvaluation }         from '@/lib/run-draft-evaluation'
import { logActivity }                from '@/lib/log-activity'
import { createClient }               from '@/lib/supabase/server'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

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

// ── Service-account impersonation (shared mailboxes) ──────────────────────────
// Signs a JWT and exchanges it for a short-lived access token that lets the
// service account send as any @trade-risksol.com address (domain-wide delegation).
function makeServiceAccountJWT(clientEmail: string, privateKey: string, subject: string): string {
  const now    = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   clientEmail,
    sub:   subject,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const enc   = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${enc(header)}.${enc(payload)}`
  const sign  = createSign('RSA-SHA256')
  sign.update(input)
  return `${input}.${sign.sign(privateKey, 'base64url')}`
}

async function getTokenViaServiceAccount(fromEmail: string): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')
  const sa: { client_email: string; private_key: string } = JSON.parse(raw)
  // Env vars sometimes escape newlines — normalise them
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const jwt = makeServiceAccountJWT(sa.client_email, privateKey, fromEmail)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Service account token failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

// Legacy fallback — used only if GOOGLE_SERVICE_ACCOUNT_KEY is not set
async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
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

// Returns a Gmail access token for the given fromEmail:
// 1. Employee's personal Gmail (token in employee_profiles) → use their refresh token
// 2. Shared/generic address → use service account impersonation
// 3. Fallback → legacy shared GMAIL_REFRESH_TOKEN
async function getTokenForSender(fromEmail: string, userId: string | null): Promise<string> {
  // 1. Personal Gmail
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
  // 2. Service account (preferred for shared senders)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return getTokenViaServiceAccount(fromEmail)
  }
  // 3. Legacy shared token
  return getAccessToken()
}

function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

// Derives a display name from an email local-part: "jarod.hong" → "Jarod Hong"
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  return local.split(/[._-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || email
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/ul>|<\/ol>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function wrapBase64Lines(b64: string): string {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64
}

function buildRawEmail(to: string, subject: string, body: string, htmlBody?: string | null, cc?: string[], bcc?: string[], replyTo?: string, fromEmail = DEFAULT_OPS_EMAIL): string {
  const boundary    = `trs_${Date.now()}`
  const plainText   = htmlBody ? htmlToText(htmlBody) : body
  const emailCss = `<style>body{margin:0;padding:0}p{margin:0 0 10px 0;padding:0}p:last-child{margin-bottom:0}ul,ol{margin:0 0 10px 0;padding-left:22px}li{margin-bottom:3px}strong{font-weight:600}a{color:#1d4ed8}img{max-width:100%;height:auto;display:block;margin:8px 0}</style>`
  const bodyStyle = `font-family:Arial,sans-serif;font-size:14px;line-height:1.65;color:#333`
  const fullHtml    = htmlBody
    ? `<!DOCTYPE html><html><head><meta charset="utf-8">${emailCss}</head><body style="${bodyStyle}">${htmlBody}</body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8">${emailCss}</head><body style="${bodyStyle}"><p style="white-space:pre-wrap">${body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p></body></html>`

  const plainB64 = wrapBase64Lines(Buffer.from(plainText, 'utf-8').toString('base64'))
  const htmlB64  = wrapBase64Lines(Buffer.from(fullHtml,  'utf-8').toString('base64'))

  const lines = [
    `From: Trade Risk Solutions <${fromEmail}>`,
    `To: ${to}`,
    ...(replyTo && replyTo !== fromEmail ? [`Reply-To: ${replyTo}`] : []),
    ...(cc?.length  ? [`Cc: ${cc.join(', ')}`]  : []),
    ...(bcc?.length ? [`Bcc: ${bcc.join(', ')}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    plainB64,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    '',
    `--${boundary}--`,
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

type Signature = {
  id: string; name: string; title: string | null; phone: string | null
  email: string | null; company_tagline: string | null
}

function buildSignatureHtml(sig: Signature): string {
  return [
    '<br>',
    '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb">',
    `<p style="margin:0;font-size:13px;color:#1e3a5f;font-weight:600">${sig.name}</p>`,
    sig.title           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.title}</p>` : '',
    sig.phone           ? `<p style="margin:4px 0 0;font-size:12px;color:#666">${sig.phone}</p>` : '',
    sig.email           ? `<p style="margin:4px 0 0;font-size:12px;color:#666"><a href="mailto:${sig.email}" style="color:#1d4ed8;text-decoration:none">${sig.email}</a></p>` : '',
    sig.company_tagline ? `<p style="margin:4px 0 0;font-size:12px;color:#999">${sig.company_tagline}</p>` : '<p style="margin:4px 0 0;font-size:12px;color:#999">Trade Risk Solutions</p>',
  ].filter(Boolean).join('\n')
}

function buildSignatureText(sig: Signature): string {
  return [
    '',
    '--',
    sig.name,
    sig.title           ?? '',
    sig.phone           ?? '',
    sig.email           ?? '',
    sig.company_tagline ?? 'Trade Risk Solutions',
  ].filter((l, i) => i < 2 || l).join('\n')
}

// POST /api/email/send
// Body: { draftId, htmlBody?, signatureId?, cc?, bcc?, customSubject?, replyTo?, fromEmail? }
// fromEmail selects which sender address to use. If the logged-in employee has connected
// their own Gmail and fromEmail matches, their token is used. Otherwise falls back to ops@.
export async function POST(req: NextRequest) {
  try {
    const { draftId, htmlBody, signatureId, toEmail, cc, bcc, customSubject, fromEmail: requestedFrom, originalAiBody } =
      await req.json() as { draftId: string; htmlBody?: string; signatureId?: string; toEmail?: string; cc?: string[]; bcc?: string[]; customSubject?: string; fromEmail?: string; originalAiBody?: string }
    if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

    // Identify the logged-in employee so we can use their Gmail token if they've connected one
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? null

    const FROM_EMAIL = (requestedFrom && requestedFrom.includes('@')) ? requestedFrom : DEFAULT_OPS_EMAIL

    // 1. Load the draft + contact email
    const draftRes = await fetch(
      `${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}&select=*&limit=1`,
      { headers: sbHeaders() }
    )
    const drafts = draftRes.ok ? await draftRes.json() : []
    const draft  = Array.isArray(drafts) ? drafts[0] : null
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    if (draft.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 })
    if (draft.channel !== 'email') return NextResponse.json({ error: 'Not an email draft' }, { status: 400 })

    // 2. Load recipient email from contacts
    const contactRes = await fetch(
      `${SB_URL}/rest/v1/contacts?id=eq.${draft.contact_id}&select=email&limit=1`,
      { headers: sbHeaders() }
    )
    const contacts = contactRes.ok ? await contactRes.json() : []
    const contact  = Array.isArray(contacts) ? contacts[0] : null
    if (!contact?.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 })

    // Use the overridden TO address if provided, otherwise fall back to the contact's email
    const recipientEmail = (toEmail && toEmail.includes('@')) ? toEmail.trim().toLowerCase() : contact.email as string

    // 3. Load thread subject (for reply subject line)
    let subject = 'Re: Your enquiry — Trade Risk Solutions'
    let gmailThreadId: string | null = null
    if (draft.thread_id) {
      const threadRes = await fetch(
        `${SB_URL}/rest/v1/email_threads?id=eq.${draft.thread_id}&select=subject,gmail_thread_id&limit=1`,
        { headers: sbHeaders() }
      )
      const threads = threadRes.ok ? await threadRes.json() : []
      const thread  = Array.isArray(threads) ? threads[0] : null
      if (thread?.subject) subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`
      if (customSubject?.trim()) subject = customSubject.trim()
      gmailThreadId = thread?.gmail_thread_id ?? null
    }

    // 4. Load signature and build final bodies
    let finalHtml = htmlBody ?? null
    let finalPlain = draft.body
    if (signatureId) {
      const sigRes = await fetch(
        `${SB_URL}/rest/v1/user_signatures?id=eq.${signatureId}&select=id,name,title,phone,email,company_tagline&limit=1`,
        { headers: sbHeaders() }
      )
      const sigs: Signature[] = sigRes.ok ? await sigRes.json() : []
      const sig = sigs[0] ?? null
      if (sig) {
        if (finalHtml) finalHtml = finalHtml + buildSignatureHtml(sig)
        finalPlain = finalPlain + buildSignatureText(sig)
      }
    }

    // 5. Send via Gmail API — use the employee's personal token if they've connected their Gmail,
    //    otherwise fall back to the shared ops@ token.
    const token    = await getTokenForSender(FROM_EMAIL, userId)
    const rawEmail = buildRawEmail(recipientEmail, subject, finalPlain, finalHtml, cc, bcc, undefined, FROM_EMAIL)

    const sendPayload: Record<string, unknown> = { raw: rawEmail }
    if (gmailThreadId) sendPayload.threadId = gmailThreadId

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(sendPayload),
    })

    if (!sendRes.ok) {
      const err = await sendRes.text()
      return NextResponse.json({ error: `Gmail send failed: ${err}` }, { status: 502 })
    }

    const sent = await sendRes.json()
    const sentAt = new Date().toISOString()

    // 6. Mark draft as sent
    await fetch(`${SB_URL}/rest/v1/ai_drafts?id=eq.${draftId}`, {
      method:  'PATCH',
      headers: sbHeaders('return=minimal'),
      body:    JSON.stringify({ status: 'sent', sent_at: sentAt }),
    })

    // The plain-text body of what was actually sent (signature stripped for cleaner eval comparison)
    const sentBodyPlain = finalHtml ? htmlToText(finalHtml) : finalPlain

    // 7. Record outbound message in email_messages (if thread exists in DB)
    if (draft.thread_id && sent.id) {
      await fetch(`${SB_URL}/rest/v1/email_messages`, {
        method:  'POST',
        headers: sbHeaders('return=minimal'),
        body: JSON.stringify({
          thread_id:        draft.thread_id,
          gmail_message_id: sent.id,
          direction:        'outbound',
          from_address:     FROM_EMAIL,
          subject,
          body_text:        sentBodyPlain,
          sent_at:          sentAt,
          has_attachments:  false,
        }),
      })

      // Update thread last_message_at
      await fetch(`${SB_URL}/rest/v1/email_threads?id=eq.${draft.thread_id}`, {
        method:  'PATCH',
        headers: sbHeaders('return=minimal'),
        body:    JSON.stringify({ last_message_at: sentAt }),
      })
    }

    // If TO was overridden to a different external email, ensure it exists as a contact
    const contactEmail = contact.email as string
    if (recipientEmail !== contactEmail.toLowerCase() && !recipientEmail.endsWith('@trade-risksol.com')) {
      const encoded = encodeURIComponent(recipientEmail)
      const existsRes = await fetch(
        `${SB_URL}/rest/v1/contacts?email=ilike.${encoded}&select=id&limit=1`,
        { headers: sbHeaders(), cache: 'no-store' }
      )
      const existing = existsRes.ok ? await existsRes.json() : []
      if (!Array.isArray(existing) || existing.length === 0) {
        await fetch(`${SB_URL}/rest/v1/contacts`, {
          method:  'POST',
          headers: sbHeaders('return=minimal'),
          body: JSON.stringify({
            full_name: nameFromEmail(recipientEmail),
            email:     recipientEmail,
            source:    'inbound_lead',
            stage:     'engaged',
          }),
        })
      }
    }

    // Log email send server-side — more reliable than client-side logging
    void logActivity({
      action:        'email.sent',
      resource_type: 'thread',
      resource_id:   draft.thread_id ?? undefined,
      lead_email:    recipientEmail,
      new_value: {
        recipient:    recipientEmail,
        subject,
        from_address: FROM_EMAIL,
        gmail_message_id: sent.id,
        draft_id:     draftId,
        chars:        sentBodyPlain.length,
      },
    })

    // Run evaluation after response — waitUntil keeps the function alive on Vercel.
    // Pass sentBodyPlain directly so evaluation never fails due to missing thread_id or
    // a race condition between the email_messages insert and the evaluation read.
    waitUntil(runDraftEvaluation(draftId, draft.thread_id ?? null, sentBodyPlain, originalAiBody))

    return NextResponse.json({ ok: true, gmailMessageId: sent.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
