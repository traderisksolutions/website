// HR Connect, dashboard side: display words and response shapes. State is a word, never a colour.
//
// The API routes under /api/group-benefits/hr-links/** are owned by the link lifecycle lib
// (src/lib/hr/links.ts). This file only names what they return and how the screens word it.

import type { HrLink, HrLinkEvent, HrLinkStatus, HrSubmission, CensusMember } from '@/lib/hr/types'

/** A row in the HR links register. Counts are present only when the list route joins them. */
export type HrLinkRow = HrLink & { employee_count?: number | null; dependant_count?: number | null; lives?: number | null }

export type HrLinksListResponse = { links?: HrLinkRow[]; migrationPending?: boolean; error?: string }
export type HrLinkDetailResponse = { link?: HrLink; events?: HrLinkEvent[]; submission?: HrSubmission | null; migrationPending?: boolean; error?: string }
export type HrLinkCreateResponse = { link?: HrLink; mailError?: string; error?: string; url?: string }
export type HrLinkCensusResponse = { census?: CensusMember[]; migrationPending?: boolean; error?: string }

export const MIGRATION_PENDING_LINE = 'Migration 20261019_hr_connect is not applied yet.'

export const LINK_STATUS_LABEL: Record<HrLinkStatus, string> = {
  sent: 'Sent', opened: 'Opened', submitted: 'Submitted', expired: 'Expired', closed: 'Closed',
}

/** The status word shown: a sent or opened link past its expiry reads Expired even before the server marks it. */
export function linkStatusWord(link: Pick<HrLink, 'status' | 'expires_at'>, now = Date.now()): string {
  if ((link.status === 'sent' || link.status === 'opened') && new Date(link.expires_at).getTime() < now) return 'Expired'
  return LINK_STATUS_LABEL[link.status] ?? link.status
}

/** A link still takes a submission. */
export function linkIsOpen(link: Pick<HrLink, 'status' | 'expires_at'>, now = Date.now()): boolean {
  return (link.status === 'sent' || link.status === 'opened') && new Date(link.expires_at).getTime() >= now
}

export const EVENT_LABEL: Record<string, string> = {
  sent: 'Sent', resent: 'Resent', opened: 'Opened', uploaded: 'Uploaded', connected: 'Connected', saved: 'Saved',
  submitted: 'Submitted', expired: 'Expired', closed: 'Closed', error: 'Error',
}

export const SOURCE_LABEL: Record<string, string> = { csv: 'Upload', talenox: 'Talenox', simplepay: 'SimplePay', workday: 'Workday', manual: 'Entered by HR' }

export const RELATIONSHIP_LABEL: Record<string, string> = { self: 'Employee', spouse: 'Spouse', child: 'Child' }

export const CHIP = 'inline-flex items-center rounded-[6px] bg-[#f1f2ee] text-[#2a332f] text-[11.5px] font-medium px-2 py-0.5 whitespace-nowrap'

/** "20 Oct 2026", Singapore time. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }).format(d)
}

/** "20 Oct 10:42", Singapore time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(d)
  return `${date} ${time}`
}

/** "24 October 2026" for the message body. Accepts YYYY-MM-DD. */
export function fmtLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** A date of birth as the register shows it: "24 Dec 1971", or "missing". */
export function fmtDob(iso: string | null | undefined): string {
  if (!iso) return 'missing'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 'missing'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

/**
 * The three opening paragraphs of the email, as the broker sees them in the dialog before sending.
 * The rest of the email (what is collected, what is not, the button, the signature) is fixed by
 * src/lib/hr/email.ts. Wording follows the approved design, section 1.
 */
export function defaultMessage(input: { recipientName: string; companyName: string; effectiveDate: string | null; requestedBy: string }): string {
  const who = input.recipientName.trim()
  const company = input.companyName.trim() || '[company]'
  const eff = fmtLongDate(input.effectiveDate)
  const by = input.requestedBy.trim()
  return [
    `Dear ${who || '[recipient]'},`,
    `Trade Risk Solutions is preparing group employee benefits quotations for ${company}${eff ? `, effective ${eff}` : ''}${by ? `, at the request of ${by}` : ''}.`,
    'To price the cover we need the current employee list. The secure page below lets you connect your HR system, upload your own Excel or CSV, or enter the details.',
  ].join('\n\n')
}

export const EMAIL_OK = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/** One sentence per timeline event, from the event's detail. Unknown keys are left out. */
export function eventSentence(ev: HrLinkEvent, link: HrLink): string {
  const d = ev.detail ?? {}
  const s = (k: string) => { const v = d[k]; return typeof v === 'string' && v ? v : null }
  const nnum = (k: string) => { const v = d[k]; return typeof v === 'number' ? v : null }
  switch (ev.kind) {
    case 'sent':
    case 'resent': {
      const parts = [`from ${s('from') ?? 'operations@trade-risksol.com'} to ${s('to') ?? link.recipient_email}`]
      const cc = s('cc') ?? link.cc_email
      if (cc) parts.push(`copy ${cc}`)
      const exp = s('expires_at')
      if (ev.kind === 'resent' && exp) parts.push(`valid to ${fmtDate(exp)}`)
      return parts.join(', ')
    }
    case 'uploaded': {
      const parts: string[] = []
      if (s('filename')) parts.push(s('filename') as string)
      const rows = nnum('rows') ?? nnum('employees')
      if (rows != null) parts.push(`${rows} employee${rows === 1 ? '' : 's'} read`)
      const dep = nnum('dependants')
      if (dep) parts.push(`${dep} dependant${dep === 1 ? '' : 's'}`)
      const skipped = nnum('skipped')
      if (skipped) parts.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped`)
      return parts.join(', ')
    }
    case 'connected': {
      const src = s('source')
      const parts: string[] = []
      if (src) parts.push(SOURCE_LABEL[src] ?? src)
      if (s('tenantHost')) parts.push(s('tenantHost') as string)
      const rows = nnum('rows') ?? nnum('employees')
      if (rows != null) parts.push(`${rows} employee${rows === 1 ? '' : 's'} read`)
      const dep = nnum('dependants')
      if (dep) parts.push(`${dep} dependant${dep === 1 ? '' : 's'}`)
      return parts.join(', ')
    }
    case 'saved': {
      const emp = nnum('employees'); const dep = nnum('dependants')
      const parts: string[] = []
      if (emp != null) parts.push(`${emp} employee${emp === 1 ? '' : 's'}`)
      if (dep != null) parts.push(`${dep} dependant${dep === 1 ? '' : 's'}`)
      return parts.length ? `draft, ${parts.join(', ')}` : 'draft'
    }
    case 'submitted': {
      const emp = nnum('employees'); const dep = nnum('dependants')
      const lives = nnum('lives') ?? (emp != null ? emp + (dep ?? 0) : null)
      const parts: string[] = []
      if (lives != null) parts.push(`${lives} lives`)
      if (s('by') ?? s('name')) parts.push(`by ${s('by') ?? s('name')}`)
      parts.push('confirmation emailed to HR', 'link closed')
      return parts.join(', ')
    }
    case 'closed': return s('by') ? `by ${s('by')}` : ''
    case 'error': {
      const stage = s('stage'); const msg = s('message')
      return [stage ? `during ${stage}` : null, msg].filter(Boolean).join(': ')
    }
    default: return ''
  }
}
