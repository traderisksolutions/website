/**
 * The letter of undertaking of nil claims. The client signs it on its own letterhead, addressed
 * to the insurer; with it the insurer issues cover from a start date earlier than the instruction.
 *
 * The wording is TRS's own template as sent in 2026 (Penjuru, Sengkang, 1-Net): class of policy,
 * project title, project period, the request to issue from the start date, the confirmation of no
 * known loss between the start date and the signing date, and the indemnity. Pure and
 * browser-safe: the PDF and the Word file both render from undertakingParts().
 */
export type UndertakingLetter = {
  clientName: string
  insurerName: string
  /** The insurer's address lines, when on file; else the letter leaves the lines for the broker. */
  insurerAddress?: string[] | null
  /** "Contractors' All Risks and Project Employers' Liability" */
  classOfPolicy: string
  /** As the letter of award names it; printed in capitals. */
  projectTitle: string
  /** "12 months from 22 April 2026 + 6 months buffer + 18 months defects liability period" */
  projectPeriod: string
  /** YYYY-MM-DD: the day cover is to start. */
  startDate: string
  /** YYYY-MM-DD: the day the letter is signed. */
  date: string
  signatoryName?: string | null
  designation?: string | null
}

export const UNDERTAKING_TITLE = 'LETTER OF UNDERTAKING'

export const longDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Everything printed on the letter, in order. */
export function undertakingParts(l: UndertakingLetter) {
  const insurer = clean(l.insurerName)
  return {
    letterhead: ['INSURED NAME & ADDRESS', '(TO PRINT ON LETTER HEAD)'],
    date: longDate(l.date),
    addressee: [insurer, ...(l.insurerAddress?.map(clean).filter(Boolean) ?? ['[Address]'])],
    attention: 'Attention: To whom it may concern',
    salutation: 'Dear Sirs',
    title: UNDERTAKING_TITLE,
    table: [
      ['CLASS OF POLICY', clean(l.classOfPolicy)],
      ['PROJECT TITLE', clean(l.projectTitle).toUpperCase()],
      ['PROJECT PERIOD', clean(l.projectPeriod)],
    ] as [string, string][],
    body: [
      `We are writing to request your agreement to issue the above policy to commence on ${longDate(l.startDate)}.`,
      `We are pleased to confirm there has been no known/reported loss, incident, occurrence, notification and/or allegation that may lead to a claim for the period ${longDate(l.startDate)} until ${longDate(l.date)} in relation to the project and we will undertake to indemnify ${insurer} should there be any loss, incident, occurrence, notification and/or allegation that may lead to a claim occur including all costs and expenses whatsoever incurred by you during this period.`,
    ],
    closing: 'Yours faithfully',
    signature: 'Authorised Signatory & Company Stamp',
    name: clean(l.signatoryName) || '',
    designation: clean(l.designation) || '',
    company: clean(l.clientName),
  }
}

/** Problems that stop the letter being produced. Empty when it can be. */
export function undertakingProblems(l: Partial<UndertakingLetter>): string[] {
  const out: string[] = []
  if (!clean(l.clientName)) out.push('Enter the client that signs the letter.')
  if (!clean(l.insurerName)) out.push('Enter the insurer the letter is addressed to.')
  if (!clean(l.classOfPolicy)) out.push('Enter the class of policy.')
  if (!clean(l.projectTitle)) out.push('Enter the project title.')
  if (!l.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(l.startDate)) out.push('Enter the start date of cover.')
  if (!l.date || !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) out.push('Enter the date.')
  if (l.startDate && l.date && l.startDate > l.date) out.push('The start date is after the signing date; no undertaking is needed.')
  return out
}

export function undertakingFileName(l: UndertakingLetter, ext: 'pdf' | 'docx'): string {
  const safe = (s: string) => clean(s).replace(/[\\/:*?"<>|#%]+/g, ' ').slice(0, 60).trim()
  return `Letter of Undertaking - ${safe(l.clientName)} - ${safe(l.insurerName)}.${ext}`
}
