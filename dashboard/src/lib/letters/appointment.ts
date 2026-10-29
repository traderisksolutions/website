/**
 * The letter of broker appointment (also called a Broker of Record letter, or Letter of
 * Appointment). The client signs it on its own letterhead, addressed to TRS; with it an insurer
 * that has already quoted through another broker releases the risk to TRS.
 *
 * The wording is TRS's own template ("TRS - Letter of Broker Appointment.docx", July/Oct 2026);
 * only the client, the project title (Re: line), the insurance programme, the date and the
 * signatory change. Pure and browser-safe: the PDF (appointment-pdf.tsx) and the Word file
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
}

/** ai_drafts.email_type of the email that sends the letter to the client. */
export const LETTER_DRAFT_TYPE = 'APPOINTMENT_LETTER'

export const TRS_ADDRESSEE = ['Trade Risk Solutions Pte. Ltd.', '9 Temasek Boulevard', '#32-01 Suntec Tower 2', 'Singapore 038989']
export const LETTER_TITLE = 'Appointment of Insurance Broker'

export const letterDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Everything printed on the letter, in order. */
export function letterParts(l: AppointmentLetter) {
  const programme = clean(l.programme).replace(/\.$/, '')
  return {
    addressee: TRS_ADDRESSEE,
    date: letterDate(l.date),
    title: LETTER_TITLE,
    re: clean(l.projectTitle),
    body: [
      `This is to confirm that with immediate effect, we have appointed Trade Risk Solutions Pte. Ltd. as our insurance broker with respect to negotiation, placement and administration of our ${programme}.`,
      'This letter and the authority contained herein shall remain in full force until cancelled by us in writing.',
    ],
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
  if (!clean(l.projectTitle)) out.push('Enter the project title.')
  if (!clean(l.programme)) out.push('Enter the insurance programme.')
  if (!l.date || !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) out.push('Enter the date.')
  return out
}

export function letterFileName(l: AppointmentLetter, ext: 'pdf' | 'docx'): string {
  const safe = (s: string) => clean(s).replace(/[\\/:*?"<>|#%]+/g, ' ').slice(0, 70).trim()
  return `Letter of Broker Appointment - ${safe(l.clientName)} - ${safe(l.projectTitle)}.${ext}`
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
