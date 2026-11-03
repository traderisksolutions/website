/**
 * The letter of broker appointment (also called a Broker of Record letter, or Letter of
 * Appointment). The client signs it on its own letterhead, addressed to TRS; with it an insurer
 * that has already quoted through another broker releases the risk to TRS.
 *
 * The wording is TRS's own template ("TRS - Letter of Broker Appointment.docx", July/Oct 2026);
 * only the client, the project title (Re: line), the insurance programme, the date and the
 * signatory change. Layout: the client's letterhead band at the top (blank unless a logo or
 * address is given), then the TRS logo, then the letter. Pure and browser-safe: the PDF (appointment-pdf.tsx) and the Word file
 * (appointment-server.tsx) both render from letterParts().
 */
export type AppointmentLetter = {
  clientName: string
  projectTitle: string
  /** Completes "…placement and administration of our ___." */
  programme: string
  /** YYYY-MM-DD */
  date: string
  signatoryName?: string | null
  designation?: string | null
  /** Group companies the appointment covers, listed under the letter ("List of entities"). */
  entities?: string[]
  /** The letter text as edited in the editor (simple HTML: p, b, i, u, ul, ol, li). Absent = TRS's template. */
  bodyHtml?: string | null
  /** The client's logo for the letterhead band: a PNG or JPEG data URL. Absent = the band stays blank. */
  clientLogo?: string | null
  /** Address lines printed in the letterhead band beside the logo. */
  clientAddress?: string[]
  /** The "To" block. Absent = TRS's office address. */
  addressee?: string[]
}

export type Run = { text: string; b?: boolean; i?: boolean; u?: boolean }
export type Block = { kind: 'p' | 'li'; ordered?: boolean; n?: number; runs: Run[] }

/** ai_drafts.email_type of the email that sends the letter to the client. */
export const LETTER_DRAFT_TYPE = 'APPOINTMENT_LETTER'

export const TRS_ADDRESSEE = ['Trade Risk Solutions Pte. Ltd.', '9 Temasek Boulevard', '#32-01 Suntec Tower 2', 'Singapore 038989']
export const LETTER_TITLE = 'Appointment of Insurance Broker'

export const letterDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Largest logo accepted, as data-URL characters (about 600 KB of image). */
export const LOGO_MAX_CHARS = 800_000

/** The logo when it is a PNG or JPEG data URL within the size limit, else null. */
export function letterLogo(v: unknown): string | null {
  return typeof v === 'string' && v.length <= LOGO_MAX_CHARS && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null
}

/** Free text (one line per row) as clean address lines, at most 6. */
export function addressLines(v: string | string[] | null | undefined): string[] {
  return (Array.isArray(v) ? v : (v ?? '').split(/\r?\n/)).map(clean).filter(Boolean).slice(0, 6)
}

const templateBody = (programme: string) => [
  `This is to confirm that with immediate effect, we have appointed Trade Risk Solutions Pte. Ltd. as our insurance broker with respect to the negotiation, placement and administration of our ${programme}.`,
  'This letter and the authority contained herein shall remain in full force until cancelled by us in writing.',
]

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const stripTags = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
const unesc = (t: string) => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** The template's letter text as editor HTML, so the editor starts from TRS's wording. */
export function templateHtml(l: Pick<AppointmentLetter, 'programme'>): string {
  return templateBody(clean(l.programme).replace(/\.$/, '') || '[insurance programme]').map(t => `<p>${esc(t)}</p>`).join('')
}

/**
 * Pure. Editor HTML as printable blocks: paragraphs and list items, each a run of text with bold,
 * italic and underline. Anything else (spans, links, colours) is read as its text.
 */
export function htmlBlocks(html: string): Block[] {
  const out: Block[] = []
  const src = html.replace(/\r?\n/g, ' ').replace(/<br\s*\/?>/gi, '\n')
  const re = /<(ol|ul)[^>]*>([\s\S]*?)<\/\1>|<p[^>]*>([\s\S]*?)<\/p>|<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[1]) {
      let n = 0
      for (const li of m[2].matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)) {
        const ordered = m[1].toLowerCase() === 'ol' && !/data-list="bullet"/.test(li[1])
        out.push({ kind: 'li', ordered, n: ordered ? ++n : undefined, runs: runsOf(li[2]) })
      }
    } else out.push({ kind: m[3] !== undefined ? 'p' : 'li', runs: runsOf(m[3] ?? m[4] ?? '') })
  }
  if (!out.length && clean(stripTags(html))) out.push({ kind: 'p', runs: runsOf(html) })
  return out.filter(b => b.kind === 'li' || b.runs.some(r => r.text.trim()))
}

function runsOf(inner: string): Run[] {
  const runs: Run[] = []
  const st = { b: 0, i: 0, u: 0 }
  for (const part of inner.split(/(<\/?(?:strong|b|em|i|u)\b[^>]*>)/i)) {
    const tag = part.match(/^<(\/?)(strong|b|em|i|u)\b/i)
    if (tag) { const k = /^(strong|b)$/i.test(tag[2]) ? 'b' : /^(em|i)$/i.test(tag[2]) ? 'i' : 'u'; st[k] += tag[1] ? -1 : 1; continue }
    const text = unesc(part.replace(/<[^>]+>/g, ''))
    if (text) runs.push({ text, ...(st.b > 0 ? { b: true } : {}), ...(st.i > 0 ? { i: true } : {}), ...(st.u > 0 ? { u: true } : {}) })
  }
  return runs
}

/** Everything printed on the letter, in order. */
export function letterParts(l: AppointmentLetter) {
  const programme = clean(l.programme).replace(/\.$/, '')
  return {
    addressee: addressLines(l.addressee).length ? addressLines(l.addressee) : TRS_ADDRESSEE,
    clientLogo: letterLogo(l.clientLogo),
    clientAddress: addressLines(l.clientAddress),
    date: letterDate(l.date),
    title: LETTER_TITLE,
    re: clean(l.projectTitle),
    body: templateBody(programme),
    blocks: (l.bodyHtml && clean(stripTags(l.bodyHtml)) ? htmlBlocks(l.bodyHtml) : templateBody(programme).map(t => ({ kind: 'p' as const, runs: [{ text: t }] as Run[] }))) as Block[],
    entities: (l.entities ?? []).map(clean).filter(Boolean),
    closing: 'Yours sincerely,',
    name: clean(l.signatoryName) || '[Name]',
    designation: clean(l.designation) || '[Designation]',
    company: clean(l.clientName),
  }
}

/** Problems that stop a letter being produced, in plain words. Empty when it can be produced. */
export function letterProblems(l: Partial<AppointmentLetter>): string[] {
  const out: string[] = []
  if (!clean(l.clientName)) out.push('Enter the client that signs the letter.')
  if (!clean(l.programme) && !clean(stripTags(l.bodyHtml ?? ''))) out.push('Enter the insurance programme.')
  if (!l.date || !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) out.push('Enter the date.')
  return out
}

export function letterFileName(l: AppointmentLetter, ext: 'pdf' | 'docx'): string {
  const safe = (s: string) => clean(s).replace(/[\\/:*?"<>|#%]+/g, ' ').slice(0, 70).trim()
  return `Letter of Broker Appointment - ${safe(l.clientName)}${clean(l.projectTitle) ? ` - ${safe(l.projectTitle)}` : ''}.${ext}`
}

/** An insurer's reply that says another broker already holds the risk. */
export function isBrokerBlock(text: string | null | undefined): boolean {
  return /(already|previously)\s+(been\s+)?(quoted|approached|submitted|received)|another\s+broker|other\s+broker|quoted\s+(through|via|by)\s+(an)?other|broker\s+of\s+record|\bBOR\b|blocked\s+(by|the\s+market)|market\s+is\s+blocked/i.test(text ?? '')
}

export type LetterStatus = { state: 'needed' | 'sent' | 'signed' | 'none'; at: string | null; documentId: string | null; url: string | null }

/**
 * Where a company stands with its appointment letter, from its data-room documents: signed when a
 * letter came back (email or upload), sent when TRS generated one, needed when the company holds
 * no live policy with TRS yet (a new client), otherwise nothing to show.
 */
export function letterStatus(docs: { id: string; doc_type: string; source: string; status: string; received_at: string | null; created_at: string; drive_url: string | null }[], hasLivePolicy: boolean): LetterStatus {
  const letters = docs.filter(d => d.doc_type === 'broker_appointment' && d.status !== 'ignored')
    .sort((a, b) => (b.received_at ?? b.created_at).localeCompare(a.received_at ?? a.created_at))
  const signed = letters.find(d => d.source !== 'generated')
  if (signed) return { state: 'signed', at: signed.received_at ?? signed.created_at, documentId: signed.id, url: signed.drive_url }
  const sent = letters.find(d => d.source === 'generated')
  if (sent) return { state: 'sent', at: sent.created_at, documentId: sent.id, url: sent.drive_url }
  return { state: hasLivePolicy ? 'none' : 'needed', at: null, documentId: null, url: null }
}
