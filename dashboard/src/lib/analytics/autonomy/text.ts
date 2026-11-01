/**
 * Text helpers for the autonomy metric. Pure.
 *
 * A message is judged on its own words: the quoted history, the signature block and the legal
 * footer are cut first, so a two-line reply on top of a long thread counts as two lines.
 */
import { bareEmail, emailDomain, isInternal, PUBLIC_EMAIL_DOMAINS } from '@/lib/crm/db'

export type RecipientKind = 'internal' | 'client' | 'insurer' | 'partner' | 'tpa' | 'vendor' | 'other' | 'public' | 'regulator' | 'unmapped'

const QUOTE_CUTS: RegExp[] = [
  /^On .{5,120}wrote:\s*$/m, /^On .{5,120}\n.{0,80}wrote:\s*$/m,
  /^-{3,}\s*Original Message\s*-{3,}/mi, /^_{8,}\s*$/m, /^From:\s.+\n(Sent|Date):\s/mi, /^\*From:\*/m, /^From: .+<.+>\s*$/m,
  /^Sent from my (iPhone|Samsung|Galaxy|Android)/mi, /^Get Outlook for/mi,
  /^\s*>/m, /^Disclaimer\b/mi, /^ANNOUNCEMENT\s*$/m, /^\[?Internal\]?\s*$/m, /^This email and any attachments/mi,
  /^The information (contained|in this)/mi, /^IMPORTANT NOTICE/m, /^This (e-?mail|message) (and any|is confidential|contains confidential)/mi, /^CONFIDENTIAL/m,
]
const SIGN_OFF = /^\s*(Best|Best regards|Best Regards|Warm(est)? Regards|Regards|Kind regards|Kind Regards|Thanks and regards|Thanks & regards|Thank you|Thanks|Cheers|Yours (sincerely|faithfully)|With regards|Sincerely)\s*[,.!]?\s*$/m
const SIGNATURE_LINE = /^\s*(\+65|Tel:|H\/P|Mobile|Email:|www\.|Trade Risk Solutions|Associate Broker|Senior Broker|Broker|Director)/i

/** The message's own text: quoted history, sign-off and signature lines removed. */
export function newText(body: string | null | undefined): string {
  let t = (body ?? '').replace(/\r/g, '')
  let idx = t.length
  for (const rx of QUOTE_CUTS) { const m = rx.exec(t); if (m && m.index < idx && m.index > 0) idx = m.index }
  t = t.slice(0, idx)
  const s = SIGN_OFF.exec(t); if (s && s.index > 0) t = t.slice(0, s.index)
  return t.split('\n').filter(l => !SIGNATURE_LINE.test(l)).join('\n').trim()
}

export const stripGreeting = (t: string) => t.replace(/^\s*(hi|hello|dear|good (morning|afternoon|day))\b[^\n]*\n+/i, '')
export const words = (t: string) => t ? t.split(/\s+/).filter(Boolean).length : 0
export const normSubject = (s: string | null | undefined) => (s ?? '').replace(/^\s*((?:(?:re|fw|fwd|tr|aw)\s*:\s*)+)/i, '').replace(/\[EXTERNAL\]|\(EXTERNAL\)|EXTERNAL:|\[External\]/gi, '').trim()
export const isForwardSubject = (s: string | null | undefined) => /^\s*(re\s*:\s*)*(fw|fwd)\s*:/i.test(s ?? '')

/** Signature logos and inline pictures are not documents. */
export const isImageAttachment = (a: { filename?: string | null; mime_type?: string | null }) =>
  /\.(png|jpe?g|gif|bmp|svg|webp)$|inline_image|^image0|^outlook-|^noname$|^~?wrd/i.test(a.filename ?? '') || /^image\//.test(a.mime_type ?? '')

// Domains the company list may not hold yet, by the kind of organisation the domain names.
const INSURER_DOMAIN = /qbe|chubb|allianz|liberty|tokiomarine|msig|ergo|income|aia\.|aig|axa|greateastern|ecics|eqinsurance|cntaiping|bhspecialty|berkley|cigna|sompo|zurich|prudential|fwd|lonpac|etiqa|generali|lloyd|swissre|munichre|starr|markel|hdi|singlife|hlas|ntuc|utmost|bupa/i
const TPA_DOMAIN = /ihp\.com|mhc\.|adept|inova|sedgwick|crawford|charles ?taylor|mclarens|cunningham/i
const VENDOR_DOMAIN = /xero|google|microsoft|zoom|linkedin|docusign|canva|notion|apple|mailchimp|hubspot|vercel|supabase|github|openai|anthropic|wix|godaddy|dropbox|adobe|calendly|lark|slack/i

/** The kind of organisation behind an address: the company list first, then the domain itself. */
export function recipientKind(email: string, domainKinds: Map<string, string>): RecipientKind {
  const d = emailDomain(email)
  if (!d) return 'unmapped'
  if (isInternal(email)) return 'internal'
  const k = domainKinds.get(d)
  if (k) return (['client', 'insurer', 'partner', 'tpa', 'vendor', 'other'].includes(k) ? k : 'other') as RecipientKind
  if (PUBLIC_EMAIL_DOMAINS.has(d)) return 'public'
  if (TPA_DOMAIN.test(d)) return 'tpa'
  if (INSURER_DOMAIN.test(d)) return 'insurer'
  if (/mas\.gov|gov\.sg|iras|acra/.test(d)) return 'regulator'
  if (VENDOR_DOMAIN.test(d)) return 'vendor'
  return 'unmapped'
}

export const senderAddress = (from: string | null | undefined) => bareEmail(from)

/** Word-level similarity of two texts, 0 to 1: the longest common subsequence over the longer
 *  text. Capped at 400 words a side so a long reply chain cannot stall the computation. */
export function similarity(a: string, b: string): number {
  const A = tokens(a).slice(0, 400), B = tokens(b).slice(0, 400)
  if (!A.length && !B.length) return 1
  if (!A.length || !B.length) return 0
  let prev = new Array<number>(B.length + 1).fill(0)
  for (let i = 1; i <= A.length; i++) {
    const cur = new Array<number>(B.length + 1).fill(0)
    for (let j = 1; j <= B.length; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    prev = cur
  }
  return prev[B.length] / Math.max(A.length, B.length)
}

/** How much of `draft` survives in `sent`, 0 to 1: the words kept, in order, over the draft's
 *  words. Text the person added (a name, a line) does not count against the draft. */
export function retained(draft: string, sent: string): number {
  const A = tokens(draft).slice(0, 400), B = tokens(sent).slice(0, 400)
  if (!A.length) return 1
  if (!B.length) return 0
  let prev = new Array<number>(B.length + 1).fill(0)
  for (let i = 1; i <= A.length; i++) {
    const cur = new Array<number>(B.length + 1).fill(0)
    for (let j = 1; j <= B.length; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    prev = cur
  }
  return prev[B.length] / A.length
}

const tokens = (t: string) => t.toLowerCase().replace(/\{owner_name\}/g, ' ').replace(/[^a-z0-9$%.\s]/g, ' ').split(/\s+/).filter(Boolean)
