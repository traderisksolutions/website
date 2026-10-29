/**
 * The documents of a commercial insurance policy, from the request to the renewal, and the rules
 * that say which a policy should have. Built from the 2,338 documents in the TRS email bank
 * (29 Oct 2026): proposal forms 256, debit notes 172, member lists 113, schedules 94, renewal
 * notices 88, quotations 81, claims 65, contract requirements 60, wordings 57, letters of
 * appointment 47 — then cover notes, certificates, bonds, credit notes and payment advice.
 *
 * Pure: no I/O, so the rules can be tested and reused on the server and in the browser.
 */

export const DOC_GROUPS = ['Placement', 'Cover', 'Billing', 'Members', 'Claims', 'Renewal', 'Other'] as const
export type DocGroup = typeof DOC_GROUPS[number]

export type DocTypeDef = {
  slug: string
  label: string
  group: DocGroup
  /** Who usually sends it. */
  from: 'client' | 'insurer' | 'trs' | 'any'
  /** Filename patterns, most specific types first in DOC_TYPES. */
  name: RegExp[]
}

export const DOC_TYPES: DocTypeDef[] = [
  // Order is precedence: the first type whose pattern matches wins, so specific names come first.
  { slug: 'credit_note',        label: 'Credit note',            group: 'Billing',   from: 'insurer', name: [/credit.?note/i, /\bcn[\s_-]?\d/i] },
  { slug: 'trs_debit_note',     label: 'TRS debit note',         group: 'Billing',   from: 'trs',     name: [/\btrs[\s_-]*dn/i] },
  { slug: 'insurer_debit_note', label: 'Insurer debit note',     group: 'Billing',   from: 'insurer', name: [/debit.?note/i, /\bdn[\s_-]?\d/i, /tax.?invoice/i, /premium.?(notice|invoice)/i, /\binvoice\b/i] },
  { slug: 'payment_advice',     label: 'Payment advice',         group: 'Billing',   from: 'any',     name: [/payment.?(advice|instruction|receipt)/i, /remittance/i, /\breceipt\b/i] },
  { slug: 'cover_note',         label: 'Cover note',             group: 'Cover',     from: 'insurer', name: [/cover.?note/i, /hold.?cover/i, /binder/i, /confirmation.?of.?(cover|insurance)/i, /interim.?cover/i] },
  { slug: 'endorsement',        label: 'Endorsement',            group: 'Cover',     from: 'insurer', name: [/endorse/i, /\bendt\b/i] },
  { slug: 'certificate',        label: 'Certificate',            group: 'Cover',     from: 'insurer', name: [/certificate/i, /\bcoi\b/i, /\bcert\b/i] },
  { slug: 'policy_wording',     label: 'Policy wording',         group: 'Cover',     from: 'insurer', name: [/wording/i, /policy.?(contract|document|booklet|jacket)/i, /terms.?and.?conditions/i] },
  { slug: 'claims_history',     label: 'Claims history',         group: 'Placement', from: 'any',     name: [/loss.?run/i, /claims?.?(history|experience|record|listing)/i, /no.?claims?.?declaration/i] },
  { slug: 'claim',              label: 'Claim document',         group: 'Claims',    from: 'any',     name: [/claim/i, /police.?report/i, /discharge/i, /medical.?report/i, /incident/i] },
  { slug: 'proposal_form',      label: 'Proposal form',          group: 'Placement', from: 'client',  name: [/proposal.?form/i, /application.?form/i, /questionnaire/i, /declaration.?form/i, /\bmas.?314\b/i] },
  { slug: 'benefit_summary',    label: 'Benefit summary',        group: 'Cover',     from: 'insurer', name: [/benefit/i, /summary.?of.?cover/i, /\btob\b/i, /brochure/i, /user.?guide/i] },
  { slug: 'member_movement',    label: 'Member movement',        group: 'Members',   from: 'client',  name: [/movement/i, /\baddition/i, /\bdeletion/i, /\bjoiners?\b/i, /\bleavers?\b/i] },
  { slug: 'member_list',        label: 'Member list',            group: 'Members',   from: 'client',  name: [/census/i, /name.?list/i, /member.?(list|listing)/i, /employee.?(list|breakdown|data)/i, /headcount/i] },
  { slug: 'quotation',          label: 'Quotation',              group: 'Placement', from: 'insurer', name: [/quot/i, /\bquote\b/i, /indication/i, /term.?sheet/i, /proposal.?summary/i] },
  { slug: 'renewal_notice',     label: 'Renewal notice',         group: 'Renewal',   from: 'insurer', name: [/renewal.?(notice|instruction|invitation|terms|offer)/i] },
  { slug: 'policy_schedule',    label: 'Policy schedule',        group: 'Cover',     from: 'insurer', name: [/schedule/i, /\bsch[\s_-]/i] },
  { slug: 'broker_appointment', label: 'Letter of appointment',  group: 'Placement', from: 'client',  name: [/letter.?of.?(broker.?)?appointment/i, /broker.?of.?record/i, /\bbor\b/i, /letter.?of.?authori[sz]ation/i] },
  { slug: 'bond',               label: 'Bond or guarantee',      group: 'Cover',     from: 'insurer', name: [/\bbond\b/i, /guarantee/i, /counter.?indemnity/i] },
  { slug: 'contract_requirements', label: 'Contract requirements', group: 'Placement', from: 'client', name: [/contract/i, /tender/i, /prelim/i, /\bloa\b/i, /letter.?of.?(award|acceptance)/i, /insurance.?requirement/i, /\bboq\b/i, /appendix/i] },
  { slug: 'company_documents',  label: 'Company documents',      group: 'Placement', from: 'client',  name: [/financial/i, /\bacra\b/i, /bizfile/i, /annual.?report/i, /audited/i, /business.?profile/i, /balance.?sheet/i] },
  { slug: 'survey',             label: 'Survey or risk report',  group: 'Placement', from: 'any',     name: [/survey/i, /risk.?(report|assessment)/i, /inspection/i] },
  { slug: 'other',              label: 'Other',                  group: 'Other',     from: 'any',     name: [] },
]

/** Words that mean something only when nothing more specific matched. */
const FALLBACK: [RegExp, string][] = [
  [/\bproposal\b|\bform\b/i, 'proposal_form'],
  [/\brenewal\b/i, 'renewal_notice'],
  [/\bpolicy\b/i, 'policy_schedule'],
]

export const DOC_TYPE_BY_SLUG: Record<string, DocTypeDef> = Object.fromEntries(DOC_TYPES.map(t => [t.slug, t]))
export const docLabel = (slug: string | null | undefined): string => DOC_TYPE_BY_SLUG[slug ?? '']?.label ?? 'Other'
export const docGroup = (slug: string | null | undefined): DocGroup => DOC_TYPE_BY_SLUG[slug ?? '']?.group ?? 'Other'
export const isDocType = (v: unknown): v is string => typeof v === 'string' && v in DOC_TYPE_BY_SLUG

/** Files that are never a document: signature logos, inline images, calendar invites. */
export function isNoise(filename: string, mimeType?: string | null): boolean {
  const f = filename.trim()
  if (/^(image\d*|outlook-|logo|inline_image|noname|signature|~wrd)/i.test(f)) return true
  if (/\.(png|jpe?g|gif|bmp|ics|vcf|eml|html?)$/i.test(f) && !/(claim|receipt|invoice|scan|cert|nric|passport|bill)/i.test(f)) return true
  if (mimeType && /^image\//i.test(mimeType) && !/(claim|receipt|invoice|scan|cert|nric|passport|bill)/i.test(f)) return true
  return false
}

/** The document type a filename says, or null when it says nothing a rule can trust. */
export function classifyByName(filename: string): string | null {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ')
  for (const t of DOC_TYPES) if (t.name.some(re => re.test(base))) return t.slug
  for (const [re, slug] of FALLBACK) if (re.test(base)) return slug
  return null
}

// ── What a policy should hold ───────────────────────────────────────────────────────────────

export type PolicyFacts = {
  /** policies.lifecycle */
  lifecycle: string
  is_eb: boolean
  product_line: string | null
}

export type Requirement = { slug: string; label: string; /** any of these slugs satisfies it */ anyOf: string[] }

const req = (label: string, ...anyOf: string[]): Requirement => ({ slug: anyOf[0], label, anyOf })

/** Liability lines are placed on a proposal form and the client's claims record. */
const NEEDS_CLAIMS_HISTORY = new Set(['pi', 'professional_indemnity', 'd_o', 'dao', 'cyber', 'general_liability', 'public_liability', 'product_liability', 'medical_malpractice'])

/**
 * The documents a policy at this point of its life should have on file. A quoting line needs what
 * the market asks for; a bound one needs proof of cover and TRS's debit note; a live one needs the
 * schedule and wording as well. Employment benefits always need the member list.
 */
export function requiredDocs(p: PolicyFacts): Requirement[] {
  const out: Requirement[] = []
  const quoting = p.lifecycle === 'quoting' || p.lifecycle === 'presented'
  const bound = p.lifecycle === 'bound'
  const live = p.lifecycle === 'live' || p.lifecycle === 'renewal_due'
  if (quoting || bound || live) out.push(req('Proposal form', 'proposal_form'))
  if (p.is_eb) out.push(req('Member list', 'member_list', 'member_movement'))
  if (!p.is_eb && NEEDS_CLAIMS_HISTORY.has(p.product_line ?? '') && (quoting || bound || live)) out.push(req('Claims history', 'claims_history'))
  if (quoting) out.push(req('Quotation', 'quotation'))
  if (bound) out.push(req('Cover note or schedule', 'cover_note', 'policy_schedule'))
  if (bound || live) out.push(req('TRS debit note', 'trs_debit_note'))
  if (live) {
    // An employment-benefits policy's schedule is usually its schedule of benefits.
    out.push(p.is_eb ? req('Policy schedule', 'policy_schedule', 'benefit_summary') : req('Policy schedule', 'policy_schedule'))
    out.push(req('Policy wording', 'policy_wording'))
  }
  if (p.lifecycle === 'renewal_due') out.push(req('Renewal notice', 'renewal_notice'))
  return out
}

export type DataRoomState = 'complete' | 'pending' | 'none'
export type DataRoomStatus = { state: DataRoomState; have: string[]; missing: Requirement[]; total: number }

/** What a policy has against what it needs. "none" = nothing is required at this lifecycle. */
export function dataRoomStatus(p: PolicyFacts, docTypes: string[]): DataRoomStatus {
  const need = requiredDocs(p)
  const held = new Set(docTypes)
  const missing = need.filter(r => !r.anyOf.some(s => held.has(s)))
  return {
    state: need.length === 0 ? 'none' : missing.length === 0 ? 'complete' : 'pending',
    have: need.filter(r => r.anyOf.some(s => held.has(s))).map(r => r.slug),
    missing,
    total: need.length,
  }
}

// ── Drive layout ────────────────────────────────────────────────────────────────────────────

const clean = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim()

/** "2026–27 Goods in Transit · Great Eastern General" — the policy's folder under Policies/. */
export function policyFolderName(p: { label?: string | null; class_of_insurance?: string | null; insurer?: string | null; policy_number?: string | null; start_date?: string | null }): string {
  const y = p.start_date && /^\d{4}/.test(p.start_date) ? Number(p.start_date.slice(0, 4)) : null
  const span = y ? `${y}–${String((y + 1) % 100).padStart(2, '0')} ` : ''
  const what = clean(p.label || p.class_of_insurance || 'Policy')
  const who = p.insurer ? ` · ${clean(p.insurer)}` : ''
  const no = p.policy_number ? ` (${clean(p.policy_number)})` : ''
  return clean(`${span}${what}${who}${no}`).slice(0, 120)
}

/** "2026-10-28 Cover note · Great Eastern · Confirmation Hold Cover - KAI ASSOCIATES.pdf" */
export function documentFileName(d: { received_at?: string | null; doc_type: string; insurer_name?: string | null; filename: string }): string {
  const date = (d.received_at ?? '').slice(0, 10)
  const ext = /\.[a-z0-9]{2,5}$/i.exec(d.filename)?.[0] ?? ''
  const stem = clean(d.filename.slice(0, d.filename.length - ext.length))
  const parts = [date, docLabel(d.doc_type), d.insurer_name ? clean(d.insurer_name) : null, stem].filter(Boolean)
  return `${parts.join(' · ').slice(0, 180)}${ext.toLowerCase()}`
}
