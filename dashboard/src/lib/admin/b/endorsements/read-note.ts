/**
 * Reads an insurer's debit note, credit note or tax invoice from its text, without a model. Pure.
 * Great Eastern and QBE lay their notes out as "Label : value" pairs and a premium table with a
 * "Total Due" or "Total Refund" line; the reader takes only what those labels say. A figure it
 * cannot find stays null and the model (agent.readInsurerNote) is asked, when it can be.
 */
import { parseWrittenDate } from '@/lib/admin/b/dates'

export type NoteEvent = 'endorsement' | 'renewal' | 'new_business' | 'unknown'
export type NoteReadResult = {
  kind: 'debit' | 'credit'
  event: NoteEvent
  note_no: string | null
  issued_on: string | null
  effective_on: string | null
  period_start: string | null
  period_end: string | null
  amount: number | null
  gst: number | null
  currency: string
  pax: number | null
  member_names: string[]
  description: string | null
  /** The words each figure came from. */
  evidence: Record<string, { excerpt: string; source: string }>
  needs_review: boolean
}

const money = (s: string | undefined): number | null => {
  if (!s) return null
  const n = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
/** Markdown cells, bullets and rules become one separator, so a label's value ends where the cell does. */
const flat = (t: string) => t.replace(/\*\*|__/g, ' ').replace(/<br\s*\/?>/gi, ' ; ').replace(/:-{2,}:?/g, ' ').replace(/[|*#]+|-{3,}|={3,}/g, ' ; ').replace(/(\s*;\s*)+/g, ' ; ').replace(/\s+/g, ' ').trim()
const date = (s: string | undefined) => (s ? parseWrittenDate(s.trim()) : null)
const field = (t: string, label: RegExp): string | null => {
  const m = new RegExp(`${label.source}\\s*[:：;]?\\s*(?:;\\s*)?([^;:\\n]{1,80}?)(?=\\s*;|\\s+(?:[A-Z][A-Za-z.]+ ?){1,4}\\s*:|$)`, 'i').exec(t)
  const v = m?.[1].trim() ?? null
  return v && !/^(-|n\/a|nil)$/i.test(v) ? v : null
}

/** Names on the note: "Name : Lam Boon Yong" lines, and any member on file whose name appears in the text. */
export function namesOnNote(text: string, members: string[]): string[] {
  const t = flat(text)
  const out = new Set<string>()
  for (const m of t.matchAll(/\bName\s*[:：]\s*([A-Z][A-Za-z'’.\- ]{2,60}?)(?=\s*;|\s+(?:FIN|NRIC|Passport|Date of Birth|DOB|Relationship|Gender|Plan|Effective|Address)|$)/g)) {
    const n = m[1].trim()
    // A company on the note (the policyholder, the broker) is not a member.
    if (n && !/^TRADE RISK/i.test(n) && !/\b(PTE|LTD|LIMITED|LLP|INC|SDN|BHD|COMPANY|HOLDINGS|GROUP)\b/i.test(n)) out.add(n)
  }
  const low = t.toLowerCase()
  for (const name of members) {
    const k = name.trim().toLowerCase()
    if (k.length >= 6 && low.includes(k)) out.add(name.trim())
  }
  return Array.from(out).slice(0, 200)
}

export function readNoteText(text: string, source: string, members: string[] = []): NoteReadResult | null {
  const t = flat(text)
  // A note says so in its heading; a policy wording, schedule or quotation that mentions a premium is not one.
  if (!/credit note|debit note|tax invoice|total (amount )?(due|refund)/i.test(t.slice(0, 1500))) return null
  // The intermediary's commission statement travels with the client's note; it is not a note to the client.
  if (/commission (statement|refund|payable)|intermediary commission|brokerage/i.test(t) && !/total (amount )?(due|refund)/i.test(t)) return null
  const refund = /credit note|total (amount )?refund|refund premium/i.test(t) && !/debit note/i.test(t.split(/credit note/i)[0] ?? '')
  const kind: 'debit' | 'credit' = /credit note|total (amount )?refund/i.test(t) ? 'credit' : 'debit'
  const evidence: NoteReadResult['evidence'] = {}
  const totalM = /(Total (?:Amount )?(?:Refund|Due)(?: \(SGD\))?)[\s;:：]*(?:SGD\s*)?\$?\s*([\d,]+\.\d{2})/i.exec(t)
    ?? /(Total)[\s;:：]*(?:SGD\s*)?\$?\s*([\d,]+\.\d{2})/i.exec(t)
  const amount = money(totalM?.[2])
  if (totalM) evidence.amount = { excerpt: totalM[0], source }
  // "GST | : 9.00 | 10.40 |": the figures after GST up to the total, less the rate itself.
  const gstSeg = /GST([^]*?)(?=Total)/i.exec(t)?.[1] ?? ''
  const gstNums = Array.from(gstSeg.matchAll(/\d[\d,]*\.\d{2}/g)).map(m => m[0]).filter(n => !/^[789]\.00$/.test(n))
  const gst = gstNums.length ? money(gstNums[gstNums.length - 1]) : null
  const invNo = field(t, /Tax Invoice (?:Number|No\.?)/) ?? field(t, /(?:Credit|Debit) Note (?:Number|No\.?)/) ?? field(t, /Invoice (?:Number|No\.?)/)
  const policyNo = field(t, /Policy (?:Number|No\.?)/)
  const txn = field(t, /Transaction No\.?/)
  const note_no = invNo?.replace(/\s+/g, '') ?? (policyNo && txn ? `${policyNo.replace(/\s+/g, '')}/T${txn.replace(/\D/g, '')}` : null)
  if (note_no) evidence.note_no = { excerpt: (invNo ? `Tax Invoice Number ${invNo}` : `Policy No. ${policyNo} Transaction No ${txn}`), source }
  const issued = date(field(t, /Date of Issue/i) ?? field(t, /\bDate\b/) ?? undefined)
  if (issued) evidence.issued_on = { excerpt: `Date of Issue ${issued}`, source }
  const effective = date(field(t, /Effective Date/i) ?? undefined) ?? date(/with effect from\s+(\d{2}\/\d{2}\/\d{4})/i.exec(t)?.[1])
  const periodM = /Period of Insurance\s*[:：]?\s*(?:From\s+)?(\d{2}\/\d{2}\/\d{4})\s*(?:to|-|–)\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t)
  const member_names = namesOnNote(text, members)
  const paxM = /(?:Total Headcount|No\.? of (?:Lives|Members|Pax)|Headcount)\s*[:：]?\s*(\d{1,5})\s*(?:pax)?/i.exec(t)
  const pax = paxM ? Number(paxM[1]) : member_names.length || null
  if (paxM) evidence.pax = { excerpt: paxM[0], source }
  const event: NoteEvent = /endorsement|removed from the policy|added to the policy|with effect from|transaction no\s*[:：]?\s*[2-9]/i.test(t) && !/\brenewal\b/i.test(t.slice(0, 600)) ? 'endorsement'
    : /\brenewal\b/i.test(t) ? 'renewal' : /new business|transaction no\s*[:：]?\s*1\b/i.test(t) ? 'new_business' : 'unknown'
  const descM = /(?:the following Insured Person is (removed from|added to) the policy|(Addition|Deletion) of)/i.exec(t)
  const lines = Array.from(t.matchAll(/;\s*([A-Z][A-Za-z0-9 &'’()\-+]{3,60}?)\s*;\s*([\d,]+\.\d{2})\s*;/g)).map(m => m[1].trim()).filter(l => !/^(GST|Total|Sub-?Total|Discount|Gross Premium|Premium)$/i.test(l))
  const description = descM ? `${descM[1] ? `Insured person ${descM[1].toLowerCase()}` : descM[2]}${member_names.length ? `: ${member_names.join(', ')}` : ''}` : lines.length ? lines.join('; ').slice(0, 300) : null
  return {
    kind, event, note_no, issued_on: issued, effective_on: effective, period_start: date(periodM?.[1]), period_end: date(periodM?.[2]),
    amount, gst, currency: 'SGD', pax, member_names, description, evidence, needs_review: amount == null || !!(refund && kind !== 'credit'),
  }
}
