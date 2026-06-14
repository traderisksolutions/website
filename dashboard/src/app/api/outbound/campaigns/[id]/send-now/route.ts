import { NextRequest, NextResponse } from 'next/server'
import { SB_URL, sbHeaders } from '@/lib/sb'

export const maxDuration = 60

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface SequenceStep {
  subject:    string
  body:       string
  delay_days: number
}

interface DueSend {
  id:                string
  lead_id:           string
  current_step:      number
  gmail_thread_id:   string | null
  from_email:        string | null
  send_scheduled_at: string
  metadata:          { steps?: SequenceStep[] } | null
}

// POST /api/outbound/campaigns/[id]/send-now
// Immediately sends queued emails for this campaign only.
// Body: { limit?: number } — max emails to send (default 50)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const limit: number = typeof body.limit === 'number' && body.limit > 0 ? body.limit : 50

  const now = new Date().toISOString()

  let gmailToken: string
  try {
    gmailToken = await getGmailToken()
  } catch (e) {
    return NextResponse.json(
      { error: `Gmail auth failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }

  // Load campaign (status + metadata for signature)
  const campRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaigns?id=eq.${id}&select=id,status,metadata`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const [camp] = campRes.ok ? await campRes.json() : [null]
  if (!camp) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Load signature if set
  let signatureHtml = ''
  const sigId = (camp.metadata as Record<string, unknown> | null)?.signature_id
  if (sigId) {
    const sigRes = await fetch(
      `${SB_URL}/rest/v1/user_signatures?id=eq.${sigId}&select=name,title,phone,email,company_tagline`,
      { headers: sbHeaders() }
    )
    const [sig] = sigRes.ok ? await sigRes.json() : [null]
    if (sig) signatureHtml = buildSignatureHtml(sig)
  }

  // Fetch due sends for this campaign — includes both initial (queued) and follow-up (sent + scheduled)
  const dueRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads` +
    `?campaign_id=eq.${id}` +
    `&send_status=in.(queued,sent)` +
    `&send_scheduled_at=lte.${now}` +
    `&approval_status=eq.included` +
    `&select=id,lead_id,current_step,gmail_thread_id,from_email,send_scheduled_at,metadata` +
    `&order=send_scheduled_at.asc&limit=${limit}`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const dueSends: DueSend[] = dueRes.ok ? await dueRes.json() : []

  if (!Array.isArray(dueSends) || dueSends.length === 0) {
    return NextResponse.json({ sent: 0, errors: [], at: now })
  }

  // Load lead details
  const leadIdSet = dueSends.map((d: DueSend) => d.lead_id).filter(Boolean)
  const leadIds   = leadIdSet.filter((v, i, a) => a.indexOf(v) === i)
  const leadsRes  = await fetch(
    `${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.join(',')})&select=id,email,first_name,full_name,current_company`,
    { headers: sbHeaders() }
  )
  const leadRows: { id: string; email: string | null; first_name: string | null; full_name: string | null; current_company: string | null }[] =
    leadsRes.ok ? await leadsRes.json() : []
  const leadsMap = new Map(leadRows.map(l => [l.id, l]))

  let sent = 0
  const errors: string[] = []

  for (const d of dueSends) {
    try {
      const steps = d.metadata?.steps
      if (!Array.isArray(steps) || steps.length === 0) {
        await patchLead(d.id, { send_status: 'sent' })
        continue
      }

      const step = steps[d.current_step]
      if (!step) {
        await patchLead(d.id, { send_status: 'sent', send_scheduled_at: null })
        continue
      }

      const lead = leadsMap.get(d.lead_id)
      if (!lead?.email) {
        await patchLead(d.id, { send_status: 'bounced' })
        continue
      }

      const firstName = lead.first_name ?? lead.full_name?.split(' ')[0] ?? ''
      const company   = lead.current_company ?? ''
      const subject   = substituteTokens(step.subject, firstName, company)
      const rawBody   = substituteTokens(step.body,    firstName, company)
      const htmlBody  = formatEmailBody(rawBody) + signatureHtml
      const fromEmail = d.from_email ?? 'operations@trade-risksol.com'

      const { threadId } = await sendGmailMessage({
        token:    gmailToken,
        from:     fromEmail,
        to:       lead.email,
        subject,
        body:     htmlBody,
        threadId: d.current_step > 0 ? (d.gmail_thread_id ?? undefined) : undefined,
      })

      const nextStep    = d.current_step + 1
      const isLastStep  = nextStep >= steps.length
      const sentAtField = d.current_step === 0 ? 'step1_sent_at'
                        : d.current_step === 1 ? 'step2_sent_at'
                        :                        'step3_sent_at'

      const updates: Record<string, unknown> = {
        send_status:     'sent',
        current_step:    nextStep,
        gmail_thread_id: threadId ?? d.gmail_thread_id,
        [sentAtField]:   new Date().toISOString(),
      }

      if (isLastStep) {
        updates.send_scheduled_at = null
      } else {
        const nextDelay = steps[nextStep]?.delay_days ?? 3
        const nextDate  = new Date()
        nextDate.setDate(nextDate.getDate() + nextDelay)
        updates.send_scheduled_at = nextDate.toISOString()
      }

      await patchLead(d.id, updates)
      sent++
    } catch (e) {
      errors.push(`lead ${d.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ sent, errors, at: now })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function patchLead(id: string, updates: Record<string, unknown>) {
  await fetch(`${SB_URL}/rest/v1/ob_campaign_leads?id=eq.${id}`, {
    method:  'PATCH',
    headers: sbHeaders(),
    body:    JSON.stringify(updates),
  })
}

function substituteTokens(text: string, firstName: string, company: string): string {
  return text
    .replace(/\{\{first_name\}\}/gi, firstName || 'there')
    .replace(/\{\{company\}\}/gi,    company   || 'your company')
}

function formatEmailBody(text: string): string {
  if (text.includes('<p>') || text.includes('<br>') || text.includes('<div>')) return text
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  if (paragraphs.length === 0) return `<p>${text}</p>`
  return paragraphs.map(p =>
    `<p style="margin:0 0 12px 0">${p.trim().replace(/\n/g, '<br>')}</p>`
  ).join('')
}

function buildSignatureHtml(sig: {
  name: string; title?: string | null; phone?: string | null
  email?: string | null; company_tagline?: string | null
}): string {
  const lines: string[] = [
    'Best regards,',
    `<strong>${sig.name}</strong>`,
    ...[sig.title, sig.phone].filter(Boolean).length > 0
      ? [[sig.title, sig.phone].filter(Boolean).join(' · ')]
      : [],
    ...(sig.email ? [`<a href="mailto:${sig.email}" style="color:#1d4ed8;text-decoration:none">${sig.email}</a>`] : []),
    ...(sig.company_tagline ? [sig.company_tagline] : []),
  ]
  return `<br><p style="margin:16px 0 0;font-size:13px;color:#555;line-height:1.7">${lines.join('<br>')}</p>`
}

function buildRfc2822(from: string, to: string, subject: string, htmlBody: string): string {
  const textBody = htmlBody
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()

  const b = 'ob_boundary_' + Math.random().toString(36).slice(2)
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    textBody,
    '',
    `--${b}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    '',
    `--${b}--`,
  ].join('\r\n')
}

async function sendGmailMessage(params: {
  token:    string
  from:     string
  to:       string
  subject:  string
  body:     string
  threadId?: string
}): Promise<{ messageId: string; threadId: string }> {
  const { token, from, to, subject, body, threadId } = params
  const raw     = Buffer.from(buildRfc2822(from, to, subject, body)).toString('base64url')
  const payload: Record<string, string> = { raw }
  if (threadId) payload.threadId = threadId

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return { messageId: data.id as string, threadId: data.threadId as string }
}

async function getGmailToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
  if (!data.access_token) throw new Error('Failed to get Gmail access token')
  return data.access_token as string
}
