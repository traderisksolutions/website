/**
 * The learning loop's reads and writes: the signals of a thread, the suggestions for one person, and
 * a dismissal. Scoring is pure in learn.ts. No model is called.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { learn, reasonOf, score, signalsOf, splitHistory } from './learn'
import { insurerDomains } from './desk-server'
import { sideOfAddress } from './desk'
import type { DeskSide } from './desk'

type Row = Record<string, any>

const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const SUGGEST_DAYS = 3
const MAX_SUGGESTIONS = 10

export type Suggestion = {
  threadId: string; subject: string; lastAt: string | null; side: DeskSide
  companyId: string | null; companyName: string | null; reason: string; rate: number
}

type ThreadRow = { id: string; subject?: string | null; display_subject?: string | null; company_id: string | null; category?: string | null; last_message_at?: string | null; companies?: { company_name?: string; kind?: string } | null }

/** For each thread: the client it is about (an insurer's thread names its client), and its signals for this person. */
async function factsFor(owner: string, threads: readonly ThreadRow[]): Promise<Map<string, { clientId: string | null; side: DeskSide; signals: string[] }>> {
  const out = new Map<string, { clientId: string | null; side: DeskSide; signals: string[] }>()
  if (!threads.length) return out
  const ids = threads.map(t => t.id)
  // Who wrote last from outside TRS decides the side: a thread filed under a client can be an insurer writing.
  const [domains, inbound] = await Promise.all([
    insurerDomains(),
    sbTry<Row[]>(`email_messages?thread_id=in.${inList(ids)}&direction=eq.inbound&deleted_at=is.null&select=thread_id,from_address&order=sent_at.desc&limit=3000`, []),
  ])
  const lastFrom = new Map<string, string>()
  for (const m of inbound) if (!lastFrom.has(m.thread_id)) lastFrom.set(m.thread_id, (String(m.from_address ?? '').match(/<(.+?)>/)?.[1] ?? String(m.from_address ?? '')).trim().toLowerCase())
  const kindOf = (t: ThreadRow): 'client' | 'insurer' | null => {
    const from = lastFrom.get(t.id)
    if (from && sideOfAddress(from, domains) === 'insurer') return 'insurer'
    if (t.companies?.kind === 'insurer') return 'insurer'
    return from || t.companies?.kind ? 'client' : null
  }
  const insurerIds = threads.filter(t => kindOf(t) === 'insurer').map(t => t.id)
  const [mine, links] = await Promise.all([
    sbTry<Row[]>(`today_threads?owner_email=eq.${enc(owner)}&select=company_id,removed_at&limit=5000`, []),
    insurerIds.length ? sbTry<Row[]>(`thread_insurers?thread_id=in.${inList(insurerIds)}&client_company_id=not.is.null&select=thread_id,client_company_id`, []) : Promise.resolve([] as Row[]),
  ])
  const onList = new Set(mine.filter(r => !r.removed_at && r.company_id).map(r => r.company_id as string))
  const ever = new Set(mine.filter(r => r.company_id).map(r => r.company_id as string))
  const clientOf = new Map(links.map(l => [l.thread_id as string, l.client_company_id as string]))
  for (const t of threads) {
    const kind = kindOf(t)
    const side: DeskSide = kind === 'insurer' ? 'insurer' : 'client'
    // An insurer writing on a thread filed under the client: the client is the thread's own company.
    const clientId = side === 'insurer' ? clientOf.get(t.id) ?? (t.companies?.kind !== 'insurer' ? t.company_id : null) : t.company_id
    out.set(t.id, {
      clientId, side,
      signals: signalsOf({ onList: !!clientId && onList.has(clientId), knownClient: !!clientId && ever.has(clientId), senderKind: kind, category: t.category ?? null }),
    })
  }
  return out
}

const THREAD_SELECT = 'id,subject,display_subject,company_id,category,last_message_at,companies(company_name,kind)'

/** The signals of threads about to be added, computed before the add so "on your list" means before. */
export async function signalsForAdd(owner: string, threadIds: readonly string[]): Promise<Map<string, string[]>> {
  if (!threadIds.length) return new Map()
  const threads = await sbTry<ThreadRow[]>(`email_threads?id=in.${inList(threadIds)}&select=${THREAD_SELECT}`, [])
  const facts = await factsFor(owner, threads)
  return new Map([...facts].map(([id, f]) => [id, f.signals]))
}

/** Threads of the last three days this person would likely add, strongest first. */
export async function suggestFor(owner: string, viewer: string): Promise<Suggestion[]> {
  const since = new Date(Date.now() - SUGGEST_DAYS * 86_400_000).toISOString()
  const [history, dismissed, recent] = await Promise.all([
    sbTry<Row[]>(`today_threads?owner_email=eq.${enc(owner)}&select=thread_id,signals,added_at,removed_at&limit=5000`, []),
    sbTry<Row[]>(`today_dismissals?owner_email=eq.${enc(owner)}&select=thread_id,signals,dismissed_at&limit=5000`, []),
    sbTry<ThreadRow[]>(`email_threads?last_message_at=gte.${enc(since)}&select=${THREAD_SELECT}&order=last_message_at.desc&limit=300`, []),
  ])
  const { positives, negatives } = splitHistory(history as never)
  const stats = learn(positives, [...negatives, ...dismissed.map(d => (d.signals ?? []) as string[])])
  const onList = new Set(history.filter(r => !r.removed_at).map(r => r.thread_id as string))
  const dismissedAt = new Map(dismissed.map(d => [d.thread_id as string, d.dismissed_at as string]))
  // A dismissal holds until the thread has a newer message.
  const open = recent.filter(t => !onList.has(t.id) && !(dismissedAt.get(t.id) && String(t.last_message_at ?? '') <= dismissedAt.get(t.id)!))
  if (!open.length) return []
  const visible = await visibleThreadIds(open.map(t => t.id), viewer)
  const seen = open.filter(t => visible.has(t.id))
  const facts = await factsFor(owner, seen)
  const clientIds = Array.from(new Set([...facts.values()].map(f => f.clientId).filter((x): x is string => !!x)))
  const names = clientIds.length ? new Map((await sbTry<Row[]>(`companies?id=in.${inList(clientIds)}&select=id,company_name`, [])).map(c => [c.id as string, c.company_name as string])) : new Map<string, string>()
  const out: Suggestion[] = []
  for (const t of seen) {
    const f = facts.get(t.id)
    if (!f) continue
    const best = score(f.signals, stats)
    if (!best) continue
    out.push({
      threadId: t.id, subject: t.display_subject || t.subject || '(no subject)', lastAt: t.last_message_at ?? null, side: f.side,
      companyId: f.clientId, companyName: f.clientId ? names.get(f.clientId) ?? null : null, reason: reasonOf(best), rate: best.rate,
    })
  }
  return out.sort((a, b) => b.rate - a.rate || String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? ''))).slice(0, MAX_SUGGESTIONS)
}

/** A suggestion the person does not want: kept as a negative for its signals. */
export async function dismissSuggestion(owner: string, threadId: string): Promise<void> {
  const signals = (await signalsForAdd(owner, [threadId])).get(threadId) ?? []
  await sb('today_dismissals?on_conflict=owner_email,thread_id', {
    method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ owner_email: owner, thread_id: threadId, signals, dismissed_at: new Date().toISOString() }),
  })
}
