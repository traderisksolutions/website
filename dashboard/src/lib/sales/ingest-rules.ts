// Normalising what the lead tool sends: country names, free-text email evidence, free-mail
// domains, matching keys. Pure; tested.

const COUNTRY: Record<string, string> = {
  sg: 'SG', singapore: 'SG', my: 'MY', malaysia: 'MY', id: 'ID', indonesia: 'ID', hk: 'HK', 'hong kong': 'HK', hongkong: 'HK',
  th: 'TH', thailand: 'TH', vn: 'VN', vietnam: 'VN', ph: 'PH', philippines: 'PH',
}
/** ISO-2 from a code or a country name ("Singapore", "Hong Kong"). */
export const countryCode = (v: unknown) => COUNTRY[(typeof v === 'string' ? v : '').trim().toLowerCase()] ?? null
export const COUNTRY_NAME: Record<string, string> = { SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia', HK: 'Hong Kong', TH: 'Thailand', VN: 'Vietnam', PH: 'Philippines' }

/** Evidence for an email, from a keyword or a free-text note. Old directories and association
 *  listings are stale: suggested, so the campaign does not send to them without review. */
export function emailStatusOf(basis: unknown): 'verified' | 'found_publicly' | 'suggested' {
  const b = (typeof basis === 'string' ? basis : '').toLowerCase()
  if (/\b(19\d\d|20[01]\d)\b|director(y|ies)|listing|association|infer|guess|pattern|construct/.test(b)) return 'suggested'
  if (/(?<!not )(?<!not deliverability-)verified/.test(b)) return 'verified'
  if (/publish|page|site|bio|profile|contact|team|press|report/.test(b)) return 'found_publicly'
  return 'suggested'
}

export const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|qq|163|126|proton|protonmail|netvigator|biznetvigator|singnet)\./i
export const RANK: Record<string, number> = { unknown: 0, invalid: 0, suggested: 1, found_publicly: 2, verified: 3 }
export const GENERIC_EMAIL = /^(info|enquir|inquir|sales|contact|admin|hello|general|service|support|hr|marketing|office|team|cs|customer|client|mail|ask|help|reception|account|finance|career|jobs|connect)[^@]*@/i

/** A draft: an optional "Subject: ..." first line, then the body. */
export function splitDraft(v: unknown): { subject: string | null; body: string } | null {
  const s = (typeof v === 'string' ? v : '').replace(/\r\n/g, '\n').trim()
  if (!s) return null
  const m = s.match(/^subject:\s*(.+)\n+([\s\S]+)$/i)
  return m ? { subject: m[1].trim().slice(0, 200), body: m[2].trim().slice(0, 5000) } : { subject: null, body: s.slice(0, 5000) }
}

/** Company name for matching: no legal suffix, no punctuation, lower case. */
export function companyKey(v: unknown): string {
  return (typeof v === 'string' ? v : '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(pte|ltd|limited|llc|llp|lp|inc|corp|corporation|co|company|sdn|bhd|pt|tbk|plc|group|holdings?|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

/** Person name for matching: no title, letters only, word order ignored. */
export function personKey(v: unknown): string {
  return (typeof v === 'string' ? v : '').toLowerCase()
    .replace(/^(mr|mrs|ms|mdm|dr|prof|ir|bapak|ibu)\.?\s+/, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ')
}

export const domainOf = (v: unknown) => (typeof v === 'string' ? v : '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '') || null
