/**
 * Follow-ups: which sent emails wait on a reply, what type they are (for the report), and when
 * to chase. Pure. Tested in src/__tests__/followups.test.ts.
 *
 * Defaults are Nathan's cadence (src/lib/admin/b/cadence.ts): an insurer is chased after 5
 * working days, a client after 7 calendar days, three chases then a call. A person changes the
 * schedule, or turns it off, when approving the email on Today.
 */
export const EMAIL_TYPES = ['request_for_quote', 'quote_to_client', 'docs_request', 'endorsement_request', 'claim', 'billing', 'renewal', 'policy_docs', 'chase', 'acknowledgement', 'other'] as const
export type EmailType = typeof EMAIL_TYPES[number]
export type Party = 'insurer' | 'client' | 'other'

export const TYPE_LABEL: Record<EmailType, string> = {
  request_for_quote: 'Request for quote', quote_to_client: 'Quote or comparison to client', docs_request: 'Documents requested',
  endorsement_request: 'Endorsement or member change', claim: 'Claim', billing: 'Billing and payment', renewal: 'Renewal',
  policy_docs: 'Policy documents sent', chase: 'Chase', acknowledgement: 'Acknowledgement', other: 'Other',
}

/** Draft kinds the agents write, mapped to a type without reading the text. */
const BY_KIND: Record<string, EmailType> = {
  request_quote_data: 'docs_request', request_missing: 'docs_request', request_documents: 'docs_request', renewal_notice: 'renewal',
  request_claims_report: 'renewal', chase_insurer: 'chase', chase_client: 'chase', followup_chase: 'chase', forward_to_insurer: 'other',
  client_ack: 'acknowledgement', client_update: 'other', adjuster_access: 'claim', settlement_pack: 'claim',
}

/** The email's own words: cut at the quoted history, signature disclaimers left behind. */
export function ownText(body: string | null): string {
  const t = String(body ?? '').replace(/\r/g, '')
  const i = t.search(/\n\s*(From:\s|-----Original|On .{5,120}wrote:|_{10,}|Sent from my)/)
  return (i > 0 ? t.slice(0, i) : t).slice(0, 2000)
}

/** Pure. The type of one sent email, from the draft kind when an agent wrote it, else its subject, then its own words. */
export function classify(e: { subject: string | null; body: string | null; party: Party; draftKind?: string | null }): EmailType {
  if (e.draftKind && BY_KIND[e.draftKind]) return BY_KIND[e.draftKind]
  const s = (e.subject ?? '').toLowerCase().replace(/^((re|fw|fwd)\s*:\s*|\[external\]\s*)+/g, '')
  const b = ownText(e.body).toLowerCase()
  const noClaim = (t: string) => t.replace(/no[- ]claims?( discount| declaration| bonus)?|claims? (history|experience|ratio|record|free)/g, '')
  if (/\b(following up|just checking in|any update|kind reminder|gentle reminder|may i check on (my|our) (email|request))\b/.test(b) || /^(follow.?up|chase|reminder)/.test(s)) return 'chase'
  if (/debit note|tax invoice|\binvoice\b|statement of account|\bsoa\b|remittance|credit note|payment (advice|reminder)|premium (due|outstanding)/.test(s)) return 'billing'
  if (/\bclaims?\b|loss adjuster|accident|incident|demise|discharge voucher/.test(noClaim(s))) return 'claim'
  if (/renewal/.test(s)) return 'renewal'
  if (/endorse|member movement|addition|deletion|enrol|member listing|headcount|change of (vehicle|address|name|plate)|transfer of (ncd|no.claim)/.test(s)) return 'endorsement_request'
  if (/debit note|tax invoice|\binvoice\b|remittance|payment (has been|was) made|outstanding premium/.test(b)) return 'billing'
  if (/claim form|loss adjuster|discharge voucher|claim (no|number|ref)/.test(noClaim(b))) return 'claim'
  if (e.party === 'insurer' && /\b(quot|rfq|request for (quotation|terms)|keen to (quote|write)|indication|terms for|risk you would be keen)/.test(`${s}\n${b}`)) return 'request_for_quote'
  if (e.party === 'client' && /comparison|quotation|quotes? (from|comparison)|options? (for|below)|premium (of|is)|terms (from|below)/.test(`${s}\n${b}`)) return 'quote_to_client'
  if (/(attached|enclosed|please find).{0,60}(policy (document|schedule|wording)|cover note|certificate)/.test(b) && !/\?/.test(b)) return 'policy_docs'
  if (/may (we|i) (have|request|kindly)|please (provide|send|share|complete)|kindly (provide|send|share|complete)|could you (provide|send|share)|proposal form|following (information|documents)/.test(b)) return 'docs_request'
  if (/^(dear [^,\n]+,\s*)?(thank|thanks|noted|well received|received with thanks)/.test(b.trim())) return 'acknowledgement'
  return 'other'
}

/** Pure. Whether the email waits on an answer: types that ask something, or any email with a question. */
export function expectsReply(type: EmailType, body: string | null): boolean {
  if (type === 'policy_docs' || type === 'acknowledgement') return false
  if (type === 'other') return /\?/.test(ownText(body))
  return true
}

export type Schedule = { firstAfterDays: number; everyDays: number; workingDays: boolean; maxChases: number }

/** Pure. The default chase schedule for a party and type. */
export function defaultSchedule(party: Party, type: EmailType): Schedule {
  if (party === 'insurer') return { firstAfterDays: type === 'request_for_quote' ? 3 : 5, everyDays: 5, workingDays: true, maxChases: 3 }
  if (type === 'quote_to_client') return { firstAfterDays: 5, everyDays: 5, workingDays: true, maxChases: 3 }
  return { firstAfterDays: 7, everyDays: 7, workingDays: false, maxChases: 3 }
}

/** Pure. A date plus n days, counting only weekdays when asked. */
export function addDays(fromIso: string, n: number, working: boolean): string {
  const d = new Date(fromIso)
  if (!working) { d.setUTCDate(d.getUTCDate() + n); return d.toISOString() }
  let left = n
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left-- }
  return d.toISOString()
}

/** Pure. The chase email: one line, one ask, reply on the same thread, as Nathan chases. */
export function chaseText(f: { party: Party; round: number; subject: string | null; sentAt: string; greeting: string | null }): { subject: string; body: string } {
  const when = new Date(f.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
  const what = (f.subject ?? '').replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim() || 'my earlier email'
  const ask = f.party === 'insurer'
    ? (f.round <= 1 ? `May I check on my email of ${when} on ${what}?` : f.round === 2 ? `Following up on ${what}, sent on ${when}. Our client is chasing on this.` : `Following up again on ${what}. If you are not able to help on this, do let us know so that we can update the client.`)
    : (f.round <= 1 ? `Following up on my email of ${when} on ${what}. When convenient, could you let us have your reply so that we can proceed?` : f.round === 2 ? `Following up again on ${what}. Do let us know if anything on our side would help.` : `Following up once more on ${what}. If easier, I am happy to take a call at {owner_phone}.`)
  const s = (f.subject ?? '').trim()
  return { subject: /^re:/i.test(s) ? s : `Re: ${s || what}`, body: `Dear ${f.greeting?.trim() || 'Sir/Madam'},\n\n${ask}\n\nThank you!\n\nBest regards,\n{owner_name}\nTrade Risk Solutions` }
}
