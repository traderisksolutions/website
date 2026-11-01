/**
 * The work an outgoing email represents, by rule. Pure.
 *
 * Ported from the mailbox workload study of 2 Nov 2026 (three spot-check rounds; 50 of 57 right
 * at class level on the last). Rules run in priority order on the message's own words, its
 * subject, its real attachments and who it goes to. Each class carries a tier:
 *   deterministic  the agent can send it from data it already holds, a person approves;
 *   approval       the agent drafts it, a person reads and approves;
 *   person         judgement or relationship work: advice, claims strategy, negotiation.
 */
import { isForwardSubject, isImageAttachment, newText, normSubject, recipientKind, stripGreeting, words, type RecipientKind } from './text'

export type WorkClass =
  | 'forward_client_to_insurer' | 'forward_insurer_to_client' | 'chase' | 'debit_or_credit_note' | 'document_send'
  | 'acknowledge' | 'answer_question' | 'request_info_from_client' | 'renewal_negotiation' | 'claim_handling_substantive'
  | 'scheduling' | 'internal' | 'other' | 'excluded'
export type Tier = 'deterministic' | 'approval' | 'person' | 'excluded'
export type Side = 'market' | 'client' | 'both' | 'none'

export type ClassifyInput = {
  subject: string | null
  body_text: string | null
  from_address: string | null
  has_attachments?: boolean | null
  attachments: { filename?: string | null; mime_type?: string | null }[]
  /** To and cc addresses on the message. */
  recipients: { email: string; role: string }[]
  /** The company the thread is filed under, by kind, and the thread's category when known. */
  thread?: { company_kind?: string | null; category?: string | null } | null
  /** Whether the message before this one in the thread came in from outside. */
  previousInbound?: boolean
}

export type Classified = {
  cls: WorkClass; sub: string; tier: Tier; side: Side
  words: number; attachments: number; effort: number; sideChannel: boolean
}

export const WORK_CLASSES: WorkClass[] = [
  'forward_client_to_insurer', 'forward_insurer_to_client', 'acknowledge', 'answer_question', 'debit_or_credit_note',
  'document_send', 'chase', 'request_info_from_client', 'claim_handling_substantive', 'renewal_negotiation', 'scheduling', 'internal', 'other',
]

const R = {
  chase: /\b(follow(ing)?[- ]?up|gentle reminder|reminder|any update|checking in|check if (you|there)|managed to|kindly (advise|revert|update|expedite|confirm)|please (advise|revert|expedite|update)|expedite|awaiting|still waiting|status (of|on)|chasing|revert (to us|soonest|asap)|appreciate (your|an) (early|prompt|urgent)|do you have|have you (had|received|heard)|any news)\b/i,
  money: /(S\$|SGD|US\$|USD|RM|MYR|\$\s?\d|\d\s?%|premium|rate:|sum insured|limit of liability|excess)/i,
  req: /\b(please|kindly|could|can you|can we|would you|need|require|proceed|bind|confirm|advise|\?)/i,
  ack: /^(noted|ok|okay|thank you|thanks|many thanks|received|well received|got it|understood|sure|will do|much appreciated|acknowledged|appreciate|you are (most )?welcome)/i,
  holding: /\b(will (check|revert|get back|work on it|look into|update you|follow up with|send over|provide|forward|inform)|give me (till|until)|get back to you|look into (this|it)|apologies? for the (delay|late)|on leave|clear(ing)? (my )?backlog|await your instruction)\b/i,
  proceed: /\b(please proceed|proceed (to|with) (bind|issue|the|renewal|cover|placement|option)|go ahead|bind(ing)? (instruction|order|cover)|client (is|has|would like to) (agreeable|agreed|confirmed|instructed|proceed)|confirm(ed)? to proceed|agreeable to proceed|kindly (arrange|issue|process) the (policy|bond|cover|endorsement|renewal|necessary)|we confirm|please issue|please bind|hold cover|can we bind)\b/i,
  dncnAtt: /(TRS ?(DN|CN)\d*|debit ?note|credit ?note|tax ?inv|\bDN\d{5,}|\bCN\d{5,}|payment (advice|receipt)|remittance|\bSOA\b|statement of acc)/i,
  dncnBody: /\b((DN|CN)\s?\d{5,}|debit note|credit note|(our|the|attached|TRS) (tax )?invoice|tax invoice|payment advice|remittance|proof of (payment|receipt)|payment (transaction|received|has been made|made|link)|confirm receipt of (the )?payment|billing documents?|premium (payment|adjustment)|settle(ment)? (of )?(the )?premium|outstanding (premium|amount|balance)|statement of account|commission|SWIFT)\b/i,
  docAtt: /(policy|schedule|cert|COI|CI[s_ -]|endorsement|wording|cover ?note|jacket|renewal notice|benefit|member ?card|e-?card|handbook|brochure|LOU|letter of undertaking|_NB\.pdf|_TI\.pdf|policydoc)/i,
  docBody: /\b(policy (document|schedule|wording|copy|contract|jacket)s?|policy documents?|certificates?( of (insurance|currency))?|cert\b|\bCIs?\b|\bCOIs?\b|endorsement (copy|document)|cover ?notes?|member(ship)? cards?|e-?cards?|renewal (notice|invitation)|letter of undertaking|\bLOU\b|signed (copy|form|proposal)|updated (CIs?|certificate|schedule)|panel clinic list)\b/i,
  rfq: /\b(request for quot|RFQ|please (kindly )?(quote|provide (your|a|the|us) (quot|terms|indicat)|advise (your|the) (terms|premium|rate))|quotation request|seek(ing)? (your )?(quot|terms|indicat|support)|wish to (work with you|bring you|seek)|would like to work with you|new business|new enquiry|appetite|indicative (terms|quote|premium|rate|pricing)|for (your )?(quotation|quote|consideration|underwriting|review and quot)|proposal form|attached (is|are) the (proposal|rfq|documents? (related )?for)|kindly quote|to quote|help to quote|can you quote|assist (in|with) (procuring|placing|quoting)|tender (details|invitation)|needs? to (acquire|purchase|procure)|requir(e|es|ing) (an? )?(insurance|cover|bond|policy)|invitation to quote|underwriting information|renewal terms)\b/i,
  endorse: /\b(endorsement|addition(al)?|deletion|inclusion|include|exclude|remove|add(ing)?|delete|cancel(lation)?|amend(ment)?|change of|update(d)? (member|staff|employee|list)|member movement|movement|new (joiner|hire|member|staff|employee)|resign|terminat|midterm|mid-term|increase|reduce|extension|extend|reinstat|name change|vehicle|replace|headcount)\b/i,
  claimSubj: /\b(claim|adjust(er|or)|loss|incident|accident|damage|ingress|flood|fire|theft|burglary|hospitali[sz]|surgery|medical bill|reimburs|mediation|settlement|deceased|death|payout|LOG|letter of guarantee|pre-?auth)\b/i,
  claimSubst: /\b(adjust(er|or)|mediation|settlement (offer|amount|letter|statement)|defen[cs]e|counsel|solicitor|writ|letter of demand|without prejudice|quantum|reserve|repudiat|coverage (position|determination|confirmation)|policy response|declin|liability (admitted|denied)|arbitration|legal)\b/i,
  quoteToClient: /\b(quotation|quote|terms|premium|option|insurer (has|have|is|are|would|will) (confirmed|advised|reverted|agreed|declined|offered|unable|proposing|looking|able)|insurer'?s? (reply|response|terms|quote|offer|position)|please find (the )?attached (the )?(quot|terms|premium|comparison|offer|renewal)|comparison|we (have )?(obtained|received|secured) (the )?(quot|terms|renewal)|the premium (is|for|will)|renewal (terms|invitation|premium)|revised terms|best terms|recommend|indicative|pleased to quote|as follow|quick update|update(s)? (on|for|regarding)|unable to (accommodate|support|quote)|giving .{0,20} a miss)\b/i,
  renewNeg: /\b(loss ratio|claims? (experience|history|ratio|data)|discount|reduce|reduction|lower|revis(e|ed|ion)|improve(d)? terms|match|competitive|negotiat|hold (the )?rate|as expiring|expiring (terms|rate|premium)|rate (increase|hike|reduction)|loading|no claim|argu|push back|counter|alternative (quote|option|insurer)|restructure|re-?market)\b/i,
  answer: /\b(clarif(y|ication)|explain|to answer|regarding your (question|query|enquiry)|the difference|is (not )?(covered|applicable|required|possible)|does (not )?cover|under the policy|policy (does|will|would|is intended)|please (note|be informed) that|refer to (clause|section|general provision)|exclusion|territorial|definition|means that|in other words|highlight that|advise that|our (view|recommendation|advice|understanding|opinion) is|it is our opinion|in our (view|opinion)|sufficient(ly)? (cover|protect)|we understand that|yes,? (correct|that)|not entitled|is entitled|we (would )?recommend|would be (covered|excluded)|it is (not )?(necessary|required|advisable))\b/i,
  sched: /\b((set ?up|arrange|schedule|fix|propose|confirm|reschedule|book|do it) (a |the |our |for )?(meeting|call|zoom|teams|discussion|catch[- ]?up|session|visit|appointment|time|\d{1,2}\s?(am|pm))|(are you|would you be|is .{1,30}|time that you are) (free|available|able to meet)|calendar invite|invite you|see you (on|at)|meeting (on|at|tomorrow|today)|dial[- ]in|microsoft teams|zoom (link|meeting)|join .{0,30}meeting|lunch|coffee|(mon|tues|wednes|thurs|fri)day.{0,40}\d{1,2}\s?(am|pm|:\d{2})|\d{1,2}\s?(am|pm).{0,40}(mon|tues|wednes|thurs|fri)day|townhall|training|timing is flexible|preference would be|google meet)\b/i,
  intro: /\b(introduc(e|ing|tion)|nice to meet|pleasure (to|meeting)|our (services|company profile|credentials)|capabilit|we are a (licensed|singapore)|trade risk solutions is|collaborat|partnership|catch up over)\b/i,
  admin: /\b(leaving the company|last day|out of office|future (email )?correspondence|new (email|contact) (address|person)|handover)\b/i,
  infoReq: /\b(can i check|may i (check|know)|could you (please )?(provide|share|advise|confirm|send|let)|please (provide|share|send|advise|confirm|complete|fill|furnish|let us know)|kindly (provide|share|send|complete|fill|furnish|revert|let us know)|find out|send me|let me have|we (would )?(need|require)|do you have|is there any|what is the|when is the|how many|headcount|member listing|claims? (breakdown|experience|history|data)|proposal form|fact.?find|census|ACRA|NRIC|passport|financial statement|annual report)\b/i,
  statusUpd: /\b(we have|we've|have been|has been|insurer (has|have)|will (await|inform|forward|send|update)|in the midst|currently|still (pending|waiting|with))\b/i,
  sideChannel: /\b(whatsapp|\bwa\b|as (spoken|discussed)|per our (call|conversation|discussion|chat)|over the phone|telecon|spoke|called|phone call|on the call|the call (this|yesterday|earlier)|thank you for (the|your) call|chat(ted)?)\b/i,
}
const SUBJECT_MARKET = /^\(?TRS\)?\s*[\(<\-:]|^TRS\s*\(|TRS<>|^\(TRS[- ]?[A-Z]*\)/i
const MARKET_KINDS = new Set<RecipientKind>(['insurer', 'partner', 'tpa'])
const CLIENT_KINDS = new Set<RecipientKind>(['client', 'public', 'other', 'regulator', 'vendor'])

/**
 * The agents' own mailbox (operations@) sends two kinds of mail: drafts a person approved on the
 * dashboard, which count like any staff send, and the old reply desk's own output, which had no
 * person behind it and is left out of the baseline. The draft match tells them apart.
 */
export const AGENT_MAILBOX = /^operations@/
export function withMailboxRule(c: Classified, sender: string, matchedDraft: boolean): Classified {
  if (AGENT_MAILBOX.test(sender) && !matchedDraft) return { ...c, cls: 'excluded', sub: 'agent_mailbox', tier: 'excluded' }
  return c
}

/** Effort weight, as in the study: the message's own words (10 at least) plus 40 per real file. */
export const effortOf = (w: number, attachments: number) => Math.max(w, 10) + 40 * attachments

/** The tier a class and sub-class fall in. */
export function tierOf(cls: WorkClass, sub: string): Tier {
  if (cls === 'excluded') return 'excluded'
  if (cls === 'acknowledge') return sub === 'holding_reply' ? 'approval' : 'deterministic'
  if (cls === 'chase' || cls === 'document_send') return 'deterministic'
  if (cls === 'debit_or_credit_note') return sub === 'to_client' ? 'deterministic' : 'approval'
  if (cls === 'internal') return sub === 'other' ? 'person' : 'deterministic'
  if (cls === 'forward_client_to_insurer') return ['plain_forward', 'docs_or_info_to_insurer'].includes(sub) ? 'deterministic' : 'approval'
  if (cls === 'forward_insurer_to_client') return ['plain_forward', 'endorsement_confirm'].includes(sub) ? 'deterministic' : 'approval'
  if (cls === 'answer_question') return sub === 'short_reply' ? 'approval' : 'person'
  if (cls === 'request_info_from_client' || cls === 'scheduling') return 'approval'
  return 'person'   // claim_handling_substantive, renewal_negotiation, other
}

export function classify(m: ClassifyInput, domainKinds: Map<string, string>): Classified {
  const subj = normSubject(m.subject), fwd = isForwardSubject(m.subject)
  const nt0 = newText(m.body_text), nt = stripGreeting(nt0), nw = words(nt)
  const atts = m.attachments.filter(a => !isImageAttachment(a)), an = atts.map(a => a.filename ?? '').join(' | ')
  const attachedClaim = /attached|enclosed|herewith/i.test(nt) && (!!m.has_attachments || atts.length > 0)
  const sender = (m.from_address ?? '').replace(/.*</, '').replace(/>.*/, '').trim().toLowerCase()
  const thrKind = m.thread?.company_kind ?? null
  const outside = m.recipients.filter(r => r.role === 'to' || r.role === 'cc').map(r => recipientKind(r.email, domainKinds)).filter(k => k !== 'internal')
  let ext = [...new Set(outside)].map(k => k === 'unmapped'
    ? ((thrKind === 'insurer' || thrKind === 'partner' || thrKind === 'tpa') ? 'insurer' : (/underwrit|quote for|your (terms|quotation)|kindly quote|cover note|policy wording/i.test(nt) ? 'insurer' : 'client')) as RecipientKind
    : k)
  if (!m.recipients.some(r => r.role === 'to' || r.role === 'cc')) {
    if (SUBJECT_MARKET.test(subj) || /(quot|underwrit|cover note|your (terms|quotation)|kindly (quote|advise|arrange)|please (quote|proceed|issue|bind))/i.test(nt.slice(0, 400))) ext = ['insurer']
    else if (nw > 3 && !fwd) ext = ['client']
  }
  const toIns = ext.some(k => MARKET_KINDS.has(k)), toCli = ext.some(k => CLIENT_KINDS.has(k))
  const prevIn = !!m.previousInbound
  const full = `${subj} \n ${nt} \n ${an}`
  const claimThread = R.claimSubj.test(subj) || m.thread?.category === 'claim'
  const isRoadPlus = /^road-plus@/.test(sender)
  let cls: WorkClass, sub = ''
  if (/^developer@/.test(sender)) { cls = 'excluded'; sub = 'developer_mailbox' }
  else if (ext.length === 0) { cls = 'internal'; sub = /debit|DN|invoice|commission/i.test(full) ? 'dn_request_or_accounts' : (fwd || nw <= 3) ? 'fyi_forward' : 'other' }
  else if (isRoadPlus) { cls = 'other'; sub = 'roadplus_scheme' }
  else if (nw <= 30 && !atts.length && R.ack.test(nt) && !R.req.test(nt.replace(/thank you|thanks/ig, ''))) cls = 'acknowledge'
  else if (!atts.length && nw <= 70 && R.chase.test(nt) && !R.money.test(nt) && !R.proceed.test(nt) && !R.docBody.test(nt) && !(toCli && R.infoReq.test(nt) && !/follow|remind|update|checking in|awaiting|still|managed/i.test(nt))) cls = 'chase'
  else if (nw <= 45 && !atts.length && R.holding.test(nt) && !R.money.test(nt) && !R.proceed.test(nt) && !R.infoReq.test(nt)) { cls = 'acknowledge'; sub = 'holding_reply' }
  else if ((R.sched.test(nt) && nw <= 90 && !atts.length && !R.money.test(nt) && !R.proceed.test(nt)) || (nw <= 25 && /\b(monday|tuesday|wednesday|thursday|friday|afternoon|morning)\b/i.test(nt) && !R.money.test(nt)) || /join with google meet|^(updated )?invitation:|^accepted:|^declined:/i.test(subj + '\n' + nt.slice(0, 200))) cls = 'scheduling'
  else if (R.admin.test(nt) && nw <= 60 && !atts.length) { cls = 'other'; sub = 'admin_notice' }
  else if (!R.rfq.test(nt) && ((atts.some(a => R.dncnAtt.test(a.filename ?? '')) && !claimThread) || (R.dncnBody.test(nt) && !claimThread && (attachedClaim || /payment|remittance|DN\s?\d|CN\s?\d|commission|SWIFT|bank/i.test(nt))))) { cls = 'debit_or_credit_note'; sub = toIns ? 'to_insurer_or_partner' : 'to_client' }
  else if (toIns && !toCli && R.proceed.test(nt) && nw <= 120) { cls = 'forward_client_to_insurer'; sub = 'bind_or_proceed_instruction' }
  else if (claimThread && (R.claimSubst.test(nt) || nw > 150)) cls = 'claim_handling_substantive'
  else if (toCli && !toIns && (atts.length || attachedClaim) && (atts.some(a => R.docAtt.test(a.filename ?? '')) || R.docBody.test(nt)) && !R.renewNeg.test(nt) && nw <= 120 && !(R.quoteToClient.test(nt) && R.money.test(nt))) cls = 'document_send'
  else if (toCli && !toIns && !atts.length && R.docBody.test(nt) && nw <= 60 && !R.infoReq.test(nt)) cls = 'document_send'
  else if (/renewal/i.test(subj) && R.renewNeg.test(nt) && ((toIns && nw > 40) || (toCli && nw > 80))) cls = 'renewal_negotiation'
  else if (toIns && !toCli) {
    cls = 'forward_client_to_insurer'
    sub = claimThread ? 'claim_notify_or_docs' : (R.rfq.test(full) ? (/renewal/i.test(subj) ? 'renewal_terms_request' : 'quote_request') : R.endorse.test(full) ? 'endorsement_or_member_movement' : (atts.length || attachedClaim) ? 'docs_or_info_to_insurer' : R.infoReq.test(nt) ? 'question_to_insurer' : (fwd || nw <= 3) ? 'plain_forward' : 'update_to_insurer')
  }
  else if (toCli && claimThread) { cls = 'forward_insurer_to_client'; sub = R.infoReq.test(nt) && !R.quoteToClient.test(nt) ? 'claim_info_request_to_client' : 'claim_update' }
  else if (toCli && R.answer.test(nt) && nw >= 40 && !(fwd && atts.length)) cls = 'answer_question'
  else if (toCli && (fwd || atts.length || attachedClaim || (R.quoteToClient.test(nt) && R.money.test(nt)))) {
    cls = 'forward_insurer_to_client'
    sub = /renewal/i.test(subj) && /renewal (terms|invitation|premium)/i.test(nt) ? 'renewal_terms' : /quot|terms|premium|option|comparison|indicative|pleased to/i.test(full) ? 'quote_or_terms' : R.endorse.test(full) ? 'endorsement_confirm' : (fwd || nw <= 3) ? 'plain_forward' : 'docs_or_update_to_client'
  }
  else if (toCli && R.infoReq.test(nt)) { cls = 'request_info_from_client'; sub = /renewal/i.test(subj) ? 'renewal' : '' }
  else if (toCli && R.quoteToClient.test(nt)) { cls = 'forward_insurer_to_client'; sub = 'quote_or_terms' }
  else if (toCli && R.intro.test(nt)) { cls = 'other'; sub = 'prospecting_or_partnership' }
  else if (toCli && R.answer.test(nt)) cls = 'answer_question'
  else if (toCli && prevIn && nw <= 60) { cls = 'answer_question'; sub = 'short_reply' }
  else if (toCli && R.statusUpd.test(nt) && nw <= 150) { cls = 'forward_insurer_to_client'; sub = 'status_update_to_client' }
  else { cls = 'other'; sub = toCli ? 'client_misc' : 'misc' }
  const side: Side = toIns && toCli ? 'both' : toIns ? 'market' : toCli ? 'client' : 'none'
  return { cls, sub, tier: tierOf(cls, sub), side, words: nw, attachments: atts.length, effort: effortOf(nw, atts.length), sideChannel: R.sideChannel.test(nt0) }
}
