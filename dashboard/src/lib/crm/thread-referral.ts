/**
 * A thread that came through a referral, as a person marks it in the Inbox rail. The mark is on
 * the thread alone: the company it is filed under keeps its kind, and no other thread changes
 * (the From label in thread-party.ts sets the company's kind for every thread from it).
 *
 *   threadReferral(threadId)                 the person's mark, and what the rules read when there is none
 *   setReferralTag(threadId, call, by)       'yes' keeps the rules' reading, 'no' says it is not one, null clears
 *   referralTags(threadIds)                  the marks on a case's threads, for its rounds
 *
 * The reading: a sender at the domain of a referral a person has checked (Today › Unfiled threads ›
 * Referrals), then the sender read (party-read.ts) over the outside senders no domain on file
 * places. A referral only mail filing created counts when its sender also writes as one. No model
 * is called. Marks are kept in app_settings under thread_referral:<id>.
 *
 * referralOn is pure. Tested in __tests__/thread-referral.test.ts.
 */
import { sb, sbTry, enc, inChunks, bareEmail, emailDomain } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { partyOf } from '@/lib/admin/k/shape'
import { indexNames, readSenders, referralAmong, type NameIndex, type OnFile, type SenderRead } from './party-read'

type Row = Record<string, any>
const KEY = 'thread_referral:'

export type ReferralTag = {
  referral: boolean
  /** The referring company on file, when the address or the signature named one. */
  companyId: string | null
  company: string | null
  by: string
  at: string
}
export type ReferralSuggestion = { companyId: string | null; company: string | null; by: SenderRead['by']; cue: string; sender: string }
export type ThreadReferral = { tag: ReferralTag | null; suggestion: ReferralSuggestion | null }

const tagOf = (value: unknown): ReferralTag | null => {
  try {
    const v = JSON.parse(String(value ?? ''))
    return typeof v?.referral === 'boolean' ? { referral: v.referral, companyId: v.companyId ?? null, company: v.company ?? null, by: String(v.by ?? ''), at: String(v.at ?? '') } : null
  } catch { return null }
}

/** The marks on these threads, by thread. */
export async function referralTags(threadIds: readonly string[]): Promise<Map<string, ReferralTag>> {
  const rows = await inChunks([...threadIds], 60, c => sbTry<Row[]>(`app_settings?key=in.(${c.map(id => enc(`"${KEY}${id}"`)).join(',')})&select=key,value`, []))
  const out = new Map<string, ReferralTag>()
  for (const r of rows) { const t = tagOf(r.value); if (t) out.set(String(r.key).slice(KEY.length), t) }
  return out
}

type Mail = { from_address: string | null; body_text: string | null }
const NO_NAMES = indexNames([])

/** The referral on file that holds a domain, and whether a person has checked it. */
export type ReferralAt = (domain: string) => { company: OnFile; checked: boolean } | null

/**
 * The referral among a thread's inbound emails. A sender at a checked referral's domain is one
 * unless they write in the market's voice; at an unchecked one's, only when they write in a
 * referral's. The senders no domain places are read by rule.
 */
export function referralOn(messages: readonly Mail[], domainKind: Map<string, string>, names: NameIndex, referralAt: ReferralAt): ReferralSuggestion | null {
  const kind = (m: Mail) => partyOf(m.from_address, domainKind)
  const reads = new Map(readSenders(messages.filter(m => kind(m) === 'other'), names))
  const voices = readSenders(messages.filter(m => kind(m) === 'partner'), NO_NAMES)
  for (const m of messages) {
    if (kind(m) !== 'partner') continue
    const address = bareEmail(m.from_address), domain = emailDomain(address)
    const held = referralAt(domain), voice = voices.get(address)
    if (held?.checked) { if (voice?.party !== 'insurer') reads.set(address, { party: 'referral', by: 'address', cue: domain, company: held.company }) }
    else if (voice?.party === 'referral') reads.set(address, { ...voice, company: held?.company ?? null })
  }
  const hit = referralAmong(reads)
  return hit ? { companyId: hit.read.company?.id ?? null, company: hit.read.company?.name ?? null, by: hit.read.by, cue: hit.read.cue, sender: hit.sender } : null
}

/** What the rules read on the thread: null when its company is already a referral or an insurer, or no sender reads as one. */
async function suggestionFor(threadId: string): Promise<ReferralSuggestion | null> {
  const [[thread], messages, dir, referrals] = await Promise.all([
    sbTry<Row[]>(`email_threads?id=eq.${enc(threadId)}&select=id,company_id&limit=1`, []),
    sbTry<Mail[]>(`email_messages?thread_id=eq.${enc(threadId)}&direction=eq.inbound&select=from_address,body_text&order=sent_at.asc&limit=60`, []),
    directory(),
    sbTry<Row[]>('companies?kind=eq.partner&select=id,company_name,domain,domains,confirmed_at&limit=1000', []),
  ])
  if (!thread) return null
  const kind = thread.company_id ? String(dir.byId.get(thread.company_id)?.kind ?? '') : ''
  if (kind === 'partner' || kind === 'insurer' || kind === 'tpa') return null
  const onFile: OnFile[] = [...dir.byId.values()].filter(c => c.company_name).map(c => ({ id: String(c.id), name: String(c.company_name), kind: String(c.kind ?? '') }))
  const at = new Map<string, NonNullable<ReturnType<ReferralAt>>>()
  for (const c of referrals) if (c.company_name) {
    for (const d of [c.domain, ...(Array.isArray(c.domains) ? c.domains : [])]) if (d && !at.has(String(d).toLowerCase())) at.set(String(d).toLowerCase(), { company: { id: String(c.id), name: String(c.company_name), kind: 'partner' }, checked: !!c.confirmed_at })
  }
  return referralOn(messages, dir.domainKind, indexNames(onFile), d => at.get(d) ?? null)
}

export async function threadReferral(threadId: string): Promise<ThreadReferral> {
  const tag = (await referralTags([threadId])).get(threadId) ?? null
  return { tag, suggestion: tag ? null : await suggestionFor(threadId) }
}

/** A person's call: 'yes' marks the thread with what the rules read, 'no' marks it as not a referral, null hands it back to the rules. */
export async function setReferralTag(threadId: string, call: 'yes' | 'no' | null, by: string): Promise<ThreadReferral> {
  const key = `${KEY}${threadId}`
  if (!call) {
    await sb(`app_settings?key=eq.${enc(key)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    return threadReferral(threadId)
  }
  const read = call === 'yes' ? await suggestionFor(threadId) : null
  const tag: ReferralTag = { referral: call === 'yes', companyId: read?.companyId ?? null, company: read?.company ?? null, by, at: new Date().toISOString() }
  await sb('app_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ key, value: JSON.stringify(tag), updated_at: tag.at }) })
  return { tag, suggestion: null }
}
