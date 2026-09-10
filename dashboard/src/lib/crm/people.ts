/**
 * Who the point people are at a company, derived from correspondence rather than assigned.
 *
 * Every external address that appears on the company's threads (From, To and Cc) is counted.
 * People who write to us score highest, people we write to next, people only copied least.
 * The top scorer on the client side is marked primary. Insurer and TRS addresses that show up
 * on the same threads are kept but labelled, so the page can show "also on these threads".
 */
import { sbTry, inChunks, getCompanyThreadIds, isInternal, isAutomated, emailDomain, PUBLIC_EMAIL_DOMAINS } from './db'
import { personName } from './format'
import type { Company, Person, PersonParty } from './types'

type Participant = { thread_id: string; message_id: string | null; email: string; name: string | null; role: 'from' | 'to' | 'cc' | 'bcc'; contact_id: string | null }
type MsgRow = { id: string; thread_id: string; direction: 'inbound' | 'outbound'; sent_at: string }
type ThreadCat = { id: string; category: string | null }
type ContactRow = { id: string; email: string | null; first_name: string | null; last_name: string | null; company_id: string | null }

const WEIGHT = { sent: 3, received: 1, cc: 0.5 }

export interface PeopleResult {
  people: Person[]
  primary: Person | null
  /** Domains seen on the client side, so the company's domain list can be completed. */
  observedDomains: { domain: string; count: number }[]
}

export async function rankPeople(company: Company, threadIds?: string[]): Promise<PeopleResult> {
  const ids = threadIds ?? await getCompanyThreadIds(company.id)
  if (ids.length === 0) return { people: [], primary: null, observedDomains: [] }

  const [participants, messages, threadCats, insurerEmails, companyContacts] = await Promise.all([
    inChunks(ids, 100, c => sbTry<Participant[]>(`email_participants?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=thread_id,message_id,email,name,role,contact_id`, [])),
    inChunks(ids, 100, c => sbTry<MsgRow[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,sent_at`, [])),
    inChunks(ids, 100, c => sbTry<ThreadCat[]>(`email_threads?id=in.(${c.join(',')})&select=id,category`, [])),
    sbTry<{ contact_email: string }[]>(`insurer_contacts?select=contact_email`, []),
    sbTry<ContactRow[]>(`contacts?company_id=eq.${company.id}&select=id,email,first_name,last_name,company_id`, []),
  ])

  const msgById = new Map(messages.map(m => [m.id, m]))
  const catByThread = new Map(threadCats.map(t => [t.id, t.category ?? 'general']))
  const insurerSet = new Set(insurerEmails.map(r => r.contact_email.toLowerCase()))
  const contactByEmail = new Map(companyContacts.filter(c => c.email).map(c => [c.email!.toLowerCase(), c]))
  const companyDomains = new Set(company.domains)

  type Acc = Person & { threadSet: Set<string>; topicCounts: Map<string, number> }
  const acc = new Map<string, Acc>()

  for (const p of participants) {
    const email = (p.email ?? '').trim().toLowerCase()
    if (!email || isAutomated(email)) continue
    const msg = p.message_id ? msgById.get(p.message_id) : undefined
    const domain = emailDomain(email)
    const contact = contactByEmail.get(email)
    let a = acc.get(email)
    if (!a) {
      const party: PersonParty = isInternal(email) ? 'trs'
        : insurerSet.has(email) ? 'insurer'
        : (companyDomains.has(domain) || contact) ? 'client'
        : 'other'
      a = {
        email, name: p.name?.trim() || (contact ? personName(contact.first_name, contact.last_name, null) : null) || null,
        contactId: p.contact_id ?? contact?.id ?? null, party, domain,
        sent: 0, received: 0, cc: 0, threads: 0, score: 0, firstSeen: null, lastSeen: null, topics: [], isPrimary: false,
        threadSet: new Set(), topicCounts: new Map(),
      }
      acc.set(email, a)
    }
    if (!a.name && p.name?.trim()) a.name = p.name.trim()
    if (p.role === 'from') a.sent++
    else if (p.role === 'to') a.received++
    else a.cc++
    a.threadSet.add(p.thread_id)
    const cat = catByThread.get(p.thread_id) ?? 'general'
    a.topicCounts.set(cat, (a.topicCounts.get(cat) ?? 0) + 1)
    const at = msg?.sent_at ?? null
    if (at) {
      if (!a.firstSeen || at < a.firstSeen) a.firstSeen = at
      if (!a.lastSeen  || at > a.lastSeen)  a.lastSeen  = at
    }
  }

  const now = Date.now()
  const people: Person[] = Array.from(acc.values()).map(a => {
    const recencyDays = a.lastSeen ? (now - new Date(a.lastSeen).getTime()) / 86_400_000 : 365
    const recency = Math.max(0, 1 - recencyDays / 365)            // 1.0 today → 0 after a year
    const raw = a.sent * WEIGHT.sent + a.received * WEIGHT.received + a.cc * WEIGHT.cc
    const { threadSet, topicCounts, ...rest } = a
    return {
      ...rest,
      threads: threadSet.size,
      score: Math.round((raw * (0.6 + 0.4 * recency)) * 10) / 10,
      topics: Array.from(topicCounts.entries()).map(([category, count]) => ({ category, count })).sort((x, y) => y.count - x.count),
    }
  })

  const partyOrder: Record<PersonParty, number> = { client: 0, other: 1, insurer: 2, trs: 3 }
  people.sort((x, y) => partyOrder[x.party] - partyOrder[y.party] || y.score - x.score)

  const primary = people.find(p => p.party === 'client') ?? null
  if (primary) primary.isPrimary = true

  const domCounts = new Map<string, number>()
  for (const p of people) {
    if (p.party !== 'client' && p.party !== 'other') continue
    if (!p.domain || PUBLIC_EMAIL_DOMAINS.has(p.domain)) continue
    domCounts.set(p.domain, (domCounts.get(p.domain) ?? 0) + p.sent + p.received + p.cc)
  }
  const observedDomains = Array.from(domCounts.entries()).map(([domain, count]) => ({ domain, count })).sort((x, y) => y.count - x.count)

  return { people, primary, observedDomains }
}
