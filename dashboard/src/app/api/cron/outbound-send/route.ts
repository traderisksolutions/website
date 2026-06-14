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
  campaign_id:       string
  lead_id:           string
  current_step:      number
  gmail_thread_id:   string | null
  from_email:        string | null
  send_scheduled_at: string
  metadata:          { steps?: SequenceStep[] } | null
}

interface LeadRow {
  id:              string
  email:           string | null
  first_name:      string | null
  full_name:       string | null
  current_company: string | null
}

// GET /api/cron/outbound-send
// Called hourly. Sends up to 30 queued outbound emails via Gmail.
// Handles multi-step sequences with per-lead scheduling.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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

  // Count total due sends, then take 20% (min 1) to stagger delivery naturally
  const countRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads` +
    `?send_status=in.(queued,sent)&send_scheduled_at=lte.${now}&approval_status=eq.included&select=id`,
    { method: 'HEAD', headers: { ...sbHeaders(), 'Prefer': 'count=exact' }, cache: 'no-store' }
  )
  const totalDue    = parseInt(countRes.headers.get('content-range')?.split('/')[1] ?? '0', 10)
  const sendsThisRun = Math.max(1, Math.ceil(totalDue * 0.2))

  // Fetch sends due now — covers initial sends (queued) and follow-up steps (sent with future schedule)
  const dueRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaign_leads` +
    `?send_status=in.(queued,sent)&send_scheduled_at=lte.${now}&approval_status=eq.included` +
    `&select=id,campaign_id,lead_id,current_step,gmail_thread_id,from_email,send_scheduled_at,metadata` +
    `&order=send_scheduled_at.asc&limit=${sendsThisRun}`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const dueSends: DueSend[] = dueRes.ok ? await dueRes.json() : []
  if (!Array.isArray(dueSends) || dueSends.length === 0) {
    return NextResponse.json({ sent: 0, total_due: totalDue, at: now })
  }

  // Skip sends for paused or completed campaigns
  const campaignIds = Array.from(new Set(dueSends.map(d => d.campaign_id)))
  const campRes = await fetch(
    `${SB_URL}/rest/v1/ob_campaigns?id=in.(${campaignIds.join(',')})&select=id,status`,
    { headers: sbHeaders(), cache: 'no-store' }
  )
  const campRows: { id: string; status: string }[] = campRes.ok ? await campRes.json() : []
  const activeCampaigns = new Set(campRows.filter(c => c.status === 'active').map(c => c.id))
  const activeSends = dueSends.filter(d => activeCampaigns.has(d.campaign_id))
  if (activeSends.length === 0) return NextResponse.json({ sent: 0, skipped_paused: dueSends.length, at: now })

  // Load lead details in one request
  const leadIds = Array.from(new Set(activeSends.map(d => d.lead_id)))
  const leadsRes = await fetch(
    `${SB_URL}/rest/v1/outbound_leads?id=in.(${leadIds.join(',')})&select=id,email,first_name,full_name,current_company`,
    { headers: sbHeaders() }
  )
  const leadRows: LeadRow[] = leadsRes.ok ? await leadsRes.json() : []
  const leadsMap = new Map(leadRows.map(l => [l.id, l]))

  let sent = 0
  const errors: string[] = []

  for (const d of activeSends) {
    try {
      const steps = d.metadata?.steps
      if (!Array.isArray(steps) || steps.length === 0) {
        await patchLead(d.id, { send_status: 'sent' })
        continue
      }

      const step = steps[d.current_step]
      if (!step) {
        // All steps complete
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
      const body      = substituteTokens(step.body,    firstName, company)
      const fromEmail = d.from_email ?? 'operations@trade-risksol.com'

      const { threadId } = await sendGmailMessage({
        token:    gmailToken,
        from:     fromEmail,
        to:       lead.email,
        subject,
        body,
        threadId: d.current_step > 0 ? (d.gmail_thread_id ?? undefined) : undefined,
      })

      const nextStep     = d.current_step + 1
      const isLastStep   = nextStep >= steps.length
      const sentAtField  = d.current_step === 0 ? 'step1_sent_at'
                         : d.current_step === 1 ? 'step2_sent_at'
                         :                        'step3_sent_at'

      const updates: Record<string, unknown> = {
        current_step:   nextStep,
        gmail_thread_id: threadId ?? d.gmail_thread_id,
        [sentAtField]:   new Date().toISOString(),
      }

      // Always mark as 'sent' once at least one step is delivered — analytics uses this
      updates.send_status = 'sent'

      if (isLastStep) {
        updates.send_scheduled_at = null  // no more steps
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

  return NextResponse.json({ sent, total_due: totalDue, batch_size: sendsThisRun, errors, at: now })
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

  const raw = Buffer.from(buildRfc2822(from, to, subject, body)).toString('base64url')
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
