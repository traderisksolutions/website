/**
 * The reads behind a client row's substance on Today (substance.ts holds the rules). Two calls,
 * neither on the page's first load: facts for every client on the page after the rows are shown
 * (a few reads across all of them), and one client's detail when its row is opened.
 * Every read is bounded (limit, ids); a table that is not there reads as nothing.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { STAGE_LABEL, isStage } from '@/lib/cases/stage'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { condenseKey, threadState, type Condensed } from './condense'
import { groupProjects, rowKey, type DeskThread } from './desk'
import { insurerNames, premiums } from './desk-server'
import { nameWords, partiesOf, suggestProjects, type Parties, type ProjectSuggestion } from './projects'
import {
  documentRows, insurerRows, nextRenewal, renewalFact, timeline,
  type DocRow, type FactPolicy, type InsurerRow, type RowFacts, type TimelineEvent,
} from './substance'

type Row = Record<string, any>
const inList = (ids: readonly string[]) => `(${ids.map(i => `"${i}"`).join(',')})`
const bare = (a: string | null | undefined) => (String(a ?? '').match(/<(.+?)>/)?.[1] ?? String(a ?? '')).trim().toLowerCase()
const nameIn = (a: string | null | undefined) => (String(a ?? '').includes('<') ? String(a).split('<')[0].replace(/["']/g, '').trim() : '') || null
const today = () => new Date().toISOString().slice(0, 10)

let renewalsTable: boolean | null = null
/** Stage by client from the renewals table when it exists, else the open renewal case's stage. */
async function stages(companyIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (renewalsTable !== false) {
    try {
      const rows = await sb<Row[]>(`renewals?company_id=in.${inList(companyIds)}&select=company_id,stage&limit=500`)
      renewalsTable = true
      for (const r of rows) if (r.stage && !out.has(r.company_id)) out.set(r.company_id, String(r.stage).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()))
    } catch { renewalsTable = false }
  }
  const missing = companyIds.filter(c => !out.has(c))
  if (missing.length) {
    const cases = await sbTry<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&company_id=in.${inList(missing)}&select=company_id,stage&order=created_at.desc&limit=500`, [])
    for (const c of cases) if (isStage(c.stage) && !out.has(c.company_id)) out.set(c.company_id, STAGE_LABEL[c.stage])
  }
  return out
}

/** Renewal, current insurer, premium and stage for each client on the page. */
export async function rowFacts(companyIds: readonly string[]): Promise<Record<string, RowFacts>> {
  const ids = Array.from(new Set(companyIds)).slice(0, 200)
  if (!ids.length) return {}
  const [policies, premiumOf, stageOf] = await Promise.all([
    sbTry<FactPolicy[]>(`policies?company_id=in.${inList(ids)}&lifecycle=in.(live,bound,renewal_due)&select=id,company_id,end_date,insurer,class_of_insurance,policy_number,lifecycle&limit=2000`, []),
    premiums(ids).catch(() => new Map()),
    stages(ids).catch(() => new Map<string, string>()),
  ])
  const t = today()
  const out: Record<string, RowFacts> = {}
  for (const c of ids) {
    const next = nextRenewal(policies.filter(p => p.company_id === c), t)
    out[c] = { renews: renewalFact(next, t), insurer: next?.insurer ?? null, premium: premiumOf.get(c) ?? [], stage: stageOf.get(c) ?? null }
  }
  return out
}

export type ProjectDetail = { project: string | null; parties: Parties; condensed: (Condensed & { stale: boolean }) | null; threadIds: string[] }
export type RowDetail = {
  documents: DocRow[]; insurers: InsurerRow[]; timeline: TimelineEvent[]
  links: { label: string; href: string }[]
  suggestions: ProjectSuggestion[]
  projects: ProjectDetail[]
}

/**
 * One client row's detail, read when the row is opened: documents, insurer status, timeline,
 * links, suggested projects, and per project its parties and kept Condense. `threads` are the
 * row's threads as Today shows them.
 */
export async function rowDetail(viewer: string, owner: string, companyId: string | null, threads: readonly DeskThread[]): Promise<RowDetail> {
  const ids = threads.map(t => t.threadId).slice(0, 100)
  const t0 = today()
  const [msgs, parts, atts, insurers, visible, lastRows] = await Promise.all([
    ids.length ? sbTry<Row[]>(`email_messages?thread_id=in.${inList(ids)}&deleted_at=is.null&select=thread_id,direction,from_address,subject,sent_at&order=sent_at.desc&limit=300`, []) : [],
    ids.length ? sbTry<Row[]>(`email_participants?thread_id=in.${inList(ids)}&select=thread_id,email,name&limit=1500`, []) : [],
    ids.length ? sbTry<Row[]>(`email_attachments?thread_id=in.${inList(ids)}&select=id,thread_id,filename,mime_type,created_at&order=created_at.desc&limit=300`, []) : [],
    insurerNames(),
    visibleThreadIds(ids, viewer),
    ids.length ? sbTry<Row[]>(`email_threads?id=in.${inList(ids)}&select=id,last_message_at`, []) : [],
  ])
  let company: Row | null = null, policies: Row[] = [], docs: Row[] = [], dispatches: Row[] = [], companyThreads: Row[] = [], quote: Row | null = null, renewalCase: Row | null = null
  if (companyId) {
    const [c, pol, dd, pl, ct, q, wc] = await Promise.all([
      sbTry<Row[]>(`companies?id=eq.${enc(companyId)}&select=company_name,domains&limit=1`, []),
      sbTry<Row[]>(`policies?company_id=eq.${enc(companyId)}&lifecycle=in.(quoting,presented,bound,live,renewal_due)&select=id,lifecycle,is_eb,product_line,start_date,end_date,policy_number,insurer,class_of_insurance&limit=50`, []),
      sbTry<Row[]>(`policy_documents?company_id=eq.${enc(companyId)}&status=neq.ignored&select=doc_type,filename,mime_type,received_at,thread_id,email_attachment_id&order=received_at.desc.nullslast&limit=200`, []),
      sbTry<Row[]>(`placements?company_id=eq.${enc(companyId)}&status=in.(open,presented)&select=id&limit=10`, []),
      sbTry<Row[]>(`email_threads?company_id=eq.${enc(companyId)}&deleted_at=is.null&select=id,subject&order=last_message_at.desc&limit=100`, []),
      sbTry<Row[]>(`eb_quotations?company_id=eq.${enc(companyId)}&select=id&order=created_at.desc&limit=1`, []),
      sbTry<Row[]>(`work_items?case_type=eq.renewal&closed_at=is.null&company_id=eq.${enc(companyId)}&select=id&order=created_at.desc&limit=1`, []),
    ])
    company = c[0] ?? null; policies = pol; docs = dd; companyThreads = ct; quote = q[0] ?? null; renewalCase = wc[0] ?? null
    if (pl.length) dispatches = await sbTry<Row[]>(`placement_dispatches?placement_id=in.${inList(pl.map(p => p.id))}&select=insurer_name,status,sent_at,last_inbound_at,created_at,thread_id&order=created_at.desc&limit=200`, [])
  }
  const sideOf = new Map(threads.map(t => [t.threadId, t.side]))
  const subjectOf = new Map(threads.map(t => [t.threadId, t.subject]))

  // Documents: the data room's filed documents, then files on the row's threads by name.
  const documents = documentRows([
    ...docs.map(d => ({ filename: String(d.filename ?? ''), mime_type: d.mime_type, at: d.received_at ?? null, threadId: d.thread_id ?? null, id: d.email_attachment_id ?? null, docType: d.doc_type, canOpen: !d.thread_id || !ids.includes(d.thread_id) || visible.has(d.thread_id) })),
    ...atts.map(a => ({ filename: String(a.filename ?? ''), mime_type: a.mime_type, at: a.created_at ?? null, threadId: a.thread_id, id: a.id, canOpen: visible.has(a.thread_id) })),
  ], policies.filter(p => p.lifecycle).map(p => ({ lifecycle: p.lifecycle, is_eb: !!p.is_eb, product_line: p.product_line ?? null })))

  // Timeline: emails in and out on the row's threads, placement requests, policy starts.
  const insurerOf = (email: string) => { const d = email.split('@')[1] ?? ''; for (const [dom, n] of insurers) if (d === dom || d.endsWith(`.${dom}`)) return n || dom; return null }
  const events: TimelineEvent[] = msgs.map(m => {
    const from = bare(m.from_address)
    const side = sideOf.get(m.thread_id) === 'insurer' ? 'Insurer' : 'Client'
    const who = m.direction === 'outbound' ? `TRS → ${side.toLowerCase()}` : insurerOf(from) ?? nameIn(m.from_address) ?? side
    return { at: String(m.sent_at ?? ''), who, what: subjectOf.get(m.thread_id) ?? String(m.subject ?? ''), threadId: m.thread_id }
  })
  for (const p of policies) if (p.start_date) events.push({ at: p.start_date, who: 'Policy', what: `${p.insurer ?? ''} ${p.policy_number ?? ''} started`.trim(), threadId: null })
  for (const d of dispatches) if (d.sent_at) events.push({ at: d.sent_at, who: `TRS → ${d.insurer_name}`, what: 'Quote requested', threadId: d.thread_id ?? null })

  const next = nextRenewal(policies.filter(p => ['live', 'bound', 'renewal_due'].includes(p.lifecycle)).map(p => ({ ...p, company_id: companyId ?? '' }) as FactPolicy), t0)
  const links: { label: string; href: string }[] = []
  if (companyId) links.push({ label: 'Threads', href: `/companies/${companyId}?tab=threads` })
  if (quote) links.push({ label: 'Employment Benefits quotation', href: `/eb/proposal/${quote.id}` })
  if (next) links.push({ label: `Policy ${next.policy_number ?? ''}`.trim(), href: `/policies/${next.id}` })
  if (renewalCase) links.push({ label: 'Renewal', href: `/today/${renewalCase.id}` })

  // Projects: names repeated across the client's subjects, offered for the row's threads only.
  const projectsOnRow = new Set(threads.map(t => String(t.project ?? '').toLowerCase()).filter(Boolean))
  const exclude = nameWords(company?.company_name, ...insurers.values())
  const pool = [...threads.map(t => ({ threadId: t.threadId, subject: t.subject })), ...companyThreads.filter(c => !ids.includes(c.id)).map(c => ({ threadId: c.id as string, subject: c.subject as string }))]
  const suggestions = suggestProjects(pool, exclude, projectsOnRow)
    .map(s => ({ name: s.name, threadIds: s.threadIds.filter(id => ids.includes(id) && !threads.find(t => t.threadId === id)?.project) }))
    .filter(s => s.threadIds.length > 0)

  // Per project: its parties and its kept Condense (stale when a thread moved since).
  const key = rowKey(owner, companyId, threads[0]?.threadId ?? '')
  const groups = groupProjects({ threads: [...threads], drafts: [] })
  const kept = await sbTry<Row[]>(`app_settings?key=in.${inList(groups.map(g => condenseKey(key, g.project)).map(enc))}&select=key,value`, [])
  const keptBy = new Map(kept.map(k => [String(k.key), k.value as string]))
  const lastOf = new Map(lastRows.map(r => [r.id as string, (r.last_message_at as string | null) ?? null]))
  const projects: ProjectDetail[] = groups.map(g => {
    const gids = g.threads.map(t => t.threadId)
    const people = parts.filter(p => gids.includes(p.thread_id)).map(p => ({ name: p.name ?? null, email: String(p.email ?? ''), side: sideOf.get(p.thread_id) ?? null }))
    let condensed: ProjectDetail['condensed'] = null
    const raw = keptBy.get(condenseKey(key, g.project))
    if (raw) {
      try {
        const c = JSON.parse(raw) as Condensed
        // The same state the model read: the threads this viewer may open, with their last message.
        const scope = (g.project ? g.threads : threads).filter(t => visible.has(t.threadId))
        const state = threadState(scope.map(t => ({ threadId: t.threadId, lastAt: lastOf.get(t.threadId) ?? null })))
        condensed = { ...c, stale: c.state !== state }
      } catch { /* a bad entry reads as none */ }
    }
    return { project: g.project, parties: partiesOf(people, (company?.domains ?? []) as string[], insurers), condensed, threadIds: gids }
  })

  return {
    documents,
    insurers: insurerRows(dispatches as never, t0),
    timeline: timeline(events.filter(e => /^\d{4}-\d{2}-\d{2}/.test(e.at))),
    links, suggestions, projects,
  }
}
