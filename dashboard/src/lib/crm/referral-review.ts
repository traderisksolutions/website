/**
 * The referral list for review: every company of kind partner, with what its emails show, so a
 * person keeps it as a referral or sets the kind it is. Mail filing creates a partner for any
 * sender it cannot place as a client or an insurer, so the list also holds banks, software
 * notices and personal mailboxes.
 *
 *   referralReview(viewer)    the rows, unchecked first, then by threads
 *   buildReferralRows(input)  the same from loaded rows (pure; tested in __tests__/referral-review.test.ts)
 *
 * "Reads as" counts the emails written in a referral's voice and in the market's (party-read.ts)
 * on the referral's five latest threads. No model is called. A subject from a colleague's mailbox is withheld.
 */
import { sbTry, inChunks, isAutomated, isInternal, sbAll } from './db'
import { voiceOf } from './party-read'
import { visibleThreadIds } from '@/lib/mail/visibility-server'

type Row = Record<string, any>

export type ReferralRow = {
  id: string
  name: string
  /** partner on load; the kind a person set in this sitting after. */
  kind: string
  domains: string[]
  /** Other companies on file that hold one of its domains. */
  shared: { id: string; name: string; kind: string }[]
  threads: number
  /** Emails TRS wrote on its threads. */
  fromTrs: number
  last: { at: string | null; subject: string | null; private: boolean } | null
  voice: { referral: number; market: number }
  checkedAt: string | null
  checkedBy: string | null
}

const domainsOf = (c: Row): string[] => Array.from(new Set([c.domain, ...(Array.isArray(c.domains) ? c.domains : [])].filter(Boolean).map(d => String(d).toLowerCase())))

export function buildReferralRows(i: {
  /** Every company on file: the partners are listed, the rest say who else holds a domain. */
  companies: readonly Row[]
  threads: readonly { id: string; company_id: string; subject: string | null; last_message_at: string | null }[]
  messages: readonly { thread_id: string; direction: string | null; from_address: string | null; body_text: string | null }[]
  visible: ReadonlySet<string>
}): ReferralRow[] {
  const holders = new Map<string, Row[]>()
  for (const c of i.companies) for (const d of domainsOf(c)) holders.set(d, [...(holders.get(d) ?? []), c])
  const threadsOf = new Map<string, typeof i.threads[number][]>()
  for (const t of i.threads) threadsOf.set(t.company_id, [...(threadsOf.get(t.company_id) ?? []), t])
  const mailOf = new Map<string, typeof i.messages[number][]>()
  for (const m of i.messages) mailOf.set(m.thread_id, [...(mailOf.get(m.thread_id) ?? []), m])

  const rows = i.companies.filter(c => c.kind === 'partner').map((c): ReferralRow => {
    const domains = domainsOf(c)
    const threads = [...(threadsOf.get(c.id) ?? [])].sort((a, b) => String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
    const mail = threads.flatMap(t => mailOf.get(t.id) ?? [])
    const voice = { referral: 0, market: 0 }
    let fromTrs = 0
    for (const m of mail) {
      if (m.direction === 'outbound' || isInternal(m.from_address)) { fromTrs++; continue }
      if (isAutomated(m.from_address)) continue
      const v = voiceOf(m.body_text)
      if (v) voice[v.party === 'referral' ? 'referral' : 'market']++
    }
    const shared = new Map<string, Row>()
    for (const d of domains) for (const o of holders.get(d) ?? []) if (o.id !== c.id) shared.set(o.id, o)
    const latest = threads[0]
    return {
      id: String(c.id), name: String(c.company_name ?? ''), kind: 'partner', domains,
      shared: [...shared.values()].map(o => ({ id: String(o.id), name: String(o.company_name ?? ''), kind: String(o.kind ?? '') })),
      threads: threads.length, fromTrs,
      last: latest ? (i.visible.has(latest.id) ? { at: latest.last_message_at, subject: latest.subject, private: false } : { at: latest.last_message_at, subject: null, private: true }) : null,
      voice, checkedAt: c.confirmed_at ?? null, checkedBy: c.confirmed_by ?? null,
    }
  })
  return rows.sort((a, b) => Number(!!a.checkedAt) - Number(!!b.checkedAt) || b.threads - a.threads || a.name.localeCompare(b.name))
}

/** The threads per referral whose emails are read for their voice: its latest. */
const VOICE_THREADS = 5
const chunks = <T,>(all: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(all.length / size) }, (_, k) => all.slice(k * size, k * size + size))

export async function referralReview(viewer: string | null): Promise<ReferralRow[]> {
  const companies = await sbTry<Row[]>('companies?select=id,company_name,kind,domain,domains,confirmed_at,confirmed_by&limit=5000', [])
  const partners = companies.filter(c => c.kind === 'partner').map(c => String(c.id))
  const threads = await inChunks(partners, 40, c => sbTry<{ id: string; company_id: string; subject: string | null; last_message_at: string | null }[]>(`email_threads?company_id=in.(${c.join(',')})&deleted_at=is.null&select=id,company_id,subject,last_message_at&order=last_message_at.desc.nullslast&limit=1000`, []))
  const ids = threads.map(t => t.id)
  const taken = new Map<string, number>()
  const read = threads.filter(t => { const n = taken.get(t.company_id) ?? 0; taken.set(t.company_id, n + 1); return n < VOICE_THREADS }).map(t => t.id)
  // Who wrote on every thread; the words of the latest threads only, which is most of the weight.
  const [mail, bodies, visible] = await Promise.all([
    inChunks(ids, 60, c => sbAll<{ id: string; thread_id: string; direction: string | null; from_address: string | null }>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address&limit=5000`)),
    Promise.all(chunks(read, 10).map(c => sbTry<{ id: string; body_text: string | null }[]>(`email_messages?thread_id=in.(${c.join(',')})&deleted_at=is.null&direction=eq.inbound&select=id,body_text&limit=1000`, []))),
    visibleThreadIds(ids, viewer),
  ])
  const words = new Map(bodies.flat().map(b => [b.id, b.body_text]))
  return buildReferralRows({ companies, threads, messages: mail.map(m => ({ ...m, body_text: words.get(m.id) ?? null })), visible })
}
