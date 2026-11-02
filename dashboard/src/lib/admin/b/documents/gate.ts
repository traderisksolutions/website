/**
 * The document register and the binding gate. Pure.
 *
 * Read on 2 Nov 2026 from Nathan's sent mail: he binds only when the file holds a signed and dated
 * proposal form (dated inside the 30 days before inception), the quote slip signed beside the
 * insurer's stamp, a letter of undertaking of nil claims when the start date is behind the
 * instruction, the client's instruction in an email to TRS, an appointment letter when another
 * intermediary is on risk, a no-change confirmation when the renewal lapsed, and for bonds the
 * deed of indemnity with the board resolution dated before it. requiredDocuments says which of
 * those a matter needs and why; detectReceived reads which have arrived from the case's files and
 * messages; gateState puts the two together.
 */
import { classifyByName, isNoise } from '@/lib/documents/taxonomy'

export type DocKind =
  | 'proposal_form' | 'quote_slip' | 'lou_nil_claims' | 'client_instruction' | 'broker_appointment' | 'no_change_confirmation'
  | 'deed_of_indemnity' | 'board_resolution' | 'counter_indemnity' | 'company_documents' | 'contract_requirements'
  | 'claim_form' | 'member_list'

export type OwedBy = 'client' | 'insurer' | 'trs' | 'partner'
export type DocStatus = 'needed' | 'requested' | 'received' | 'waived'

export type Required = { kind: DocKind; owedBy: OwedBy; basis: string }
export type Record_ = { kind: DocKind; status: DocStatus; filename?: string | null; received_at?: string | null; requested_at?: string | null; note?: string | null }

export const DOC_LABEL: Record<DocKind, string> = {
  proposal_form: 'Signed and dated proposal form',
  quote_slip: "Quote slip signed beside the insurer's stamp",
  lou_nil_claims: 'Letter of undertaking of nil claims',
  client_instruction: 'Your instruction to proceed, by email',
  broker_appointment: 'Letter of appointment on your letterhead',
  no_change_confirmation: 'Confirmation of no claims, circumstances or material change since expiry',
  deed_of_indemnity: 'Deed of indemnity, signed',
  board_resolution: 'Board resolution, dated before the deed of indemnity',
  counter_indemnity: 'Counter-indemnity from the company and each director',
  company_documents: 'ACRA profile and the last two years of audited accounts',
  contract_requirements: 'Letter of award and the bond wording or insurance requirement',
  claim_form: 'Claim form, signed and stamped',
  member_list: 'Member list with name, date of birth, FIN or NRIC and plan',
}

/** Kinds that count only once signed; an unsigned copy is not received. */
export const NEEDS_SIGNATURE = new Set<DocKind>(['proposal_form', 'quote_slip', 'lou_nil_claims', 'broker_appointment', 'deed_of_indemnity', 'board_resolution', 'counter_indemnity', 'claim_form'])

const FIN_LINES = new Set(['professional_indemnity', 'do', 'imi', 'cyber', 'medical_malpractice'])
const SLIP_LINES = new Set(['construction_car', 'general_liability', 'iar_fire', 'marine_cargo', 'stock_throughput', 'machinery_breakdown', 'electronic_equipment', 'environmental_liability', 'surety_bonds', 'commercial_vehicle', 'wica'])

export type GateContext = {
  caseType: string | null
  /** Product line slug as relay/intent.ts detectLine names it, or null. */
  line: string | null
  /** YYYY-MM-DD */
  today: string
  /** The cover's start date when known, and the day the client instructed. */
  startDate?: string | null
  instructedOn?: string | null
  /** The expiring policy's end date, for a renewal. */
  expiry?: string | null
  /** Another intermediary is on risk, so the insurer needs an appointment letter first. */
  otherBrokerOnRisk?: boolean
  /** First placement with this insurer or line for the client. */
  newBusiness?: boolean
}

const lt = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.slice(0, 10) < b.slice(0, 10)
const fmt = (iso: string) => { const d = new Date(iso.slice(0, 10) + 'T00:00:00Z'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) }

/** Pure. What this matter needs before it can be bound, and why. */
export function requiredDocuments(c: GateContext): Required[] {
  const out: Required[] = []
  const add = (kind: DocKind, basis: string, owedBy: OwedBy = 'client') => { if (!out.some(r => r.kind === kind)) out.push({ kind, owedBy, basis }) }
  const placement = c.caseType === 'new_quote' || c.caseType === 'renewal' || c.caseType === 'endorsement'
  if (placement) {
    add('client_instruction', 'Insurers bind on the client\'s written instruction, kept on file for audit.')
    const bond = c.line === 'surety_bonds'
    if (bond) {
      add('contract_requirements', 'The bond follows the wording and percentage in the contract.')
      add('company_documents', 'The surety underwrites the company before quoting.')
      add('deed_of_indemnity', 'The surety requires a deed of indemnity before issuing the bond.')
      add('board_resolution', 'The deed is valid only with a resolution passed and dated before it.')
      add('counter_indemnity', 'Counter-indemnity from the company and each director named in the quote.')
    } else {
      if (c.caseType === 'new_quote' || c.newBusiness || (c.line && FIN_LINES.has(c.line))) add('proposal_form', c.line && FIN_LINES.has(c.line) ? 'Financial lines are underwritten on a fresh proposal form each year, dated inside the 30 days before inception.' : 'New business is bound on a signed and dated proposal form.')
      if (c.line && SLIP_LINES.has(c.line)) add('quote_slip', 'The insurer issues on the slip signed next to its stamp.')
    }
    const anchor = c.instructedOn ?? c.today
    if (c.startDate && lt(c.startDate, anchor)) add('lou_nil_claims', `Cover starts ${fmt(c.startDate)}, before the instruction of ${fmt(anchor)}; insurers backdate only against a letter of undertaking of nil claims.`)
    if (c.caseType === 'renewal' && c.expiry && lt(c.expiry, c.today)) add('no_change_confirmation', `The policy expired on ${fmt(c.expiry)}; the insurer renews from expiry only with written confirmation of no claims, circumstances or material change.`)
    if (c.otherBrokerOnRisk) add('broker_appointment', 'Another intermediary is on risk; the insurer acts for TRS only on the client\'s appointment letter.')
  }
  if (c.caseType === 'claim') add('claim_form', 'The insurer registers the claim on its signed and stamped form.')
  if (c.caseType === 'member_movement') add('member_list', 'The insurer endorses members from the list, not from the email.')
  return out
}

export type GateState = { complete: boolean; missing: Required[]; received: DocKind[]; waived: DocKind[] }

/** Pure. The gate: every required document is received or waived. */
export function gateState(required: Required[], records: Record_[]): GateState {
  const by = new Map(records.map(r => [r.kind, r]))
  const received = required.filter(r => by.get(r.kind)?.status === 'received').map(r => r.kind)
  const waived = required.filter(r => by.get(r.kind)?.status === 'waived').map(r => r.kind)
  const missing = required.filter(r => !received.includes(r.kind) && !waived.includes(r.kind))
  return { complete: missing.length === 0, missing, received, waived }
}

export type CaseEvidence = {
  messages: { id: string; side: 'trs' | 'insurer' | 'client'; text: string; sent_at: string | null; files: string[] }[]
}

const SIGNED = /\b(signed|duly signed|executed|stamped|countersigned)\b/i
const NAME: [RegExp, DocKind][] = [
  [/(letter.?of.?undertaking|\blou\b|nil.?claims?|no.?known.?(loss|claims?)|known.?event)/i, 'lou_nil_claims'],
  [/(deed.?of.?indemnity|\bdoi\b)/i, 'deed_of_indemnity'],
  [/(board|directors?'?).?resolution/i, 'board_resolution'],
  [/counter.?indemnit/i, 'counter_indemnity'],
  [/(letter.?of.?(broker.?)?appointment|broker.?of.?record|\bborl?\b)/i, 'broker_appointment'],
  [/(quote|quotation).?slip|placement.?slip|\bslip\b/i, 'quote_slip'],
  [/claim.?form/i, 'claim_form'],
]
const NO_CHANGE = /\b(no (?:claims?|circumstances?|material changes?|changes?)(?: (?:or|and|,) (?:claims?|circumstances?|material changes?|changes?))*(?: to (?:declare|report|the risk))?|nothing to declare|unchanged)\b/i

/** Pure. Which required documents the case's own messages and files already carry, and from which message. */
export function detectReceived(required: Required[], ev: CaseEvidence, instructionMessageId: string | null = null): { kind: DocKind; message_id: string; filename: string | null; at: string | null }[] {
  const want = new Set(required.map(r => r.kind))
  const out: { kind: DocKind; message_id: string; filename: string | null; at: string | null }[] = []
  const seen = new Set<DocKind>()
  const take = (kind: DocKind, m: { id: string; sent_at: string | null }, filename: string | null) => { if (want.has(kind) && !seen.has(kind)) { seen.add(kind); out.push({ kind, message_id: m.id, filename, at: m.sent_at }) } }
  for (const m of ev.messages) {
    if (m.side !== 'client') continue
    const signedInText = SIGNED.test(m.text)
    for (const f of m.files) {
      if (isNoise(f)) continue
      const named = NAME.find(([re]) => re.test(f))?.[1] ?? null
      const slug = classifyByName(f)
      let kind: DocKind | null = named
      if (!kind && slug === 'proposal_form') kind = 'proposal_form'
      if (!kind && slug === 'quotation' && (SIGNED.test(f) || signedInText)) kind = 'quote_slip'
      if (!kind && slug === 'broker_appointment') kind = 'broker_appointment'
      if (!kind && slug === 'bond' && /counter/i.test(f)) kind = 'counter_indemnity'
      if (!kind && (slug === 'member_list' || slug === 'member_movement')) kind = 'member_list'
      if (!kind && slug === 'company_documents') kind = 'company_documents'
      if (!kind && slug === 'contract_requirements') kind = 'contract_requirements'
      if (!kind && slug === 'claim' && /form/i.test(f)) kind = 'claim_form'
      if (!kind) continue
      if (NEEDS_SIGNATURE.has(kind) && !SIGNED.test(f) && !signedInText) continue
      take(kind, m, f)
    }
    if (NO_CHANGE.test(m.text)) take('no_change_confirmation', m, null)
    if (instructionMessageId && m.id === instructionMessageId) take('client_instruction', m, null)
  }
  return out
}

/** Pure. The ask for the missing items, numbered, in the client's terms. */
export function missingLines(missing: Required[]): string[] {
  return missing.map(r => DOC_LABEL[r.kind])
}
