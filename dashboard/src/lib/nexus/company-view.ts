/**
 * One client's whole correspondence for Nexus: every message on the client's own threads and on
 * every insurer thread filed against the client (thread_insurers), in date order, each tagged with
 * the party who wrote it. Beside it the open follow-ups on those threads and the latest case
 * analysis (stage, scenarios with probability, next steps). Read only.
 */
import { sbTry, inChunks } from '@/lib/crm/db'
import { threadTitle } from '@/lib/crm/subject'
import { shortInsurer } from '@/lib/gb/insurer-names'
import { normCompany } from '@/lib/gb/intake'

export type Party = 'client' | 'trs' | 'insurer' | 'other'
export type NexusThread = { id: string; title: string; kind: 'client' | 'insurer'; insurer: string | null; last_message_at: string | null; messages: number }
export type NexusMessage = {
  id: string; thread_id: string; sent_at: string | null; party: Party; who: string; to_party: string
  subject: string | null; snippet: string; has_attachments: boolean
}
export type NexusFollowUp = { id: string; owner_party: string; counterparty_name: string | null; what: string; due_at: string | null; status: string; thread_id: string | null }
export type NexusScenario = { name: string; probability: string; outcome: string; trs_action: string }
export type NexusStep = { step: number; action: string; owner: string; deadline?: string; priority: string; rationale: string }
export type NexusAnalysis = {
  case_id: string; case_name: string; analysed_at: string | null; stage: string | null; summary: string | null
  blocking: string[]; scenarios: NexusScenario[]; next_steps: NexusStep[]; linked_threads: number
}
export type CompanyNexusView = {
  company: { id: string; name: string; kind: string | null }
  threads: NexusThread[]; messages: NexusMessage[]; follow_ups: NexusFollowUp[]; analysis: NexusAnalysis | null
}

const TRS_DOMAIN = 'trade-risksol.com'
const domainOf = (e: string | null) => (e ?? '').toLowerCase().split('@')[1] ?? ''
const localOf = (e: string | null) => (e ?? '').split('@')[0]
const nameOf = (raw: string | null) => (raw ?? '').replace(/<.*>/, '').replace(/"/g, '').trim()

/** The new part of an email: the reply above the quoted history, on one line. */
export function snippetOf(body: string | null, max = 240): string {
  const lines = (body ?? '').replace(/\r/g, '').split('\n')
  const cut = lines.findIndex(l => /^\s*(From:|On .+wrote:|-{3,}\s*Original Message|_{6,}|>)/i.test(l))
  const text = (cut >= 0 ? lines.slice(0, cut) : lines).join(' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const STOP = new Set(['the', 'pte', 'ltd', 'trs', 'group', 'singapore', 'asia', 'international', 'holdings', 'company'])
/** The subject names this client: its full name, or its first distinctive word as a whole word ("CHEC" in "CHEC SG"). */
export function subjectNames(subject: string, companyName: string): boolean {
  const key = normCompany(companyName)
  if (key.length >= 5 && normCompany(subject).includes(key)) return true
  const first = companyName.toLowerCase().match(/[a-z0-9&]+/g)?.find(w => w.length >= 3 && !STOP.has(w))
  return !!first && new RegExp(`(^|[^a-z0-9])${first.replace(/[&]/g, '\\&')}([^a-z0-9]|$)`, 'i').test(subject)
}

export async function loadCompanyNexus(companyId: string, limit = 400): Promise<CompanyNexusView | null> {
  const [co] = await sbTry<{ id: string; company_name: string; kind: string | null; domains: string[] | null }[]>(`companies?id=eq.${companyId}&select=id,company_name,kind,domains&limit=1`, [])
  if (!co) return null
  const [own, filed] = await Promise.all([
    sbTry<{ id: string; subject: string | null; display_subject: string | null; last_message_at: string | null }[]>(`email_threads?company_id=eq.${companyId}&deleted_at=is.null&select=id,subject,display_subject,last_message_at&order=last_message_at.desc&limit=300`, []),
    sbTry<{ thread_id: string; insurer_company_id: string }[]>(`thread_insurers?client_company_id=eq.${companyId}&select=thread_id,insurer_company_id`, []),
  ])
  // Insurer threads filed without a client: the client is the one the subject names ("(TRS) Zurich - CHEC Stevens Rd GPA").
  // A row whose "client" is the insurer itself was filed from the insurer's side and counts as unknown too.
  const loose = (await sbTry<{ thread_id: string; insurer_company_id: string; client_company_id: string | null }[]>('thread_insurers?select=thread_id,insurer_company_id,client_company_id&limit=5000', []))
    .filter(r => !r.client_company_id || r.client_company_id === r.insurer_company_id)
  const subjects = new Map((await inChunks([...new Set(loose.map(r => r.thread_id))], 80, ids => sbTry<{ id: string; subject: string | null }[]>(`email_threads?id=in.(${ids.join(',')})&select=id,subject`, [])))
    .map(t => [t.id, t.subject ?? '']))
  for (const r of loose) if (subjectNames(subjects.get(r.thread_id) ?? '', co.company_name)) filed.push({ thread_id: r.thread_id, insurer_company_id: r.insurer_company_id })
  const filedIds = [...new Set(filed.map(f => f.thread_id))].filter(id => !own.some(t => t.id === id))
  const filedThreads = await inChunks(filedIds, 80, ids => sbTry<typeof own>(`email_threads?id=in.(${ids.join(',')})&deleted_at=is.null&select=id,subject,display_subject,last_message_at`, []))
  const insurerIds = [...new Set(filed.map(f => f.insurer_company_id))]
  const insurers = new Map((await inChunks(insurerIds, 80, ids => sbTry<{ id: string; company_name: string; domains: string[] | null }[]>(`companies?id=in.(${ids.join(',')})&select=id,company_name,domains`, [])))
    .map(c => [c.id, c]))
  const insurerOfThread = new Map(filed.map(f => [f.thread_id, insurers.get(f.insurer_company_id)]))
  const clientDomains = new Set((co.domains ?? []).map(d => d.toLowerCase()))

  const threadRows = [...own.map(t => ({ t, kind: 'client' as const })), ...filedThreads.map(t => ({ t, kind: 'insurer' as const }))]
  const threadIds = threadRows.map(x => x.t.id)
  const msgs = (await inChunks(threadIds, 60, ids => sbTry<{ id: string; thread_id: string; direction: string; from_address: string | null; subject: string | null; body_text: string | null; sent_at: string | null; has_attachments: boolean | null }[]>(
    `email_messages?thread_id=in.(${ids.join(',')})&deleted_at=is.null&select=id,thread_id,direction,from_address,subject,body_text,sent_at,has_attachments&order=sent_at.desc&limit=${limit}`, [])))
    .sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? '')).slice(0, limit)

  const insurerByDomain = (d: string) => [...insurers.values()].find(i => (i.domains ?? []).some(x => x.toLowerCase() === d))
  const countBy = new Map<string, number>()
  const messages: NexusMessage[] = msgs.map(m => {
    countBy.set(m.thread_id, (countBy.get(m.thread_id) ?? 0) + 1)
    const d = domainOf(m.from_address)
    const ins = insurerOfThread.get(m.thread_id) ?? null
    let party: Party, who: string
    if (d === TRS_DOMAIN || m.direction === 'outbound') { party = 'trs'; who = `TRS · ${localOf(m.from_address).replace(/[._]/g, ' ')}` }
    else if (clientDomains.has(d)) { party = 'client'; who = nameOf(m.from_address) || co.company_name }
    else if (insurerByDomain(d) || ins) { party = 'insurer'; who = shortInsurer((insurerByDomain(d) ?? ins)!.company_name) }
    else if (!ins) { party = 'client'; who = nameOf(m.from_address) || localOf(m.from_address) }
    else { party = 'other'; who = d || 'Unknown' }
    const to_party = party === 'trs' ? (ins ? shortInsurer(ins.company_name) : co.company_name) : 'TRS'
    return { id: m.id, thread_id: m.thread_id, sent_at: m.sent_at, party, who, to_party, subject: m.subject, snippet: snippetOf(m.body_text), has_attachments: !!m.has_attachments }
  })

  const threads: NexusThread[] = threadRows.map(({ t, kind }) => {
    const ins = insurerOfThread.get(t.id)
    return { id: t.id, title: threadTitle(t), kind, insurer: ins ? shortInsurer(ins.company_name) : null, last_message_at: t.last_message_at, messages: countBy.get(t.id) ?? 0 }
  })

  const follow_ups = (await inChunks(threadIds, 80, ids => sbTry<NexusFollowUp[]>(`follow_ups?thread_id=in.(${ids.join(',')})&status=eq.open&select=id,owner_party,counterparty_name,what,due_at,status,thread_id`, [])))
    .sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))

  return { company: { id: co.id, name: co.company_name, kind: co.kind }, threads, messages, follow_ups, analysis: await latestAnalysis(companyId) }
}

async function latestAnalysis(companyId: string): Promise<NexusAnalysis | null> {
  const cases = await sbTry<{ id: string; name: string }[]>(`cases?company_id=eq.${companyId}&select=id,name&order=updated_at.desc&limit=5`, [])
  for (const c of cases) {
    const [a] = await sbTry<{ created_at: string; structured_analysis: Record<string, any> | null }[]>(`case_analyses?case_id=eq.${c.id}&structured_analysis=not.is.null&select=created_at,structured_analysis&order=created_at.desc&limit=1`, [])
    const links = await sbTry<{ thread_id: string }[]>(`case_threads?case_id=eq.${c.id}&select=thread_id`, [])
    const sa = a?.structured_analysis
    if (!sa && c !== cases[0]) continue
    return {
      case_id: c.id, case_name: c.name, analysed_at: a?.created_at ?? null, linked_threads: links.length,
      stage: sa?.case_brief?.current_stage ?? null, summary: sa?.case_brief?.summary ?? null, blocking: sa?.case_brief?.blocking_issues ?? [],
      scenarios: (sa?.scenario_analysis ?? []).map((s: any) => ({ name: s.name, probability: s.probability, outcome: s.outcome, trs_action: s.trs_action })),
      next_steps: (sa?.recommended_next_steps ?? []).map((s: any) => ({ step: s.step, action: s.action, owner: s.owner, deadline: s.deadline, priority: s.priority, rationale: s.rationale })),
    }
  }
  return null
}

/**
 * The client's Nexus case with every thread above linked: the newest open case for the company,
 * or a new one. Linking is idempotent (case_id, thread_id), so a re-run only adds new threads.
 */
export async function ensureCompanyCase(companyId: string, sbWrite: <T>(path: string, init: RequestInit) => Promise<T>): Promise<{ case_id: string; linked: number } | null> {
  const view = await loadCompanyNexus(companyId, 1)
  if (!view) return null
  const [open] = await sbTry<{ id: string }[]>(`cases?company_id=eq.${companyId}&status=eq.open&select=id&order=updated_at.desc&limit=1`, [])
  const caseId = open?.id ?? (await sbWrite<{ id: string }[]>('cases', { method: 'POST', body: JSON.stringify({ name: `${view.company.name} — all correspondence`, status: 'open', company_id: companyId }) }))[0].id
  const rows = view.threads.map(t => ({ case_id: caseId, thread_id: t.id, party_type: t.kind, party_label: t.kind === 'insurer' ? t.insurer : view.company.name }))
  if (rows.length) await sbWrite('case_threads?on_conflict=case_id,thread_id', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } })
  return { case_id: caseId, linked: rows.length }
}

/**
 * The client each thread is about: the thread's own company when it is a client; else the client
 * on its insurer filing; else the one client its subject names. Threads with none are left out.
 */
export async function clientsForThreads(threadIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>()
  if (threadIds.length === 0) return out
  const threads = await inChunks(threadIds, 80, ids => sbTry<{ id: string; subject: string | null; company_id: string | null }[]>(`email_threads?id=in.(${ids.join(',')})&select=id,subject,company_id`, []))
  const filings = await inChunks(threadIds, 80, ids => sbTry<{ thread_id: string; client_company_id: string | null; insurer_company_id: string }[]>(`thread_insurers?thread_id=in.(${ids.join(',')})&select=thread_id,client_company_id,insurer_company_id`, []))
  const clients = await sbTry<{ id: string; company_name: string }[]>('companies?kind=eq.client&select=id,company_name&limit=5000', [])
  const byId = new Map(clients.map(c => [c.id, c]))
  for (const t of threads) {
    const own = t.company_id ? byId.get(t.company_id) : undefined
    const filed = filings.find(f => f.thread_id === t.id && f.client_company_id && f.client_company_id !== f.insurer_company_id && byId.has(f.client_company_id))
    const named = !own && !filed ? clients.filter(c => subjectNames(t.subject ?? '', c.company_name)) : []
    const c = own ?? (filed ? byId.get(filed.client_company_id!) : undefined) ?? (named.length === 1 ? named[0] : undefined)
    if (c) out.set(t.id, { id: c.id, name: c.company_name })
  }
  return out
}
