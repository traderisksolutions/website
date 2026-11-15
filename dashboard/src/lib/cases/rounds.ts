/**
 * Rounds on a case: who has to hear what next, read from the emails by rule.
 *
 * Every email on the case's picked threads is one move:
 *
 *   client side   request, change, answer, question, documents, instruction, follow-up
 *   insurer side  quote, question, decline, reply, documents, follow-up
 *   TRS           sent to insurer, sent to client
 *
 * Who wrote an outside email: the domain's company, then the address, signature and voice
 * (crm/party-read.ts), then the thread's side. A referral's emails are the client's, marked with
 * the referral's name. TRS's own email goes by who it was written to.
 *
 * Round 1 is the first request. A new round opens when the client changes the request after TRS
 * has written to an insurer in the current round: every insurer asked so far, and not declined,
 * is owed the change. Inside a round each insurer is one chain: asked, replied, sent to client.
 * The next steps are the links not yet made, in the order they block the case.
 *
 * A person's call on one email (work_item_events, kind "move") overrides the rule for that email.
 * No model reads anything here.
 *
 * Pure. Tested in __tests__/rounds.test.ts. The reads are in rounds-store.ts.
 */
import { ownText, partyOf } from '@/lib/admin/k/shape'
import { detectIntent, ownWords } from '@/lib/admin/b/relay/intent'
import { isSignatureImage, type RelayKind } from '@/lib/admin/b/relay/compose'
import { PUBLIC_EMAIL_DOMAINS, bareEmail, emailDomain, isInternal } from '@/lib/crm/db'
import { readSenders, type NameIndex, type SenderRead } from '@/lib/crm/party-read'
import { isAutoReply, isInternalOnly } from '@/lib/threads/waiting'
import { bucketOf, type Bucket, type Side, type SourceMessage } from './sources'
import { senderName } from './names'

export const MOVES = ['ask', 'change', 'answer', 'question', 'documents', 'decision', 'quote', 'decline', 'reply', 'request', 'relay', 'chase', 'note'] as const
export type Move = typeof MOVES[number]
export const isMove = (v: unknown): v is Move => typeof v === 'string' && (MOVES as readonly string[]).includes(v)
export const MOVE_NAME: Record<Move, string> = {
  ask: 'Request', change: 'Change', answer: 'Answer', question: 'Question', documents: 'Documents', decision: 'Instruction',
  quote: 'Quote', decline: 'Decline', reply: 'Reply', request: 'Sent to insurer', relay: 'Sent to client', chase: 'Follow-up', note: 'Message',
}
export const WRITERS = ['client', 'insurer', 'trs'] as const
export type Writer = typeof WRITERS[number]
export const isWriter = (v: unknown): v is Writer => typeof v === 'string' && (WRITERS as readonly string[]).includes(v)
export const WRITER_NAME: Record<Writer, string> = { client: 'Client', insurer: 'Insurer', trs: 'TRS' }
/** What a person may call an email, by who wrote it. */
export const MOVES_FOR: Record<Writer, readonly Move[]> = {
  client: ['ask', 'change', 'answer', 'question', 'documents', 'decision', 'chase', 'note'],
  insurer: ['quote', 'question', 'decline', 'reply', 'documents', 'chase', 'note'],
  trs: ['request', 'relay', 'chase', 'note'],
}
/** A person's call on one email: who wrote it and what it is. */
export type Call = { by: Writer; move: Move }

export type RoundMove = {
  message_id: string; thread_id: string; at: string | null; by: Writer
  /** The sender as the email names them. */
  name: string
  /** The referral the client's words came through. */
  via: string | null
  /** The insurer the email is from or to. */
  insurer: string | null
  move: Move
  /** The rule's reading, kept when a person set another. */
  rule: Move
  set_by: 'rule' | 'person'
  /** The words the rule fired on. */
  cue: string | null
  text: string
  files: string[]
  /** The email is in a colleague's mailbox: its words are withheld. */
  private?: boolean
}
export const CHAIN_STATES = ['to_ask', 'asked', 'heard', 'replied', 'sent', 'declined'] as const
export type ChainState = typeof CHAIN_STATES[number]
export const CHAIN_STATE_NAME: Record<ChainState, string> = { to_ask: 'To ask', asked: 'Asked', heard: 'Acknowledged', replied: 'Replied', sent: 'Sent to client', declined: 'Declined' }
export type Chain = {
  insurer: string
  /** Where TRS and the insurer last wrote. */
  thread_id: string | null
  asked_at: string | null
  /** The last time TRS wrote to the insurer in this round. */
  wrote_at: string | null
  /** The last time the insurer wrote in this round, whatever it said. */
  heard_at: string | null
  replied: Move | null
  replied_at: string | null
  sent_at: string | null
  state: ChainState
}
export type Round = { n: number; opened_at: string | null; /** The request or the change that opened it. */ opened_by: string | null; moves: RoundMove[]; chains: Chain[] }

export type StepWhat = Exclude<Move, 'request' | 'relay' | 'chase' | 'note'> | 'waiting'
export type StepDraft = Extract<RelayKind, `forward_${string}` | `relay_${string}`>
export type Step = {
  /** The handle the draft route takes. */
  id: string
  act: 'draft' | 'ask' | 'wait'
  to: 'client' | 'insurer' | null
  agent: 'Client agent' | 'Insurer agent' | null
  insurer: string | null
  what: StepWhat
  text: string
  /** The email the step rests on, and how many like it are waiting. */
  message_id: string | null
  thread_id: string | null
  count: number
  since: string | null
  draft: StepDraft | null
}
export type Rounds = { rounds: Round[]; steps: Step[]; /** The referral the case came through. */ referral: string | null }

export type RoundsInput = {
  /** Every email on the case's picked threads, hidden threads included. */
  messages: readonly SourceMessage[]
  sides: Map<string, Side>
  /** Threads whose side a person set: the sender read does not move their emails. */
  sideSet: ReadonlySet<string>
  /** Threads the viewer may read. */
  visible: ReadonlySet<string>
  domainKind: Map<string, string>
  /** An insurer's name from an address at its domain. */
  insurerName: (address: string | null | undefined) => string | null
  /** The company on file an address's domain belongs to, by name. */
  companyName: (address: string | null | undefined) => string | null
  /** Company names on file, for the senders no domain places. */
  names: NameIndex
  /** The insurer a thread is with when its addresses do not say. */
  threadInsurer: Map<string, string>
  caseType: string | null
  /** A person's call per email. */
  set: ReadonlyMap<string, Call>
}

const INSURER = new Set(['insurer', 'tpa'])
/** Cases where TRS goes to the market for terms. */
const QUOTED = new Set(['new_quote', 'renewal'])
const NO_NAMES: NameIndex = { byCore: new Map(), bySquash: new Map() }
const TEXT_MAX = 320
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
/** The files an email carries, without the pictures a mail client embeds in a signature. */
const docs = (m: SourceMessage) => (m.files ?? []).filter(f => !isSignatureImage(f, null))

/**
 * A change to what is being quoted, in the client's words. The relay's change_request rule reads
 * policy changes (a staff addition, an address); this reads a change of ask on an open quotation.
 */
const CHANGE_ASK = new RegExp([
  String.raw`\bre-?quot\w*`, String.raw`\brevis(?:e|ed|ion)\b`, String.raw`\bamend(?:ed|ment)?\b`, String.raw`\binstead of\b`,
  String.raw`\bchang(?:e|ed|ing) (?:the|to|of|our|in)\b`, String.raw`\bchange of mind\b`,
  String.raw`\bupdated? (?:census|member|listing|list|headcount|staff list|sum insured|limits?)\b`,
  String.raw`\b(?:add|include|remove|exclude|drop|delete|increase|decrease|reduce|upgrade|downgrade)(?:d|s|ing)? (?:in )?(?:the |a |an |our |one |two |three |\d+ )?(?:new |more |additional )?(?:plans?|riders?|cover(?:age)?|benefits?|dental|gp|outpatient|specialist|limits?|sum insured|headcount|staff|employees?|members?|dependants?|ward|deductible|excess|co-?pay(?:ment)?|options?)\b`,
  String.raw`\b(?:hr|the client|client|they) (?:has |have )?(?:also )?added\b`, String.raw`\bnew (?:census|headcount|member list|requirements?)\b`,
].join('|'), 'i')
/** The client taking the terms: an award is an instruction, whatever is attached to it. */
const AWARD = /\b(?:pleased|happy|glad) to (?:confirm|award)\b|\bconfirm (?:the )?award\b|\baward(?:ed|ing)? (?:the |this )?(?:insurance|contract|policy|cover|placement)\b|\bletter of award\b|\bbinding instructions?\b/i
const TRS_CHASE = /\b(follow(?:ing)?[- ]up|any (?:update|news)|gentle reminder|kind reminder|friendly reminder|hear(?:d)? (?:back )?from you|awaiting your (?:reply|response|quot\w*|terms)|chas(?:e|ing))\b/i
/** A few words that still ask the market for terms: "Please quote on the expiring terms." */
const TRS_ASKS = /\b(?:please|kindly|pls) (?:quote|re-?quote|revise|provide (?:us )?(?:with )?(?:your |a |the )?(?:best )?(?:quotation|quote|terms|proposal|indication)|let us have your (?:best )?(?:quotation|quote|terms|proposal|indication))\b/i
/** An insurer's terms sent as a file: "please find attached our proposal". */
const TERMS_ATTACHED = /\b(?:attach(?:ed|ing)|enclos(?:ed|ing)|herewith)\b[^.\n]{0,80}\b(?:proposal|quotation|quote|terms|indication)\b|\b(?:proposal|quotation|quote|indication)\b[^.\n]{0,60}\b(?:attached|enclosed)\b/i
/** TRS telling the client what an insurer said, whether or not the insurer's email is on the case. */
const RELAYS = /\b(?:(?:received|got|have|had) (?:the following |a |an |some )?(?:response|reply|feedback|quotation|quote|terms|update|queries|questions|clarifications?) from|(?:insurer|underwriter)s? (?:has|have|is|are|requires?|requests?|needs?|would like|advised?|replied|responded|reverted|came back|confirmed|declined|asks?|asked|mentioned|informed)|as per (?:the )?(?:insurer|underwriter)|from the (?:insurer|underwriter)s?|for the (?:insurer|underwriter)s? to|discussed with the (?:insurance )?(?:market|insurers?)|(?:quotation|quote|terms|proposal)s? (?:we|i) (?:have )?received)\b/i
/** A refusal with a condition is a request for what is missing: "or else the insurers will not be able to quote", "unable to quote without the claims experience". */
const NEEDS = /\b(?:need|require)s? the following\b|\bin order (?:for us )?to (?:quote|proceed)\b|\bbefore we (?:can|could|are able to) (?:quote|proceed)\b|\b(?:or else|otherwise|unless|without (?:which|this|these))\b[^.\n]{0,80}\b(?:will not|won'?t|unable|cannot|can'?t)\b|\b(?:unable|not able|cannot|can'?t|will not|won'?t)\b[^.\n]{0,60}\b(?:unless|until|without)\b/i
/** Words that leave the client holding a question. */
const ASKS_BACK = /\?|\b(?:requires?|requests?|needs?|clarif\w+|(?:please|kindly) (?:advise|confirm|provide|let us know|share|fill|complete))\b/i

type Rule = { move: Move; cue: string | null }

/** The client side's email, by rule. */
export function clientMove(m: SourceMessage, caseType: string | null): Rule {
  const text = ownWords(m.body_text)
  const change = CHANGE_ASK.exec(text)
  const r = detectIntent({ side: 'client', subject: m.subject, text, files: docs(m), caseType })
  const cue = r.cues[0] ?? null
  if (r.intent === 'instruction') return { move: 'decision', cue }
  const award = AWARD.exec(text)
  if (award) return { move: 'decision', cue: award[0].toLowerCase() }
  if (change) return { move: 'change', cue: change[0].toLowerCase() }
  switch (r.intent) {
    case 'quote_request': return { move: 'ask', cue }
    case 'claim_notify': return { move: 'ask', cue }
    // On a quotation a member list is a document for the insurers; on a policy it is the change itself.
    case 'change_request': return QUOTED.has(caseType ?? '') && cue?.startsWith('doc:') ? { move: 'documents', cue } : { move: 'change', cue }
    case 'cover_question': return { move: 'question', cue }
    case 'docs_provided': return { move: 'documents', cue }
    case 'client_chase': return { move: 'chase', cue }
    case 'thanks': return { move: 'note', cue }
    default: return { move: 'note', cue: null }
  }
}

/** A password for the file sent a minute before: no reply of its own. */
const PASSWORD = /\b(?:password|pw)\b/i
/** The insurer asking where its terms stand. */
const INSURER_CHASE = /\b(?:have you heard (?:back|from)|any (?:update|news|feedback) (?:on|from|regarding)|heard back (?:on|from)|where (?:we|this) stands?)\b/i
/** The insurer saying it has the request and will come back: nothing for the client yet. */
const INSURER_ACK = /\b(?:thanks?(?: you)? for (?:this|the|your) (?:new )?(?:enquiry|inquiry|submission)|thanks?(?: you)? for sending (?:this|these|it)|we (?:will|shall|can) (?:review|have a look|look into|revert|get back|respond)|will review and (?:respond|revert)|(?:is|are|was) well received)\b/i
const HEARD = new Set(['market_question', 'documents_received', 'none', 'market_ack', 'insurer_note'])
/** The client taking an insurer out: "please disregard Zurich's quotation". */
const DROPS = /\b(?:disregard|drop|exclude|not (?:consider|proceed with|go with|take up))\b([^.\n]{0,60})/gi

/** The insurer side's email, by rule. */
export function insurerMove(m: SourceMessage, caseType: string | null): Rule {
  const text = ownWords(m.body_text)
  const files = docs(m)
  if (!files.length && wordCount(text) <= 40) {
    if (PASSWORD.test(text) && wordCount(text) <= 25) return { move: 'note', cue: 'password' }
    const chase = INSURER_CHASE.exec(text)
    if (chase) return { move: 'chase', cue: chase[0].toLowerCase() }
  }
  const r = detectIntent({ side: 'market', subject: m.subject, text, files: docs(m), caseType })
  const cue = r.cues[0] ?? null
  const ack = !files.length && wordCount(text) <= 60 && !text.includes('?') && HEARD.has(r.intent) ? INSURER_ACK.exec(text) : null
  if (ack) return { move: 'note', cue: ack[0].toLowerCase() }
  switch (r.intent) {
    case 'quote_received': return { move: 'quote', cue }
    case 'decline': { const needs = NEEDS.exec(text); return needs ? { move: 'question', cue: needs[0].toLowerCase() } : { move: 'decline', cue } }
    case 'market_question': return { move: 'question', cue }
    case 'claim_decision': return { move: 'reply', cue }
    case 'documents_received': return { move: 'documents', cue }
    case 'market_chase': return { move: 'chase', cue }
  }
  const terms = files.length ? TERMS_ATTACHED.exec(text) : null
  return terms ? { move: 'quote', cue: terms[0].toLowerCase() } : { move: 'note', cue: null }
}

/** What an insurer wrote that the client has to hear. */
const TO_CLIENT = new Set<Move>(['quote', 'question', 'decline', 'reply', 'documents'])
/** A client email that, arriving while the client holds an insurer's question, is the answer to it. */
const ANSWERS = new Set<Move>(['note', 'question', 'documents', 'ask'])

type Owed = { insurer: string | null; what: StepWhat; message_id: string; thread_id: string; at: string | null; round: number }
type Spec = { draft: StepDraft; text: (insurer: string) => string }

const FROM_CLIENT: Record<Exclude<StepWhat, 'waiting' | 'ask' | 'quote' | 'decline' | 'reply'>, Spec> = {
  change: { draft: 'forward_change', text: i => `Send the client's change to ${i} for revised terms` },
  answer: { draft: 'forward_answer', text: i => `Send the client's answer to ${i}` },
  question: { draft: 'forward_question', text: i => `Send the client's question to ${i}` },
  documents: { draft: 'forward_documents', text: i => `Send the client's documents to ${i}` },
  decision: { draft: 'forward_instruction', text: i => `Send the client's instruction to ${i}` },
}
const FROM_INSURER: Record<Exclude<StepWhat, 'waiting' | 'ask' | 'change' | 'answer' | 'decision'>, Spec> = {
  quote: { draft: 'relay_quote', text: i => `Send ${i}'s terms to the client` },
  question: { draft: 'relay_question', text: i => `Send ${i}'s questions to the client` },
  decline: { draft: 'relay_decline', text: i => `Tell the client ${i} declined` },
  reply: { draft: 'relay_decision', text: i => `Send ${i}'s reply to the client` },
  documents: { draft: 'relay_documents', text: i => `Send ${i}'s documents to the client` },
}

export function buildRounds(i: RoundsInput): Rounds {
  const rounds: Round[] = [{ n: 1, opened_at: null, opened_by: null, moves: [], chains: [] }]
  const cur = () => rounds[rounds.length - 1]
  const known: string[] = []
  const declined = new Set<string>()
  /** The round each insurer was last written to in. */
  const askedIn = new Map<string, number>()
  /** Insurers whose question the client has in hand. */
  const awaiting = new Set<string>()
  /** The client holds a question from an insurer whose email is not on the case. */
  let awaitingAny = false
  /** Insurers whose terms the client has in hand. */
  const quoted = new Set<string>()
  let toInsurer: Owed[] = []
  let toClient: Owed[] = []
  let unasked: Owed | null = null
  const referrals = new Map<string, number>()

  const chainOf = (round: Round, insurer: string): Chain => {
    let c = round.chains.find(x => x.insurer === insurer)
    if (!c) { c = { insurer, thread_id: null, asked_at: null, wrote_at: null, heard_at: null, replied: null, replied_at: null, sent_at: null, state: 'to_ask' }; round.chains.push(c) }
    if (!known.includes(insurer)) known.push(insurer)
    return c
  }
  const active = () => known.filter(k => !declined.has(k))
  const isTrs = (m: SourceMessage) => m.direction === 'outbound' || partyOf(m.from_address, i.domainKind) === 'internal'

  const ordered = [...i.messages].filter(m => !isAutoReply(m) && !isInternalOnly(m)).sort((a, b) => String(a.sent_at ?? '').localeCompare(String(b.sent_at ?? '')))
  const byId = new Map(ordered.map(m => [m.id, m]))

  // The senders no domain places are read once across their emails; a referral's domain is read for its voice only.
  const outside = ordered.filter(m => !isTrs(m))
  const reads = readSenders(outside.filter(m => partyOf(m.from_address, i.domainKind) === 'other'), i.names)
  const voices = readSenders(outside.filter(m => partyOf(m.from_address, i.domainKind) === 'partner'), NO_NAMES)
  /** A business's own domain: a colleague of a sender already read is on the same side. */
  const ownDomain = (address: string | null | undefined) => { const d = emailDomain(bareEmail(address)); return d && !PUBLIC_EMAIL_DOMAINS.has(d) ? d : null }
  const domainReads = new Map<string, SenderRead>()
  for (const [address, r] of reads) { const d = ownDomain(address); if (d && !domainReads.has(d)) domainReads.set(d, r) }
  const shown = new Map(outside.map(m => [bareEmail(m.from_address), senderName(m.from_address)]))
  /** An insurer no company on file names: its domain, or the person behind a personal address. */
  const unnamed = (address: string) => ownDomain(address) ?? shown.get(bareEmail(address)) ?? senderName(address)
  type Placed = { side: Bucket; via: string | null }
  const place = (address: string | null | undefined, threadId?: string): Placed | null => {
    const kind = partyOf(address, i.domainKind)
    if (kind === 'client') return { side: 'client', via: null }
    if (INSURER.has(kind)) return { side: 'insurer', via: null }
    if (kind === 'partner') return voices.get(bareEmail(address))?.party === 'insurer' ? { side: 'insurer', via: null } : { side: 'client', via: i.companyName(address) ?? 'referral' }
    const r = kind === 'other' ? reads.get(bareEmail(address)) ?? domainReads.get(ownDomain(address) ?? '') : undefined
    if (!r || (threadId && i.sideSet.has(threadId))) return null
    return r.party === 'insurer' ? { side: 'insurer', via: null } : { side: 'client', via: r.party === 'referral' ? r.company?.name ?? 'referral' : null }
  }
  // A thread's side: a person's call, then the insurer its subject names, then the outside senders on it, then as stored.
  const seen = new Map<string, Set<Bucket>>()
  for (const m of outside) { const p = place(m.from_address); if (p) seen.set(m.thread_id, (seen.get(m.thread_id) ?? new Set<Bucket>()).add(p.side)) }
  const sideOf = (threadId: string): Side | undefined => {
    if (i.sideSet.has(threadId)) return i.sides.get(threadId)
    if (i.threadInsurer.has(threadId)) return 'insurer'
    const on = seen.get(threadId)
    return on?.size === 1 ? [...on][0] : i.sides.get(threadId)
  }
  /** The insurer behind an address, by name. */
  const insurerAt = (address: string, threadId: string) =>
    i.insurerName(address) ?? (place(address)?.side === 'insurer' ? i.threadInsurer.get(threadId) ?? unnamed(address) : null)
  /** The insurers an email of TRS's was written to. */
  const insurersOn = (m: SourceMessage): string[] => {
    const named = (list: readonly string[] | undefined) => Array.from(new Set((list ?? []).map(a => insurerAt(a, m.thread_id)).filter((n): n is string => !!n)))
    const to = named(m.to)
    if (to.length) return to
    const cc = named(m.cc)
    if (cc.length) return cc
    const t = i.threadInsurer.get(m.thread_id)
    return t ? [t] : []
  }
  /** Who TRS's own email was written to: the addresses on the To line, then the thread. */
  const trsTo = (m: SourceMessage, call: Call | undefined): Bucket | null => {
    if (call?.by === 'trs' && call.move === 'request') return 'insurer'
    if (call?.by === 'trs' && call.move === 'relay') return 'client'
    const to = (m.to ?? []).map(a => place(a)?.side)
    return to.includes('insurer') ? 'insurer' : to.includes('client') ? 'client' : bucketOf(m, sideOf(m.thread_id), i.domainKind)
  }
  const names = (insurer: string | null, text: string) => {
    if (!insurer) return false
    const n = insurer.toLowerCase()
    const first = n.split(/\s+/)[0].replace(/[^a-z0-9]/g, '')
    return text.includes(n) || (first.length >= 4 && new RegExp(`\\b${first}\\b`).test(text))
  }

  for (const m of ordered) {
    const call = i.set.get(m.id)
    const trs = isTrs(m)
    const placed: Placed | null = trs ? null
      : call && call.by !== 'trs' ? { side: call.by, via: call.by === 'client' ? place(m.from_address)?.via ?? null : null }
      : place(m.from_address, m.thread_id) ?? (b => (b ? { side: b, via: null } : null))(bucketOf(m, sideOf(m.thread_id), i.domainKind))
    const bucket = trs ? trsTo(m, call) : placed?.side ?? null
    if (!bucket) continue
    const at = m.sent_at ?? null
    const hidden = !i.visible.has(m.thread_id)
    const files = docs(m)
    const own = ownWords(m.body_text)
    const by: Writer = trs ? 'trs' : bucket
    const person = call && call.by === by && MOVES_FOR[by].includes(call.move) ? call.move : null
    const via = placed?.side === 'client' ? placed.via : null
    if (via) referrals.set(via, (referrals.get(via) ?? 0) + 1)
    const row = (rule: Rule, move: Move, insurer: string | null, round: Round) => {
      round.moves.push({
        message_id: m.id, thread_id: m.thread_id, at, by, name: trs ? 'TRS' : senderName(m.from_address), via, insurer, move, rule: rule.move,
        set_by: person ? 'person' : 'rule', cue: rule.cue,
        text: hidden ? '' : ownText(m.body_text, m.subject, TEXT_MAX, false) ?? files.join(', '), files: hidden ? [] : files, ...(hidden ? { private: true } : {}),
      })
    }

    if (trs) {
      if (bucket === 'insurer') {
        const to = insurersOn(m)
        const light = !files.length && wordCount(own) <= 12 && !TRS_ASKS.test(own)
        const rule: Rule = { move: TRS_CHASE.test(own) && wordCount(own) <= 80 ? 'chase' : light ? 'note' : 'request', cue: null }
        const move = person ?? rule.move
        row(rule, move, to.join(', ') || null, cur())
        if (move !== 'request' && move !== 'chase') continue
        for (const name of to) {
          const c = chainOf(cur(), name)
          c.thread_id = m.thread_id
          c.wrote_at = at
          if (move === 'chase') continue
          c.asked_at ??= at
          askedIn.set(name, cur().n)
          toInsurer = toInsurer.filter(o => o.insurer !== name)
        }
        if (move === 'request') { unasked = null; if (to.length) toInsurer = toInsurer.filter(o => o.insurer !== null) }
        continue
      }
      // To the client: it carries what the insurers sent when it names them, shares a file with them, or says enough to.
      const text = `${m.subject ?? ''}\n${own}`.toLowerCase()
      const fileSet = new Set(files.map(f => f.toLowerCase()))
      const matched = toClient.filter(o => names(o.insurer, text) || (byId.get(o.message_id)?.files ?? []).some(f => fileSet.has(f.toLowerCase())))
      const carries = matched.length ? matched : files.length || wordCount(own) >= 20 ? toClient : []
      const worded = RELAYS.exec(own) ?? (files.length ? TERMS_ATTACHED.exec(own) : null)
      const rule: Rule = { move: carries.length || worded ? 'relay' : TRS_CHASE.test(own) ? 'chase' : 'note', cue: carries.length ? null : worded?.[0].toLowerCase() ?? null }
      const move = person ?? rule.move
      row(rule, move, null, cur())
      if (move !== 'relay') continue
      // Terms in the client's hands with no insurer on the case: the market was asked elsewhere.
      if (!known.length && worded) unasked = null
      const sent = new Set(person === 'relay' && !carries.length ? toClient : carries)
      for (const o of sent) {
        if (!o.insurer) continue
        chainOf(rounds[o.round - 1], o.insurer).sent_at = at
        if (o.what === 'question') awaiting.add(o.insurer)
        if (o.what === 'quote') quoted.add(o.insurer)
      }
      toClient = toClient.filter(o => !sent.has(o))
      if (!sent.size && RELAYS.test(own) && ASKS_BACK.test(own)) awaitingAny = true
      continue
    }

    if (bucket === 'client') {
      const rule = clientMove(m, i.caseType)
      let move = person ?? rule.move
      const written = cur().chains.some(c => c.asked_at)
      if (!person) {
        if ((awaiting.size || awaitingAny) && ANSWERS.has(rule.move)) move = 'answer'
        // Request words after the first request are an email on the round: only a change of the ask opens another.
        else if (rule.move === 'ask' && cur().opened_by) move = 'note'
        // The first words on a case are the request, however they are put.
        else if (rule.move === 'change' && !cur().opened_by && !written) move = 'ask'
      }
      for (const d of own.matchAll(DROPS)) for (const k of known) if (names(k, d[1].toLowerCase())) declined.add(k)
      const owe = (insurer: string | null, what: StepWhat) => toInsurer.push({ insurer, what, message_id: m.id, thread_id: m.thread_id, at, round: cur().n })
      /** One insurer when the email can only be for one; else a person names it. */
      const one = () => { const held = active().filter(k => quoted.has(k)); return held.length === 1 ? held[0] : active().length === 1 ? active()[0] : null }
      if (move === 'ask' || move === 'change') {
        // The first request can follow TRS's own approach to the market: it names the round, it does not open another.
        if (written && (move === 'change' || (cur().opened_by && !person))) {
          rounds.push({ n: cur().n + 1, opened_at: at, opened_by: m.id, moves: [], chains: [] })
          move = 'change'
        } else if (!cur().opened_by) { cur().opened_at = at; cur().opened_by = m.id }
        if (move === 'change') {
          // The insurers still quoting hear the change; one already owed it is owed the newer words.
          toInsurer = toInsurer.filter(o => o.what !== 'change')
          for (const k of active()) { owe(k, 'change'); chainOf(cur(), k) }
          awaiting.clear()
          awaitingAny = false
        }
        if (!known.length) unasked = { insurer: null, what: 'ask', message_id: m.id, thread_id: m.thread_id, at, round: cur().n }
      } else if (move === 'answer') {
        const asked = awaiting.size ? [...awaiting] : [one()].filter((k): k is string => !!k)
        if (asked.length) for (const k of asked) owe(k, 'answer')
        else if (awaitingAny || active().length) owe(null, 'answer')
        awaiting.clear()
        awaitingAny = false
      } else if (move === 'documents') {
        for (const k of active()) owe(k, 'documents')
      } else if ((move === 'question' || move === 'decision') && active().length) {
        owe(one(), move)
      }
      row(rule, move, null, cur())
      continue
    }

    // The insurer side.
    const who = i.insurerName(m.from_address) ?? i.threadInsurer.get(m.thread_id) ?? unnamed(m.from_address ?? '')
    const rule = insurerMove(m, i.caseType)
    const move = person ?? rule.move
    const round = rounds[(askedIn.get(who) ?? cur().n) - 1]
    const c = chainOf(round, who)
    c.thread_id = m.thread_id
    c.heard_at = at
    row(rule, move, who, round)
    if (!TO_CLIENT.has(move)) continue
    c.replied = move
    c.replied_at = at
    c.sent_at = null
    // The newer reply of the same kind is the one the client hears.
    toClient = toClient.filter(o => !(o.insurer === who && o.what === move))
    toClient.push({ insurer: who, what: move as StepWhat, message_id: m.id, thread_id: m.thread_id, at, round: round.n })
    if (move === 'decline') declined.add(who)
    else if (move === 'quote') declined.delete(who)
  }

  for (const r of rounds) for (const c of r.chains) {
    c.state = c.replied === 'decline' ? 'declined'
      : c.replied && c.sent_at ? 'sent'
      : c.replied && (c.replied_at ?? '') >= (c.wrote_at ?? '') ? 'replied'
      : c.asked_at ? ((c.heard_at ?? '') >= (c.wrote_at ?? c.asked_at) ? 'heard' : 'asked') : 'to_ask'
  }

  // The links not yet made, in the order they block the case.
  const steps: Step[] = []
  const add = (owed: readonly Owed[], what: StepWhat, to: Bucket) => {
    const per = new Map<string, Owed[]>()
    for (const o of owed) if (o.what === what) per.set(o.insurer ?? '', [...(per.get(o.insurer ?? '') ?? []), o])
    for (const [key, list] of per) {
      const last = list[list.length - 1]
      const insurer = key || null
      const spec = (to === 'client' ? FROM_INSURER : FROM_CLIENT)[what as never] as Spec
      steps.push({
        id: `${what}:${last.message_id}:${key}`, act: insurer ? 'draft' : 'ask', to, agent: to === 'client' ? 'Client agent' : 'Insurer agent', insurer, what,
        text: spec.text(insurer ?? 'the insurer'), message_id: last.message_id, thread_id: last.thread_id, count: list.length, since: list[0].at, draft: insurer ? spec.draft : null,
      })
    }
  }
  add(toInsurer, 'change', 'insurer')
  if (unasked && QUOTED.has(i.caseType ?? '')) steps.push({ id: `ask:${unasked.message_id}:`, act: 'ask', to: 'insurer', agent: 'Insurer agent', insurer: null, what: 'ask', text: 'Ask insurers for terms', message_id: unasked.message_id, thread_id: unasked.thread_id, count: 1, since: unasked.at, draft: null })
  add(toClient, 'question', 'client')
  for (const what of ['answer', 'question', 'documents'] as const) add(toInsurer, what, 'insurer')
  for (const what of ['quote', 'decline', 'reply', 'documents'] as const) add(toClient, what, 'client')
  add(toInsurer, 'decision', 'insurer')

  const owedTo = new Set(toInsurer.map(o => o.insurer))
  for (const name of known) {
    if (declined.has(name) || owedTo.has(name)) continue
    const c = rounds[(askedIn.get(name) ?? 0) - 1]?.chains.find(x => x.insurer === name)
    if (c?.state === 'asked') steps.push({ id: `waiting::${name}`, act: 'wait', to: null, agent: null, insurer: name, what: 'waiting', text: `Waiting on ${name}`, message_id: null, thread_id: c.thread_id, count: 1, since: c.wrote_at ?? c.asked_at, draft: null })
  }
  if (!steps.length) {
    const sent = rounds.flatMap(r => r.chains).filter(c => c.state === 'sent').map(c => c.sent_at ?? '').sort().pop()
    if (sent) steps.push({ id: 'waiting::client', act: 'wait', to: null, agent: null, insurer: null, what: 'waiting', text: 'Waiting on the client', message_id: null, thread_id: null, count: 1, since: sent, draft: null })
  }
  const referral = [...referrals].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { rounds, steps, referral: referral === 'referral' ? null : referral }
}

export type Recipient = { to: string; cc: string[]; thread_id: string; /** The email the address was read from. */ message_id: string }

/**
 * Who a step's email goes to: whoever last wrote on that side of the case, else whoever TRS last
 * wrote to there. The email goes on that thread. Copied: the insurer's colleagues on that email,
 * or everyone on the client's email who is not at an insurer. Null when no email the viewer may
 * read names an address.
 */
export function recipientFor(step: Pick<Step, 'to' | 'insurer'>, rounds: readonly Round[], messages: readonly SourceMessage[], visible: ReadonlySet<string>, domainKind: Map<string, string>): Recipient | null {
  const byId = new Map(messages.map(m => [m.id, m]))
  const moves = rounds.flatMap(r => r.moves).filter(v => visible.has(v.thread_id)).sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
  const toInsurer = step.to === 'insurer'
  const theirs = (v: RoundMove) => (toInsurer ? v.by === 'insurer' && v.insurer === step.insurer : v.by === 'client')
  const ours = (v: RoundMove) => v.by === 'trs' && (toInsurer ? v.insurer === step.insurer : v.move === 'relay')
  const outside = (list: readonly string[] | undefined) => (list ?? []).map(a => bareEmail(a)).filter(a => a.includes('@') && !isInternal(a))
  for (const pick of [theirs, ours]) for (const v of moves) {
    if (!pick(v)) continue
    const m = byId.get(v.message_id)
    if (!m) continue
    const [to, ...rest] = v.by === 'trs' ? outside(m.to) : [bareEmail(m.from_address), ...outside(m.to)]
    if (!to?.includes('@')) continue
    const copied = (a: string) => (toInsurer ? emailDomain(a) === emailDomain(to) : !INSURER.has(partyOf(a, domainKind)))
    return { to, cc: Array.from(new Set([...rest, ...outside(m.cc)])).filter(a => a !== to && copied(a)), thread_id: m.thread_id, message_id: m.id }
  }
  return null
}
