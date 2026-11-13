/**
 * The client an insurer or partner thread is about.
 *
 * A thread is filed under the company whose contact wrote it. When that company is an insurer or
 * a partner (Chubb quoting, Mednefits referring), the thread is about someone else: the client.
 * Until 11 Nov 2026 that client was known only for placement requests (88 threads); 618 insurer
 * and partner threads showed the insurer's own conversations as the thread's (a Bangkok itinerary
 * under an AAS WICA request). This module names the client and files it on `thread_insurers`.
 *
 * Rules first, by code, from the subject:
 *   name      "(TRS) QBE- OUE Limited"            → OUE Limited (every word of the name, in order)
 *   acronym   "(TRS) Chubb- AAS WIC"              → AUTOMOBILE ASSOCIATION OF SINGAPORE (A A S)
 *   domain    "Keller - WICA renewal"             → a client whose domain is keller.com.sg
 * One client only: two matches is no match. Then, where the rules find nothing, a model reads
 * the subject and the latest inbound message and names the insured as written; code matches the
 * name to the clients on file. A name with no company on file is kept on the row (`reason`),
 * so the rail can offer to create the company. A model never picks an id.
 */
import { sb, sbTry, enc } from './db'
import { callGemini } from '@/lib/ai-call'
import { aiBlocked } from '@/lib/ai-gate'
import { GEMINI_LITE } from '@/lib/gemini-models'
import { normCompany } from '@/lib/gb/intake'
import { createCompany } from './autofile'
import { linkThreadToCompany } from './triage'
import { recordHousekeeping } from '@/lib/agent-activity'

export type ClientRef = { id: string; company_name: string; domain?: string | null; domains?: string[] | null }

/** A name the model gave that cannot be a client: the broker itself, Kyn, a bare domain, a project. Pure. */
export function plausibleClientName(name: string): boolean {
  const n = name.trim()
  if (n.length < 3 || n.length > 120) return false
  if (/trade risk|\btrs\b|\bkyn\b|secondhuman/i.test(n)) return false
  if (/\.(com|sg|net|org|co|io|my|id)\b/i.test(n) || /@/.test(n)) return false
  if (/^(project|the project|renewal|policy|quotation|claim)\b/i.test(n)) return false
  return true
}
export type ClientMatch = { client: ClientRef; how: 'name' | 'acronym' | 'domain' }

/** Legal forms and articles: never part of what identifies a name. */
const FORM = new Set(['pte', 'ltd', 'limited', 'private', 'sdn', 'bhd', 'berhad', 'llp', 'llc', 'inc', 'co', 'company', 'corp', 'corporation', 'plc', 'the', 'and', 'of'])
/** Words too common to identify a name on their own. */
const LEGAL = new Set([...FORM, 'group', 'holdings', 'holding', 'singapore', 'sg', 's', 'e', 'asia'])
const GENERIC_LABELS = new Set(['gmail', 'yahoo', 'hotmail', 'outlook', 'live', 'mail', 'email', 'icloud', 'me', 'www'])

export const words = (s: string | null | undefined): string[] => (String(s ?? '').toLowerCase().match(/[a-z0-9&]+/g) ?? [])

/** The words of a name that identify it: "AUTOMOBILE ASSOCIATION OF SINGAPORE" → automobile, association. */
export const nameWords = (name: string): string[] => words(name).filter(w => !LEGAL.has(w))

/** "AUTOMOBILE ASSOCIATION OF SINGAPORE" → "AAS"; null when the name has fewer than three such words. */
export function acronym(name: string): string | null {
  const w = words(name).filter(x => !FORM.has(x) && /^[a-z]/.test(x))
  return w.length >= 3 ? w.map(x => x[0]).join('').toUpperCase() : null
}

function hasSequence(tokens: string[], seq: string[]): boolean {
  if (seq.length === 0) return false
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer
    return true
  }
  return false
}

/** The one client a subject names, or null when none or more than one does. Pure. */
export function matchClient(subject: string | null | undefined, clients: ClientRef[]): ClientMatch | null {
  const text = String(subject ?? '')
  if (!text.trim()) return null
  const tokens = words(text)
  const lower = new Set(tokens)
  const upper = new Set(text.match(/\b[A-Z][A-Z0-9&]{2,}\b/g) ?? [])
  const found = new Map<string, ClientMatch>()
  for (const c of clients) {
    const key = nameWords(c.company_name)
    if (key.length > 0 && key.join('').length >= 3 && hasSequence(tokens, key)) { found.set(c.id, { client: c, how: 'name' }); continue }
    const ac = acronym(c.company_name)
    if (ac && upper.has(ac)) { found.set(c.id, { client: c, how: 'acronym' }); continue }
    for (const d of [c.domain, ...(c.domains ?? [])]) {
      const label = String(d ?? '').toLowerCase().split('.')[0]
      if (label.length >= 3 && !GENERIC_LABELS.has(label) && lower.has(label)) { found.set(c.id, { client: c, how: 'domain' }); break }
    }
  }
  if (found.size === 1) return [...found.values()][0]
  if (found.size === 0) return null
  // Several: a name match beats an acronym or a domain; several name matches is ambiguous.
  const names = [...found.values()].filter(m => m.how === 'name')
  if (names.length === 1) return names[0]
  if (names.length > 1) {
    // "OUE Limited" and "OUE Hospitality Trust" both match "OUE": the longer name is the more specific
    // match only when the subject carries all of its words, which hasSequence already checked; so
    // the longest key wins only when every other key is a prefix of it.
    const sorted = names.sort((a, b) => nameWords(b.client.company_name).length - nameWords(a.client.company_name).length)
    const top = nameWords(sorted[0].client.company_name)
    return sorted.slice(1).every(m => { const k = nameWords(m.client.company_name); return k.every((w, i) => top[i] === w) }) ? sorted[0] : null
  }
  return null
}

/** The client whose name is this one, by normalised name or by the subject rules on the name. */
export function clientByName(name: string, clients: ClientRef[]): ClientRef | null {
  const key = normCompany(name)
  if (key.length >= 3) { const exact = clients.filter(c => normCompany(c.company_name) === key); if (exact.length === 1) return exact[0] }
  return matchClient(name, clients)?.client ?? null
}

type ThreadRow = { id: string; subject: string | null; company_id: string | null; companies: { kind: string | null; company_name: string } | null }
type LinkRow = { id: string; client_company_id: string | null; reason: string | null }

export const NAMED = 'named: '
export const NO_CLIENT = 'no client named'

export async function listClients(): Promise<ClientRef[]> {
  return sbTry<ClientRef[]>('companies?kind=eq.client&select=id,company_name,domain,domains&limit=5000', [])
}

async function loadThread(threadId: string): Promise<ThreadRow | null> {
  const [t] = await sbTry<ThreadRow[]>(`email_threads?id=eq.${enc(threadId)}&select=id,subject,company_id,companies(kind,company_name)&limit=1`, [])
  return t ?? null
}

/** Writes the client on the thread's row for its counterparty; never touches a row that already names one. */
/**
 * Files the client on the thread. An agent never replaces a client already filed; a person
 * (`override`) does. The thread's emails are then recorded in the client's knowledge base, and
 * taken out of the one it replaced: filing usually happens after the emails were first recorded.
 */
async function fileClient(thread: ThreadRow, clientId: string | null, reason: string, confidence: number | null, override = false): Promise<void> {
  if (!thread.company_id) return
  const [row] = await sbTry<LinkRow[]>(`thread_insurers?thread_id=eq.${enc(thread.id)}&insurer_company_id=eq.${enc(thread.company_id)}&select=id,client_company_id,reason&limit=1`, [])
  const now = new Date().toISOString()
  const before = row?.client_company_id && row.client_company_id !== thread.company_id ? row.client_company_id : null
  if (row) {
    if (before && !override) return
    await sbTry(`thread_insurers?id=eq.${enc(row.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ client_company_id: clientId, reason, confidence, updated_at: now }) })
  } else {
    await sbTry('thread_insurers', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      thread_id: thread.id, insurer_company_id: thread.company_id, client_company_id: clientId, via: 'subject', policy_status: 'none', policy_how: null, reason, confidence, updated_at: now,
    }) })
  }
  if (clientId && clientId !== before) {
    const { recordThread } = await import('@/lib/admin/k/deposit')
    await recordThread(thread.id, before).catch(e => console.error('[client-link] record thread', thread.id, e))
  }
}

/** The model's read of who the insured is. A name as written, or null. */
async function readClientName(thread: ThreadRow): Promise<{ name: string | null; confidence: number }> {
  const msgs = await sbTry<{ body_text: string | null; from_address: string | null }[]>(`email_messages?thread_id=eq.${enc(thread.id)}&deleted_at=is.null&select=body_text,from_address&order=sent_at.desc&limit=2`, [])
  const body = msgs.map(m => `--- ${m.from_address ?? ''}\n${(m.body_text ?? '').slice(0, 2500)}`).join('\n\n')
  const { text } = await callGemini({
    agent: 'housekeeping', feature: 'thread_client_name', model: GEMINI_LITE, json: true, temperature: 0, maxOutputTokens: 120,
    system: `An email thread between the insurance broker Trade Risk Solutions (TRS) and ${thread.companies?.company_name ?? 'a counterparty'}, ${thread.companies?.kind === 'partner' ? 'a partner that refers business' : 'an insurer'}. Which company is the INSURED this thread is about: the broker's client, whose policy, quote, claim or renewal is discussed? Not the insurer, not the broker, not a person. Copy its name as written. If no client company is named, answer null.\nReturn JSON only: { "client": string | null, "confidence": 0 to 1 }`,
    metadata: { thread_id: thread.id }, parts: [{ text: `SUBJECT: ${thread.subject ?? ''}\n\n${body}`.slice(0, 9000) }],
  })
  try {
    const r = JSON.parse((text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '')) as { client?: unknown; confidence?: unknown }
    const name = typeof r.client === 'string' ? r.client.trim().slice(0, 120) : ''
    const conf = typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0
    return { name: plausibleClientName(name) && conf >= 0.5 ? name : null, confidence: conf }
  } catch { return { name: null, confidence: 0 } }
}

export type LinkOutcome = { clientId: string | null; named: string | null; how: 'name' | 'acronym' | 'domain' | 'model' | 'none' | 'skip' }

/**
 * Names the client of one insurer or partner thread and files it. `model` false keeps it to the
 * rules (the nightly sweep over hundreds of threads). Idempotent; a row that already names a
 * client is left alone. `force` lets the model read a thread it read before (Read thread, by a person).
 */
export async function linkClientForThread(threadId: string, opts: { clients?: ClientRef[]; model?: boolean; force?: boolean } = {}): Promise<LinkOutcome> {
  const thread = await loadThread(threadId)
  if (!thread?.company_id || !(thread.companies?.kind === 'insurer' || thread.companies?.kind === 'partner')) return { clientId: null, named: null, how: 'skip' }
  const clients = opts.clients ?? await listClients()
  const [existing] = await sbTry<LinkRow[]>(`thread_insurers?thread_id=eq.${enc(thread.id)}&insurer_company_id=eq.${enc(thread.company_id)}&select=id,client_company_id,reason&limit=1`, [])
  if (existing?.client_company_id && existing.client_company_id !== thread.company_id) return { clientId: existing.client_company_id, named: null, how: 'skip' }
  const m = matchClient(thread.subject, clients)
  if (m) { await fileClient(thread, m.client.id, `client by ${m.how}`, 0.9); return { clientId: m.client.id, named: null, how: m.how } }
  // A name the model gave earlier may match a client created since.
  const earlier = existing?.reason?.startsWith(NAMED) ? existing.reason.slice(NAMED.length) : null
  if (earlier) {
    const c = clientByName(earlier, clients)
    if (c) { await fileClient(thread, c.id, `client by model, matched later`, 0.8); return { clientId: c.id, named: null, how: 'model' } }
  }
  // `force`: a person pressed Read thread, so the model reads again even where it found nothing before.
  if (!opts.model || (existing && !opts.force)) return { clientId: null, named: earlier, how: 'none' }
  // Manual AI: a refused read files nothing, so the thread is not marked as naming no client.
  if (await aiBlocked()) return { clientId: null, named: earlier, how: 'none' }
  const read = await readClientName(thread)
  if (!read.name) { await fileClient(thread, null, NO_CLIENT, read.confidence); return { clientId: null, named: null, how: 'none' } }
  const c = clientByName(read.name, clients)
  if (c) { await fileClient(thread, c.id, 'client by model', read.confidence); return { clientId: c.id, named: null, how: 'model' } }
  await fileClient(thread, null, `${NAMED}${read.name}`, read.confidence)
  return { clientId: null, named: read.name, how: 'model' }
}

/** Every insurer and partner thread active since `since` with no client on file: rules on all, the model on at most `agentLimit`. */
export async function sweepClientLinks(opts: { since?: string; agentLimit?: number } = {}): Promise<{ threads: number; linked: number; named: number; byModel: number }> {
  const since = opts.since ? `&last_message_at=gte.${enc(opts.since)}` : ''
  const threads: { id: string }[] = []
  for (let off = 0; ; off += 1000) {
    const r = await sbTry<{ id: string }[]>(`email_threads?deleted_at=is.null&select=id,companies!inner(kind)&companies.kind=in.(insurer,partner)${since}&order=last_message_at.desc&limit=1000&offset=${off}`, [])
    threads.push(...r)
    if (r.length < 1000) break
  }
  const clients = await listClients()
  let agentLeft = opts.agentLimit ?? 40
  const out = { threads: threads.length, linked: 0, named: 0, byModel: 0 }
  for (const t of threads) {
    const r = await linkClientForThread(t.id, { clients, model: agentLeft > 0 }).catch(() => null)
    if (!r) continue
    if (r.how === 'model') { agentLeft--; out.byModel++ }
    if (r.clientId && r.how !== 'skip') out.linked++
    if (r.named) out.named++
  }
  return out
}

/**
 * A benefits request names its insured ("OUE Group" in the census, sent by the partner Mednefits).
 * When the thread is filed under a partner, an insurer or nothing, the insured becomes a client on
 * file (created when new) and the thread is linked to it, so the quotation, the census and the
 * thread meet on one company page. A thread already filed under a client is left alone.
 */
export async function ensureClientForRequest(threadId: string, companyName: string, basis: string): Promise<{ clientId: string; created: boolean } | null> {
  const name = companyName.trim()
  if (name.length < 3 || /^group benefits request$/i.test(name)) return null
  const thread = await loadThread(threadId)
  if (!thread || thread.companies?.kind === 'client' || (thread.company_id && !thread.companies)) return null
  const clients = await listClients()
  let client = clientByName(name, clients)
  let created = false
  if (!client) {
    const id = await createCompany({ name, kind: 'client', domains: [], note: basis, confidence: 0.85 })
    if (!id) return null
    client = { id, company_name: name }
    created = true
  }
  if (!thread.company_id) await linkThreadToCompany(threadId, client.id)
  else await fileClient(thread, client.id, 'client named in the benefits request', 0.9)
  recordHousekeeping({ action: 'thread.client_linked', subject: client.company_name, resourceType: 'email_thread', resourceId: threadId, basis: created ? `${basis}; company created` : basis, metadata: { client_id: client.id, created } })
  return { clientId: client.id, created }
}

/** A person names the client for a counterparty thread: an existing company, or a new one by name. */
export async function setClientForThread(threadId: string, pick: { companyId?: string | null; name?: string | null }, by: string | null): Promise<{ clientId: string; created: boolean } | null> {
  const thread = await loadThread(threadId)
  if (!thread?.company_id) return null
  let clientId = pick.companyId ?? null
  let created = false
  if (!clientId) {
    const name = (pick.name ?? '').trim()
    if (name.length < 2) return null
    const existing = clientByName(name, await listClients())
    clientId = existing?.id ?? await createCompany({ name, kind: 'client', domains: [], note: `Named on the thread "${thread.subject ?? ''}" by ${by ?? 'a person'}`, confidence: 1 })
    created = !existing && !!clientId
    if (!clientId) return null
  }
  await fileClient(thread, clientId, `client set by ${by ?? 'a person'}`, 1, true)
  return { clientId, created }
}
