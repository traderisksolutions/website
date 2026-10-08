/**
 * Prospect database rules, pure and tested (src/__tests__/outreach-prospects.test.ts).
 *
 * Named people only: a role inbox (info@, sales@ …) is refused at import and never enrolled.
 * WhatsApp is a wa.me link sent by hand from a phone; it is never automated, because
 * unsolicited automated WhatsApp messages get numbers banned.
 */

export const MARKETS = ['SG', 'HK', 'ID', 'MY', 'OTHER'] as const
export type Market = (typeof MARKETS)[number]
export const MARKET_LABEL: Record<Market, string> = { SG: 'Singapore', HK: 'Hong Kong', ID: 'Indonesia', MY: 'Malaysia', OTHER: 'Other' }

export const EMAIL_STATUSES = ['verified', 'published', 'guessed', 'unknown', 'invalid'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]
export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = { verified: 'Verified', published: 'Published', guessed: 'Guessed', unknown: 'Unchecked', invalid: 'Invalid' }
/** Statuses a campaign may send to unless its audience says otherwise. */
export const SENDABLE_DEFAULT: EmailStatus[] = ['verified', 'published']

export type ProspectAccount = {
  id: string; market: Market; name: string; domain: string | null; website: string | null; industry: string | null
  size: string | null; city: string | null; source: string; source_url: string | null; notes: string | null; created_at: string
}
export type ProspectContact = {
  id: string; account_id: string; full_name: string; first_name: string | null; title: string | null; email: string | null
  email_status: EmailStatus; email_source_url: string | null; phone: string | null; linkedin_url: string | null
  source: string; do_not_contact: boolean; outbound_lead_id: string | null; created_at: string
}
export type CampaignAudience = { markets?: Market[]; emailStatuses?: EmailStatus[] }

const ROLE_LOCAL = new Set([
  'info', 'sales', 'enquiry', 'enquiries', 'inquiry', 'inquiries', 'contact', 'contactus', 'hello', 'hi', 'admin', 'administrator',
  'support', 'help', 'hr', 'careers', 'jobs', 'recruit', 'recruitment', 'office', 'marketing', 'accounts', 'account', 'finance',
  'billing', 'invoice', 'invoices', 'service', 'services', 'customerservice', 'cs', 'team', 'mail', 'email', 'general', 'reception',
  'noreply', 'no-reply', 'donotreply', 'webmaster', 'postmaster', 'media', 'press', 'pr', 'legal', 'compliance', 'ops', 'operations',
  'enquire', 'business', 'partners', 'partnership', 'feedback', 'events', 'ask', 'mailbox', 'corporate', 'secretary',
])

/** A shared role mailbox rather than a named person. */
export function isRoleInbox(email: string | null | undefined): boolean {
  const local = (email ?? '').trim().toLowerCase().split('@')[0] ?? ''
  if (!local) return false
  return ROLE_LOCAL.has(local) || ROLE_LOCAL.has(local.replace(/[._-]?(sg|hk|id|my|asia|team)$/, ''))
}

export function isEmail(s: string | null | undefined): boolean {
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i.test((s ?? '').trim())
}

export function domainOf(urlOrEmail: string | null | undefined): string | null {
  const s = (urlOrEmail ?? '').trim().toLowerCase()
  if (!s) return null
  const host = s.includes('@') && !s.includes('/') ? s.split('@')[1] : s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0]
  const d = host?.replace(/^www\./, '').replace(/:\d+$/, '')
  return d && d.includes('.') ? d : null
}

export function firstNameOf(full: string | null | undefined): string | null {
  const parts = (full ?? '').trim().replace(/^(mr|mrs|ms|mdm|dr|ir|bapak|ibu|pak|bu)\.?\s+/i, '').split(/\s+/)
  return parts[0] ? parts[0].replace(/^./, c => c.toUpperCase()) : null
}

/** A contact the daily top-up and manual enrolment may add to a campaign. */
export function isEnrollable(c: Pick<ProspectContact, 'email' | 'email_status' | 'do_not_contact' | 'full_name'>, statuses: EmailStatus[] = SENDABLE_DEFAULT): boolean {
  return !c.do_not_contact && !!c.full_name?.trim() && isEmail(c.email) && !isRoleInbox(c.email) && statuses.includes(c.email_status)
}

// ── Merge fields ────────────────────────────────────────────────────────────

/** The sender's merge: identical for previews and real sends. */
export function substituteTokens(text: string, firstName: string, company: string): string {
  return text
    .replace(/\{\{first_name\}\}/gi, firstName || 'there')
    .replace(/\{\{company\}\}/gi, company || 'your company')
}

// ── WhatsApp, by hand only ──────────────────────────────────────────────────

/** Digits for wa.me when the number is a mobile in SG, HK, MY or ID, else null (landlines cannot take WhatsApp). */
export function mobileForWhatsApp(phone: string | null | undefined, market: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/[^0-9+]/g, '')
  if (!d) return null
  d = d.startsWith('+') ? d.slice(1) : d.startsWith('00') ? d.slice(2) : d
  const m = (market ?? '').toUpperCase()
  if (/^65[89]\d{7}$/.test(d)) return d
  if (/^852[4-79]\d{7}$/.test(d)) return d
  if (/^628\d{8,11}$/.test(d)) return d
  if (/^601\d{8,9}$/.test(d)) return d
  if (m === 'SG' && /^[89]\d{7}$/.test(d)) return `65${d}`
  if (m === 'HK' && /^[4-79]\d{7}$/.test(d)) return `852${d}`
  if (m === 'ID' && /^08\d{8,11}$/.test(d)) return `62${d.slice(1)}`
  if (m === 'MY' && /^01\d{8,9}$/.test(d)) return `6${d}`
  return null
}

export function whatsappMessage(firstName: string | null, company: string | null): string {
  return `${firstName ? `Hi ${firstName},` : 'Hi,'} this is Trade Risk Solutions in Singapore. We review corporate insurance and employee benefits for companies like ${company ?? 'yours'}. Would a short call be useful? traderisksolutions.com.sg`
}

export function whatsappLink(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s // no formula injection when opened in Excel
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return rows.map(r => r.map(cell).join(',')).join('\r\n')
}

// ── Sender schedule ─────────────────────────────────────────────────────────

/** The Gmail sender runs once a day at 23:15 UTC (07:15 Singapore), per vercel.json. */
export function nextSendRun(from: Date = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 15))
  if (d <= from) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/** Bounce guard: pause when more than 5% of the last 14 days' first emails bounced, once at least 20 went out. */
export function shouldPauseForBounces(firstsSent: number, bounced: number): boolean {
  return firstsSent >= 20 && bounced / firstsSent > 0.05
}
