/**
 * The words of the relay drafts. Pure, no model. Each kind is one onward email on a case:
 * short, courteous, TRS's tone, signed "{owner_name}" so approving fills in the approver's name.
 * A draft carries only what the case holds; a figure the mail did not state is left out.
 */
import { replySubject } from '../drafts'
import { termsRows, type QuoteTerms } from './terms'

export type RelayKind =
  | 'forward_quote_request' | 'forward_documents' | 'forward_instruction' | 'forward_question'
  | 'request_info' | 'answer_question' | 'document_send' | 'status_update' | 'ack_client'
  | 'relay_quote' | 'relay_decline' | 'relay_documents' | 'relay_decision' | 'relay_question' | 'ack_insurer'

/** How the autonomy ladder groups drafts: an ack can earn auto-send long before a relay can. */
export type DraftClass = 'ack' | 'forward' | 'relay' | 'answer' | 'request' | 'status'

export const CLASS_OF: Record<RelayKind, DraftClass> = {
  forward_quote_request: 'forward', forward_documents: 'forward', forward_instruction: 'forward', forward_question: 'forward',
  request_info: 'request', answer_question: 'answer', document_send: 'relay', status_update: 'status', ack_client: 'ack',
  relay_quote: 'relay', relay_decline: 'relay', relay_documents: 'relay', relay_decision: 'relay', relay_question: 'relay', ack_insurer: 'ack',
}

export const PARTY_OF: Record<RelayKind, 'client' | 'insurer'> = {
  forward_quote_request: 'insurer', forward_documents: 'insurer', forward_instruction: 'insurer', forward_question: 'insurer', ack_insurer: 'insurer',
  request_info: 'client', answer_question: 'client', document_send: 'client', status_update: 'client', ack_client: 'client',
  relay_quote: 'client', relay_decline: 'client', relay_documents: 'client', relay_decision: 'client', relay_question: 'client',
}

/** The draft that goes out with this one so the other side hears too. */
export function relayPairFor(kind: RelayKind): RelayKind | null {
  switch (kind) {
    case 'forward_quote_request': case 'forward_documents': case 'forward_instruction': case 'forward_question': return 'ack_client'
    case 'relay_quote': case 'relay_decision': return 'ack_insurer'
    default: return null
  }
}

export type Original = { from: string; sent_at: string | null; subject: string | null; text: string }

export type RelayFacts = {
  greetingName: string | null
  clientName: string | null
  insurerName: string | null
  /** Insurers approached, for the client acknowledgement of a quote request. */
  insurersApproached?: string[]
  lineLabel: string | null
  policyNumber: string | null
  className: string | null
  periodFrom?: string | null
  periodTo?: string | null
  threadSubject: string | null
  title: string
  original?: Original | null
  files?: string[]
  /** request_info: what is still needed. */
  missing?: string[]
  /** relay_question: what the insurer asked, as listed. */
  asks?: string[]
  /** relay_quote */
  terms?: QuoteTerms | null
  /** relay_decline / relay_decision: the insurer's own words. */
  quoted?: string | null
  /** answer_question: facts on file, each with where it came from. */
  answers?: { fact: string; source: string }[]
  /** status_update */
  status?: string | null
  waitingOn?: string | null
  lastSent?: string | null
  nextAction?: string | null
}

const SIGN = 'Best regards,\n{owner_name}\nTrade Risk Solutions'
const fmt = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const quoted = (o: Original | null | undefined) => o ? [
  '---------- Forwarded message ----------', `From: ${o.from}`, o.sent_at ? `Date: ${fmt(o.sent_at)}` : null, o.subject ? `Subject: ${o.subject}` : null, '', o.text.trim(),
].filter(l => l !== null).join('\n') : ''
const attached = (files: string[] | undefined) => files?.length ? `\nAttached: ${files.join(', ')}.\n` : ''
const policyRef = (f: RelayFacts) => [f.className, f.policyNumber ? `Policy No. ${f.policyNumber}` : null].filter(Boolean).join(', ')

export function composeRelay(kind: RelayKind, f: RelayFacts): { subject: string; body: string } {
  const hi = `Dear ${f.greetingName?.trim() || 'Sir/Madam'},`
  const client = f.clientName ?? 'our client'
  const line = f.lineLabel ?? f.className ?? 'insurance'
  switch (kind) {
    case 'forward_quote_request':
      return {
        subject: `(TRS) ${f.insurerName ?? ''} - ${client} | ${line}`.replace(/\(TRS\)  - /, '(TRS) ').slice(0, 200),
        body: `Dear ${f.greetingName?.trim() || 'Underwriting Team'},\n\nWe would be grateful for your terms for ${line} for our client ${client}. The client's request is below${(f.files ?? []).length ? ' and the supporting documents are attached' : ''}.\n${attached(f.files)}\nPlease let us have your quotation, or let us know what further information you need.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'forward_documents':
      return {
        subject: replySubject(f.threadSubject, `${client} | ${f.title}`),
        body: `${hi}\n\nPlease find attached the documents from our client ${client} on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}.\n${attached(f.files)}\nPlease proceed and let us know if anything further is required.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'forward_instruction':
      return {
        subject: replySubject(f.threadSubject, `${client} | ${f.title}: instruction`),
        body: `${hi}\n\nOur client ${client} has instructed us to proceed on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}; their confirmation is below${(f.files ?? []).length ? ' and the signed documents are attached' : ''}.\n${attached(f.files)}\nPlease proceed and let us have the policy documents and your invoice.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'forward_question':
      return {
        subject: replySubject(f.threadSubject, `${client} | ${f.title}: query`),
        body: `${hi}\n\nOur client ${client} has raised the query below on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}.\n\nPlease let us have your reply so that we can revert to the client.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'request_info': {
      const items = (f.missing ?? []).map(i => `- ${i}`).join('\n')
      return {
        subject: replySubject(f.threadSubject, `${f.title}: information needed`),
        body: `${hi}\n\nThank you for your request on ${line}. To obtain terms from the insurers we still need:\n${items}\n\nPlease send them in reply to this email and we will approach the market the same day.\n\n${SIGN}`,
      }
    }
    case 'answer_question': {
      const facts = (f.answers ?? []).map(a => `- ${a.fact} (${a.source})`).join('\n')
      return {
        subject: replySubject(f.threadSubject, `${f.title}: your query`),
        body: `${hi}\n\nThank you for your query on ${policyRef(f) || line}.\n\nFrom the policy on file:\n${facts}\n${(f.files ?? []).length ? `\nThe ${f.files!.length === 1 ? 'document' : 'documents'} setting this out ${f.files!.length === 1 ? 'is' : 'are'} attached: ${f.files!.join(', ')}.\n` : ''}\nPlease let us know if you would like us to confirm any point with ${f.insurerName ?? 'the insurer'}.\n\n${SIGN}`,
      }
    }
    case 'document_send':
      return {
        subject: replySubject(f.threadSubject, `${policyRef(f) || f.title}: documents`),
        body: `${hi}\n\nPlease find attached the ${f.files?.length === 1 ? 'document' : 'documents'} you requested for ${policyRef(f) || line}${f.periodFrom && f.periodTo ? ` (${fmt(f.periodFrom)} to ${fmt(f.periodTo)})` : ''}.\n${attached(f.files)}\n${SIGN}`,
      }
    case 'status_update': {
      const where = f.waitingOn === 'insurer' ? `We are waiting for ${f.insurerName ?? 'the insurer'} to revert${f.lastSent ? `; we last wrote to them on ${fmt(f.lastSent)} and have followed up today` : ' and have followed up today'}.`
        : f.nextAction ? `The next step on our side is: ${f.nextAction}.` : 'We are working on it and will revert shortly.'
      return {
        subject: replySubject(f.threadSubject, `${f.title}: status`),
        body: `${hi}\n\nThank you for following up on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}.\n\n${where}\n\nWe will update you as soon as we hear.\n\n${SIGN}`,
      }
    }
    case 'ack_client': {
      const who = f.insurersApproached?.length ? f.insurersApproached.join(', ') : f.insurerName ?? 'the insurer'
      return {
        subject: replySubject(f.threadSubject, `${f.title}: received`),
        body: `${hi}\n\nThank you. We have passed this to ${who} today and will revert once they reply.\n\n${SIGN}`,
      }
    }
    case 'ack_insurer':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: received`),
        body: `${hi}\n\nThank you, received. We are reverting to the client and will come back to you with their instructions.\n\n${SIGN}`,
      }
    case 'relay_quote': {
      const rows = f.terms ? termsRows(f.terms) : []
      const table = rows.length ? `\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n` : ''
      return {
        subject: replySubject(f.threadSubject, `${line}: terms from ${f.insurerName ?? 'the insurer'}`),
        body: `${hi}\n\nWe have received terms from ${f.insurerName ?? 'the insurer'} for ${line}${rows.length ? ', summarised below' : ''}.\n${table}${attached(f.files)}\nPlease review and let us know if you would like to proceed, or if you have any questions on the terms.\n\n${SIGN}`,
      }
    }
    case 'relay_decline':
      return {
        subject: replySubject(f.threadSubject, `${line}: ${f.insurerName ?? 'insurer'} response`),
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has declined to offer terms for ${line}${f.quoted ? `, stating:\n\n"${f.quoted.trim()}"` : '.'}\n\nWe are approaching the other markets and will revert with any terms received.\n\n${SIGN}`,
      }
    case 'relay_documents':
      return {
        subject: replySubject(f.threadSubject, `${policyRef(f) || f.title}: documents`),
        body: `${hi}\n\nPlease find attached the ${f.files?.length === 1 ? 'document' : 'documents'} issued by ${f.insurerName ?? 'the insurer'} for ${policyRef(f) || f.title}.\n${attached(f.files)}\nPlease keep them for your records and let us know if anything needs correcting.\n\n${SIGN}`,
      }
    case 'relay_decision':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: update from ${f.insurerName ?? 'the insurer'}`),
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has responded on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}${f.quoted ? `:\n\n"${f.quoted.trim()}"` : '.'}\n${attached(f.files)}\nPlease let us know how you would like to proceed, and we will respond to the insurer accordingly.\n\n${SIGN}`,
      }
    case 'relay_question': {
      const items = (f.asks ?? []).map(a => `- ${a}`).join('\n')
      return {
        subject: replySubject(f.threadSubject, `${f.title}: information requested by ${f.insurerName ?? 'the insurer'}`),
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has asked for the following on ${f.title}${policyRef(f) ? ` (${policyRef(f)})` : ''}:\n${items || (f.quoted ? `\n"${f.quoted.trim()}"` : '')}\n\nPlease send the details in reply to this email and we will pass them on.\n\n${SIGN}`,
      }
    }
  }
}
