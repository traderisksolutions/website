// Display words shared by the campaign screens. State is a word, never a colour.

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { draft: 'Draft', active: 'Active', paused: 'Paused', completed: 'Completed' }

export const CONTACT_STATUS_LABEL: Record<string, string> = {
  review: 'Awaiting approval', pending: 'Waiting', active: 'In sequence', completed: 'Finished',
  replied: 'Replied', bounced: 'Bounced', unsubscribed: 'Unsubscribed',
}

export const FIRST_TOUCH_LABEL: Record<string, string> = { template: 'Template', personal_draft: 'Approved personal draft' }

export const RELATIONSHIP_LABEL: Record<string, string> = { client: 'Clients', enquiry: 'Enquiries', prospect: 'Prospects', other: 'Imported' }
export const RELATIONSHIP_WORD: Record<string, string> = { client: 'Client', enquiry: 'Enquiry', prospect: 'Prospect', other: 'Imported' }

export const SOURCE_LABEL = (s: string) =>
  s === 'lead_tool' ? 'Lead tool' : s === 'client' ? 'Clients' : s === 'contact' ? 'Contacts' : s === 'website_form' ? 'Website'
  : s.startsWith('import:') ? `Import ${s.slice(7)}` : s

export function audienceSummary(a: { relationships?: string[]; locations?: string[]; verifiedOnly?: boolean; namedOnly?: boolean } | null | undefined): string {
  const rel = a?.relationships?.length ? a.relationships.map(r => RELATIONSHIP_LABEL[r] ?? r).join(', ') : 'Everyone'
  const loc = a?.locations?.length ? a.locations.join(', ') : 'all markets'
  return `${rel} · ${loc}${a?.verifiedOnly ? ' · verified only' : ''}${a?.namedOnly ? ' · named people' : ''}`
}

/** "2 Oct 2026", or with the time, always Singapore time. */
export function fmtDate(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' }).format(d)
  if (!withTime) return date
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(d)
  return `${date} ${time} SGT`
}

/** "1 Oct": compact date for table cells. */
export function fmtDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' }).format(d)
}

/** "Mon 12 Oct 09:15" in the recipient's market time. */
export function fmtSlot(t: Date, loc: string | null): string {
  const l = (loc ?? 'SG').toUpperCase()
  const tz = l === 'ID' || l === 'TH' || l === 'VN' ? 'Asia/Jakarta' : l === 'HK' ? 'Asia/Hong_Kong' : 'Asia/Singapore'
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(t)
}

export const n = (x: number) => x.toLocaleString('en-SG')
