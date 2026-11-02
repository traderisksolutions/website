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
  deadline?: string | null
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
/** The other side's words, verbatim, between QUOTE and UNQUOTE, as Nathan relays them. */
export const quoteBlock = (text: string | null | undefined) => { const t = String(text ?? '').trim(); return t ? `QUOTE\n${t}\nUNQUOTE` : '' }
/** "1. …" lines, so the answers can come back against the same numbers. */
export const numbered = (items: string[]) => items.map((a, i) => `${i + 1}. ${a.replace(/^\s*(?:\d{1,2}[.)]|[-•*–])\s+/, '')}`).join('\n')
/** True when a text already carries numbered answers ("1. …", "2. …"). */
export const hasNumbering = (text: string | null | undefined) => (String(text ?? '').match(/^\s*\d{1,2}[.)]\s+\S/gm) ?? []).length >= 2
const policyRef = (f: RelayFacts) => [f.className, f.policyNumber ? `Policy No. ${f.policyNumber}` : null].filter(Boolean).join(', ')
/** The reference after a title, unless the title already carries the policy number. */
const refAfter = (f: RelayFacts) => { const r = policyRef(f); return r && !(f.policyNumber && f.title.includes(f.policyNumber)) ? ` (${r})` : '' }

/** The client-facing name of the matter: the thread's subject, not the internal case title. */
export function matterOf(f: Pick<RelayFacts, 'threadSubject' | 'title'>): string {
  const s = String(f.threadSubject ?? '').replace(/^(\s*(re|fw|fwd|aw)\s*:\s*)+/i, '').replace(/^\(TRS\)\s*/i, '').replace(/\s+/g, ' ').trim()
  return s.length >= 8 ? s : f.title
}

/** "Great Eastern General Insurance Ltd (fronting cedant); facultative reinsurers X and Y" → "Great Eastern General Insurance Ltd". */
export function leadInsurer(raw: string): string {
  const first = raw.split(/;|\band\b|,/)[0].replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  return first.length >= 3 ? first.slice(0, 80) : raw.slice(0, 80)
}

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
        body: `${hi}\n\nPlease find attached the documents from our client ${client} on ${matterOf(f)}${refAfter(f)}${hasNumbering(f.original?.text) ? ', with their answers to your questions numbered as asked below' : ''}.\n${attached(f.files)}\nPlease proceed and let us know if anything further is required.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'forward_instruction':
      return {
        subject: replySubject(f.threadSubject, `${client} | ${f.title}: instruction`),
        body: `${hi}\n\nOur client ${client} has instructed us to proceed on ${matterOf(f)}${refAfter(f)}; their confirmation is below${(f.files ?? []).length ? ' and the signed documents are attached' : ''}.\n${attached(f.files)}\nPlease proceed and let us have the policy documents and your invoice.\n\n${SIGN}\n\n${quoted(f.original)}`,
      }
    case 'forward_question':
      return {
        subject: replySubject(f.threadSubject, `${client} | ${f.title}: query`),
        body: `${hi}\n\nPlease see below ${hasNumbering(f.original?.text) ? `our client ${client}'s answers to your questions, numbered as asked,` : `the query from our client ${client}`} on ${matterOf(f)}${refAfter(f)}:\n\n${quoteBlock(f.original?.text)}\n\n${hasNumbering(f.original?.text) ? 'Please let us know if anything further is needed.' : 'Please let us have your reply so that we can revert to the client.'}\n\n${SIGN}`,
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
        body: `${hi}\n\nThank you for your query on ${policyRef(f) || (f.lineLabel ? line : 'your policy')}.\n\nFrom the policy on file:\n${facts}\n${(f.files ?? []).length ? `\nThe ${f.files!.length === 1 ? 'document' : 'documents'} setting this out ${f.files!.length === 1 ? 'is' : 'are'} attached: ${f.files!.join(', ')}.\n` : ''}\nPlease let us know if you would like us to confirm any point with ${f.insurerName ?? 'the insurer'}.\n\n${SIGN}`,
      }
    }
    case 'document_send':
      return {
        subject: replySubject(f.threadSubject, `${policyRef(f) || f.title}: documents`),
        body: `${hi}\n\nPlease find attached the ${f.files?.length === 1 ? 'document' : 'documents'} you requested for ${policyRef(f) || line}${f.periodFrom && f.periodTo ? ` (${fmt(f.periodFrom)} to ${fmt(f.periodTo)})` : ''}.\n${attached(f.files)}\n${SIGN}`,
      }
    case 'status_update': {
      const where = f.waitingOn === 'insurer' ? `We are waiting for ${f.insurerName ?? 'the insurer'} to revert${f.lastSent ? `; we last wrote to them on ${fmt(f.lastSent)} and have followed up today` : ' and have followed up today'}.`
        : f.deadline ? `We are working on it and will update you by ${fmt(f.deadline)}.` : 'We are working on it and will update you shortly.'
      return {
        subject: replySubject(f.threadSubject, `${f.title}: status`),
        body: `${hi}\n\nThank you for following up on ${matterOf(f)}${refAfter(f)}.\n\n${where}\n\n${SIGN}`,
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
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has declined to offer terms for ${line}${f.quoted ? `, for the reason below:\n\n${quoteBlock(f.quoted)}` : '.'}\n\nWe are approaching the other markets and will revert with any terms received.\n\n${SIGN}`,
      }
    case 'relay_documents':
      return {
        subject: replySubject(f.threadSubject, `${policyRef(f) || f.title}: documents`),
        body: `${hi}\n\nPlease find attached the ${f.files?.length === 1 ? 'document' : 'documents'} issued by ${f.insurerName ?? 'the insurer'} for ${policyRef(f) || f.title}.\n${attached(f.files)}\nPlease keep them for your records and let us know if anything needs correcting.\n\n${SIGN}`,
      }
    case 'relay_decision':
      return {
        subject: replySubject(f.threadSubject, `${f.title}: update from ${f.insurerName ?? 'the insurer'}`),
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has responded on ${matterOf(f)}${refAfter(f)}${f.quoted ? `:\n\n${quoteBlock(f.quoted)}` : '.'}\n${attached(f.files)}\nPlease let us know how you would like to proceed, and we will respond to the insurer accordingly.\n\n${SIGN}`,
      }
    case 'relay_question': {
      const items = numbered(f.asks ?? [])
      return {
        subject: replySubject(f.threadSubject, `${f.title}: information requested by ${f.insurerName ?? 'the insurer'}`),
        body: `${hi}\n\n${f.insurerName ?? 'The insurer'} has asked for the following on ${matterOf(f)}${refAfter(f)}:\n\n${items || quoteBlock(f.quoted)}\n\n${items ? 'Could you reply against each number, and we will pass your answers on the same day.' : 'Please send the details in reply to this email and we will pass them on.'}\n\n${SIGN}`,
      }
    }
  }
}

/** A picture the mail client embedded (a signature logo, a banner): never a document to forward. */
export function isSignatureImage(filename: string | null | undefined, mime: string | null | undefined): boolean {
  const f = String(filename ?? '').toLowerCase()
  if (/^(image|outlook|oledata|att)\d{2,5}\.(png|gif|jpe?g|bmp)$/.test(f)) return true
  if (/^(logo|signature|banner|icon)[\w-]*\.(png|gif|jpe?g|svg)$/.test(f)) return true
  return false
}
