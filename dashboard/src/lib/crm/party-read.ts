/**
 * Who an outside sender is, read by rule from what the email itself carries. The domain → company
 * map (`partyOf`) answers first; this reads the senders it cannot place: a personal address, a
 * domain not on file, a business that refers clients (thread-party.ts: a referral).
 *
 *   address    the domain's own name is a company on file (mednefits.com → Mednefits)
 *   signature  the block under the closing names a company on file, or carries its web address
 *   voice      "our client", "the HR has added" is a referral; "your client", "our proposal",
 *              "the insured" is the market
 *
 * The address and the signature name the company; the voice names only the side. No model reads
 * anything here.
 *
 * Pure. Tested in __tests__/party-read.test.ts.
 */
import { withoutSignOff } from '@/lib/admin/a/history'
import { ownWords } from '@/lib/admin/b/relay/intent'
import { PUBLIC_EMAIL_DOMAINS, TRS_DOMAINS, bareEmail, emailDomain } from './db'
import { companyCore } from './resolve'
import { partyOfKind, type Party } from './thread-party'

export type OnFile = { id: string; name: string; kind: string }
export type NameIndex = { byCore: Map<string, OnFile>; bySquash: Map<string, OnFile> }
export type SenderRead = {
  party: Party
  by: 'address' | 'signature' | 'voice'
  /** The words the rule fired on. */
  cue: string
  /** The company on file the address or the signature names. */
  company: OnFile | null
}

const squash = (s: string) => s.replace(/[^a-z0-9]/g, '')
const partyOf = (kind: string): Party | null => partyOfKind(kind === 'tpa' ? 'insurer' : kind)

/** Company names on file, keyed the two ways an email carries them: as words and as a web address. */
export function indexNames(companies: readonly OnFile[]): NameIndex {
  const byCore = new Map<string, OnFile>(), bySquash = new Map<string, OnFile>()
  const clash = new Set<string>()
  for (const c of companies) {
    if (!partyOf(c.kind)) continue
    const core = companyCore(c.name)
    if (squash(core).length < 4) continue
    const was = byCore.get(core)
    // Two companies of different kinds under one name: the name says nothing about the sender.
    if (was && partyOf(was.kind) !== partyOf(c.kind)) clash.add(core)
    if (!was) { byCore.set(core, c); bySquash.set(squash(core), c) }
  }
  for (const core of clash) { byCore.delete(core); bySquash.delete(squash(core)) }
  return { byCore, bySquash }
}

/** Where a reply's quoted history starts when its header wraps over two lines. */
const QUOTE_HEAD = /^on (?:mon|tue|wed|thu|fri|sat|sun|\d)|^(?:from|sent|to|cc|subject|date|dari|pada)\s*:|(?:wrote|menulis|写道)\s*[:：]\s*$/i
function beforeQuote(text: string): string {
  const lines = text.split('\n')
  const k = lines.findIndex(l => QUOTE_HEAD.test(l.trim()))
  return k < 0 ? text : lines.slice(0, k).join('\n')
}

/** The block under the closing: the writer's name, title and company. */
export function signatureOf(body: string | null | undefined): string {
  const own = ownWords(body)
  const head = withoutSignOff(own)
  if (head.length < own.length) return beforeQuote(own.slice(head.length)).trim()
  // No closing line: the run of short lines the email ends on.
  const lines = own.split('\n').map(l => l.trim())
  const tail: string[] = []
  for (let k = lines.length - 1; k >= 0 && tail.length < 6; k--) {
    if (!lines[k]) { if (tail.length) break; continue }
    if (lines[k].length > 60 || /[.?!]$/.test(lines[k])) break
    tail.unshift(lines[k])
  }
  return tail.length < lines.filter(Boolean).length ? tail.join('\n') : ''
}

const SUFFIX = new Set(['com', 'co', 'net', 'org', 'sg', 'my', 'id', 'hk', 'au', 'uk', 'in', 'cn', 'jp', 'edu', 'gov', 'io', 'asia', 'biz', 'info', 'www', 'mail', 'email'])
/** The part of a domain that carries the organisation's name. */
function domainLabel(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(p => p && !SUFFIX.has(p))
  return squash(parts[parts.length - 1] ?? '')
}

/** The company on file whose name is the sender's own domain. Public mailboxes name no one. */
export function companyOfAddress(address: string | null | undefined, index: NameIndex): OnFile | null {
  const d = emailDomain(bareEmail(address))
  if (!d || PUBLIC_EMAIL_DOMAINS.has(d) || TRS_DOMAINS.has(d)) return null
  const label = domainLabel(d)
  return label.length >= 4 ? index.bySquash.get(label) ?? null : null
}

const SIGNATURE_LINES = 12
/** The company on file a signature block names, with the line that names it. */
export function companyInSignature(signature: string, index: NameIndex): { company: OnFile; cue: string } | null {
  const lines = signature.split('\n').map(l => l.trim()).filter(Boolean).slice(0, SIGNATURE_LINES)
  for (const line of lines) {
    if (line.length > 90) continue
    for (const part of [line, ...line.split(/\s*[|,·•\t]\s*|\s+[-–—@]\s+/)]) {
      const hit = index.byCore.get(companyCore(part))
      if (hit) return { company: hit, cue: line }
    }
    for (const m of line.matchAll(/(?:@|www\.|https?:\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      const d = m[1].toLowerCase().replace(/^www\./, '')
      if (PUBLIC_EMAIL_DOMAINS.has(d) || TRS_DOMAINS.has(d)) continue
      const label = domainLabel(d)
      const hit = label.length >= 4 ? index.bySquash.get(label) : undefined
      if (hit) return { company: hit, cue: line }
    }
  }
  return null
}

/** A referral speaks of the client as someone else's staff; so does no client. */
const REFERRAL_VOICE = new RegExp([
  String.raw`\b(?:our|my) (?:mutual |common |corporate )?(?:client|customer)s?\b`,
  String.raw`\bon behalf of (?:our|my|the) (?:client|customer|member|company)\b`,
  String.raw`\b(?:the|their|client'?s) hr (?:team )?(?:has |have |had |also |just )*(?:added|asked|requested|confirmed|replied|mentioned|informed|shared|sent|provided|updated|would like|wants?|needs?|is asking)\b`,
  String.raw`\brequest(?:s|ed)? (?:by|from) (?:the |their )?(?:hr|client)\b`,
  String.raw`\b(?:i am|i'm|we are|we're) (?:referring|introducing)\b`,
].join('|'), 'i')
/** The market speaks of the client as the broker's, and of terms as its own. */
const MARKET_VOICE = new RegExp([
  String.raw`\byour (?:client|customer|insured)(?:'s)?\b`, String.raw`\bthe (?:insured|proposer|policyholder)(?:'s)?\b`, String.raw`\bclient'?s budget\b`,
  String.raw`\bour (?:proposal|quotation|quote|terms|indication|underwriters?|underwriting(?: team)?|reinsurers?)\b`,
  String.raw`\bwe (?:are |will be |would be )?(?:unable|not able|not in a position|pleased|happy|glad) to (?:quote|offer|provide (?:terms|(?:a |our )quotation))\b`,
  String.raw`\bin order (?:for us )?to (?:quote|proceed with (?:the |our )?quotation)\b`,
  String.raw`\bsubject to (?:underwriting|underwriters?'? (?:approval|review))\b`,
].join('|'), 'i')
const VOICE_MAX = 2000

/** The side the words are written from. Null when they carry neither voice, or both. */
export function voiceOf(body: string | null | undefined): { party: 'referral' | 'insurer'; cue: string } | null {
  const text = withoutSignOff(ownWords(body)).slice(0, VOICE_MAX)
  const referral = REFERRAL_VOICE.exec(text), market = MARKET_VOICE.exec(text)
  if (!referral === !market) return null
  return referral ? { party: 'referral', cue: referral[0].toLowerCase() } : { party: 'insurer', cue: market![0].toLowerCase() }
}

/** One email's read of its sender: the address, then the signature, then the voice. */
export function readSender(m: { from_address: string | null; body_text: string | null }, index: NameIndex): SenderRead | null {
  const named = companyOfAddress(m.from_address, index)
  if (named) return { party: partyOf(named.kind)!, by: 'address', cue: emailDomain(bareEmail(m.from_address)), company: named }
  const signed = companyInSignature(signatureOf(m.body_text), index)
  if (signed) return { party: partyOf(signed.company.kind)!, by: 'signature', cue: signed.cue, company: signed.company }
  const voice = voiceOf(m.body_text)
  return voice ? { party: voice.party, by: 'voice', cue: voice.cue, company: null } : null
}

const RANK: Record<SenderRead['by'], number> = { address: 3, signature: 2, voice: 1 }
/**
 * One read per sender across their emails: a named company beats a voice, and among voices the
 * one heard more often holds. A sender heard in both voices equally reads as neither.
 */
export function readSenders(messages: readonly { from_address: string | null; body_text: string | null }[], index: NameIndex): Map<string, SenderRead> {
  const all = new Map<string, SenderRead[]>()
  for (const m of messages) {
    const address = bareEmail(m.from_address)
    const r = address ? readSender(m, index) : null
    if (r) all.set(address, [...(all.get(address) ?? []), r])
  }
  const out = new Map<string, SenderRead>()
  for (const [address, reads] of all) {
    const top = Math.max(...reads.map(r => RANK[r.by]))
    const best = reads.filter(r => RANK[r.by] === top)
    if (top > 1) { out.set(address, best[0]); continue }
    const referral = best.filter(r => r.party === 'referral').length
    if (referral * 2 !== best.length) out.set(address, best.find(r => (r.party === 'referral') === (referral * 2 > best.length))!)
  }
  return out
}
