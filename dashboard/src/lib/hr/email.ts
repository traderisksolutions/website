// HR Connect: the email HR receives, the receipt after submit, and the notice to the sender.
// Sent as operations@trade-risksol.com with a plain-text part, one link, no images, no tracking.
// The token appears only inside the URL that goes into the message; it is never logged.
import { createSign } from 'node:crypto'
import { buildRawEmail, DEFAULT_FROM, htmlToText } from '@/lib/email-mime'
import { getGmailToken } from '@/lib/gmail-send'
import type { HrLink, HrSubmission } from './types'
import { displayNameFromEmail } from './tokens'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const FROM_NAME = 'Trade Risk Solutions Operations'
const NAVY = '#0C338A'

// Details to fill once; they appear in every email. Bracketed until filled.
export const FOOTER_PLACEHOLDERS = {
  address: '[registered address, Singapore]',
  uen: '[UEN]',
  brokerReg: '[insurance broker registration]',
  phone: '[office number]',
}

export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
}

export const linkUrl = (token: string) => `${baseUrl()}/connect/${token}`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 2026-10-24 → 24 October 2026. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`
}

/** The time a submission landed, in Singapore: "10:42 on 20 October 2026". */
export function sgtStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} on ${longDate(d.toISOString().slice(0, 10))}`
}

/** The editable opening of the email: the three paragraphs the sender can change before sending. */
export function defaultMessage(input: { recipient_name: string; company_name: string; effective_date?: string | null; requested_by?: string | null }): string {
  const eff = input.effective_date ? `, effective ${longDate(input.effective_date)}` : ''
  const req = input.requested_by ? `, at the request of ${input.requested_by}` : ''
  return [
    `Dear ${input.recipient_name.trim()},`,
    `Trade Risk Solutions is preparing group employee benefits quotations for ${input.company_name.trim()}${eff}${req}.`,
    'To price the cover we need the current employee list. The secure page below lets you upload your own Excel or CSV, or connect Talenox or Workday. It takes about ten minutes.',
  ].join('\n\n')
}

function paragraphs(text: string): string {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n')
}

function shell(reference: string, body: string, signature: string, footer: string): string {
  return `<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden;color:#202124;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="padding:26px 36px 18px;border-bottom:1px solid #e8eaed">
<span style="font-size:15px;font-weight:600;letter-spacing:.02em;color:${NAVY}">TRADE RISK SOLUTIONS</span>
<span style="float:right;font-size:12.5px;color:#5f6368">Reference ${esc(reference)}</span>
</div>
<div style="padding:26px 36px 8px;font-size:15px;line-height:1.6">
${body}
</div>
<div style="padding:8px 36px 26px;font-size:14px;line-height:1.55">${signature}</div>
<div style="background:#f8f9fa;padding:16px 36px;font-size:11.5px;color:#80868b;line-height:1.5;border-top:1px solid #e8eaed">${footer}</div>
</div>`
}

function signatureHtml(senderName: string): string {
  return `<b style="font-weight:500">${esc(senderName)}</b><br>Operations, Trade Risk Solutions Pte Ltd<br>operations@trade-risksol.com · +65 ${esc(FOOTER_PLACEHOLDERS.phone)}`
}

function footerHtml(link: HrLink): string {
  const P = FOOTER_PLACEHOLDERS
  return `Trade Risk Solutions Pte Ltd · ${esc(P.address)} · ${esc(P.uen)} · ${esc(P.brokerReg)}. This email was sent to ${esc(link.recipient_email)} because a ${esc(link.company_name)} representative asked us to arrange employee benefits cover. It concerns a transaction in progress; it is not marketing.`
}

export type HrEmail = { subject: string; html: string; text: string }

/** Section 2 of the approved design: reference, the three paragraphs, what we ask for, one button, the full URL, expiry, data use, signature, footer. */
export function hrLinkEmail(link: HrLink, url: string, senderName = displayNameFromEmail(link.sent_by)): HrEmail {
  const subject = `Employee list for ${link.company_name}'s group benefits quotation · ref ${link.reference}`
  const opening = link.message?.trim() || defaultMessage(link)
  const body = `${paragraphs(opening)}
<p><b style="font-weight:500">What we ask for</b></p>
<ul>
<li>Each employee: name, date of birth, gender, category or grade, work pass type, hire date.</li>
<li>Each dependant to be covered: name, relationship, date of birth.</li>
</ul>
<p><b style="font-weight:500">What we do not ask for</b>: salaries, NRIC or passport numbers, home addresses, or any medical information.</p>
<p><a href="${esc(url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:500;padding:12px 22px;border-radius:8px;font-size:15px">Open the secure page</a></p>
<p style="font-size:12.5px;color:#5f6368;line-height:1.55">The link is personal to you and expires on ${esc(longDate(link.expires_at.slice(0, 10)))}. If the button does not work, copy this address into your browser: ${esc(url)}</p>
<p style="font-size:12.5px;color:#5f6368;line-height:1.55">The information is used only to obtain quotations from insurers for this policy, is held under our personal data protection policy, and is deleted on request. If you were not expecting this email, reply to this address or call us and we will stop.</p>`
  const html = shell(link.reference, body, signatureHtml(senderName), footerHtml(link))
  return { subject, html, text: htmlToText(html) }
}

/** The receipt HR gets after submitting. */
export function hrReceiptEmail(link: HrLink, submission: HrSubmission, senderName = displayNameFromEmail(link.sent_by)): HrEmail {
  const subject = `Received: employee list for ${link.company_name} · ref ${link.reference}`
  const name = submission.submitted_by_name || link.recipient_name
  const body = `<p>Dear ${esc(name)},</p>
<p>${submission.employee_count} employees and ${submission.dependant_count} dependants for reference ${esc(link.reference)} were received by Trade Risk Solutions at ${esc(sgtStamp(submission.consent_at ?? submission.updated_at))}.</p>
<p>The list is used only to obtain quotations from insurers for this policy. ${esc(senderName)} will be in touch with the quotations. The link you used is now closed.</p>`
  const html = shell(link.reference, body, signatureHtml(senderName), footerHtml(link))
  return { subject, html, text: htmlToText(html) }
}

/** The notice the sender gets when the list lands. */
export function senderNoticeEmail(link: HrLink, submission: HrSubmission): HrEmail {
  const subject = `Employee list received: ${link.company_name} · ref ${link.reference}`
  const issues = submission.employees.reduce((n, e) => n + e.issues.length, 0) + submission.dependants.reduce((n, d) => n + d.issues.length, 0)
  const body = `<p>${esc(submission.submitted_by_name || link.recipient_name)} (${esc(submission.submitted_by_email || link.recipient_email)}) submitted the employee list for ${esc(link.company_name)}, reference ${esc(link.reference)}, at ${esc(sgtStamp(submission.consent_at ?? submission.updated_at))}.</p>
<p>${submission.employee_count} employees · ${submission.dependant_count} dependants · source ${esc(submission.source)} · ${issues} open ${issues === 1 ? 'issue' : 'issues'}.</p>
<p><a href="${esc(`${baseUrl()}/pricing-matrix/hr-links/${link.id}`)}" style="color:${NAVY}">Open the link in the dashboard</a></p>`
  const html = shell(link.reference, body, '', `Internal notice from HR Connect. Sent to ${esc(link.sent_by ?? DEFAULT_FROM)}.`)
  return { subject, html, text: htmlToText(html) }
}

// ── Sending ──────────────────────────────────────────────────────────────

// operations@ is a Google Workspace mailbox. With a service account the send is impersonated
// (same path as /api/email/send and /api/inbound/reply); without one the legacy refresh token
// in gmail-send.ts is used.
async function serviceAccountToken(fromEmail: string): Promise<string> {
  const sa: { client_email: string; private_key: string } = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, sub: fromEmail, scope: 'https://www.googleapis.com/auth/gmail.send', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const sign = createSign('RSA-SHA256')
  sign.update(input)
  const jwt = `${input}.${sign.sign(privateKey, 'base64url')}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Service account token failed')
  return data.access_token as string
}

async function opsToken(): Promise<string> {
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? serviceAccountToken(DEFAULT_FROM) : getGmailToken()
}

async function sendRaw(raw: string): Promise<void> {
  const token = await opsToken()
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
}

/** From operations@, name "Trade Risk Solutions Operations", cc when set, reply-to the same, plain-text part. */
export async function sendLinkEmail(link: HrLink, token: string, actor: { email: string }): Promise<void> {
  const mail = hrLinkEmail(link, linkUrl(token), displayNameFromEmail(actor.email))
  const cc = link.cc_email ? [link.cc_email] : undefined
  await sendRaw(buildRawEmail(link.recipient_email, mail.subject, mail.text, mail.html, cc, undefined, DEFAULT_FROM, DEFAULT_FROM, undefined, undefined, FROM_NAME))
}

/** The receipt to HR and the notice to whoever sent the link. Failures are returned, not thrown. */
export async function sendSubmissionEmails(link: HrLink, submission: HrSubmission): Promise<string[]> {
  const errors: string[] = []
  const receipt = hrReceiptEmail(link, submission)
  const to = submission.submitted_by_email || link.recipient_email
  const cc = link.cc_email && link.cc_email !== to ? [link.cc_email] : undefined
  try { await sendRaw(buildRawEmail(to, receipt.subject, receipt.text, receipt.html, cc, undefined, DEFAULT_FROM, DEFAULT_FROM, undefined, undefined, FROM_NAME)) }
  catch (e) { errors.push(`receipt: ${e instanceof Error ? e.message : String(e)}`) }
  const sender = link.sent_by && link.sent_by.includes('@') ? link.sent_by : DEFAULT_FROM
  const notice = senderNoticeEmail(link, submission)
  try { await sendRaw(buildRawEmail(sender, notice.subject, notice.text, notice.html, undefined, undefined, DEFAULT_FROM, DEFAULT_FROM, undefined, undefined, FROM_NAME)) }
  catch (e) { errors.push(`notice: ${e instanceof Error ? e.message : String(e)}`) }
  return errors
}
