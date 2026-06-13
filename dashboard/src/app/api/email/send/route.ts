import { NextRequest, NextResponse } from 'next/server'
import { waitUntil }                  from '@vercel/functions'
import { runDraftEvaluation }         from '@/lib/run-draft-evaluation'

const SB_URL    = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_OPS_EMAIL = 'operations@trade-risksol.com'

// Reads the send-from email from app_settings (key: reply_from_email).
// Falls back to DEFAULT_OPS_EMAIL if not configured.
// Note: the Gmail OAuth account must have this address set up as a "Send as" alias for it to work.
async function getOpsEmail(): Promise<string> {
  try {
    const k = process.env.SUPABASE_SERVICE_KEY
    if (!k) return DEFAULT_OPS_EMAIL
    const res = await fetch(
      `${SB_URL}/rest/v1/app_settings?key=eq.reply_from_email&select=value&limit=1`,
      { headers: { apikey: k, Authorization: `Bearer ${k}` }, cache: 'no-store' }
    )
    const rows = res.ok ? await res.json() : []
    const val  = Array.isArray(rows) ? rows[0]?.value : null
    return (typeof val === 'string' && val.includes('@')) ? val : DEFAULT_OPS_EMAIL
  } catch {
    return DEFAULT_OPS_EMAIL
  }
}

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

function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7E]/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
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
  const emailCss = `<style>body{margin:0;padding:0}p{margin:0 0 10px 0;padding:0}p:last-child{margin-bottom:0}ul,ol{margin:0 0 10px 0;padding-left:22px}li{margin-bottom:3px}strong{font-weight:600}a{color:#1d4ed8}</style>`
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
// Body: { draftId: string; htmlBody?: string; signatureId?: string }
// Fetches the approved ai_draft, sends via Gmail API, marks draft sent,
// and records the outbound message in email_messages.
export async function POST(req: NextRequest) {
  try {
    const { draftId, htmlBody, signatureId, cc, bcc, customSubject, replyTo } = await req.json() as { draftId: string; htmlBody?: string; signatureId?: string; cc?: string[]; bcc?: string[]; customSubject?: string; replyTo?: string }
    if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

    const OPS_EMAIL = await getOpsEmail()

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

    // 5. Send via Gmail API
    const token    = await getAccessToken()
    const rawEmail = buildRawEmail(contact.email, subject, finalPlain, finalHtml, cc, bcc, replyTo, OPS_EMAIL)

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
          from_address:     OPS_EMAIL,
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

    // Run evaluation after response — waitUntil keeps the function alive on Vercel.
    // Pass sentBodyPlain directly so evaluation never fails due to missing thread_id or
    // a race condition between the email_messages insert and the evaluation read.
    waitUntil(runDraftEvaluation(draftId, draft.thread_id ?? null, sentBodyPlain))

    return NextResponse.json({ ok: true, gmailMessageId: sent.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
