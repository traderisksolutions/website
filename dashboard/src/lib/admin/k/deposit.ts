/**
 * Knowledge depositor: the only writer of company_ledger. One job — log every event into the
 * knowledge base of every company it concerns (the client and the insurer both), dated, with links
 * to the email, the data-room file and the policy folder. Deterministic; no model.
 *
 *   knowledge_depositor · message  { message_id, attempt? }   one stored email (and what it rebuilt)
 *   knowledge_depositor · event    { table, id }              a document, policy, debit note, claim or case event
 *
 * Other code calls depositEvent() directly. Writes are idempotent on (source_table, source_id,
 * company_id), so a re-run or the backfill never duplicates.
 */
import { sb, sbTry, enc, inChunks } from '@/lib/crm/db'
import { enqueue, skip, type AgentTask } from '@/lib/agent-tasks/queue'
import {
  emailDraft, rebuiltDraft, documentDraft, policyDrafts, debitNoteDraft, claimDraft, caseEventDraft, quotationDraft, placementDraft, factReadable,
  type LedgerDraft,
} from './shape'

type Row = Record<string, any>
export type DepositTable = 'email_messages' | 'rebuilt_messages' | 'policy_documents' | 'policies' | 'debit_notes' | 'claims' | 'work_item_events' | 'gb_quotations' | 'placements'
export type Target = { draft: LedgerDraft; company_id: string }

// ── company directory (cached; companies change rarely) ──────────────────────────────────────

type Directory = { byId: Map<string, Row>; domainKind: Map<string, string>; group: (id: string) => string }
let dirCache: { at: number; dir: Directory } | null = null

export async function directory(force = false): Promise<Directory> {
  if (!force && dirCache && Date.now() - dirCache.at < 10 * 60_000) return dirCache.dir
  const rows: Row[] = []
  for (let off = 0; ; off += 1000) {
    const page = await sb<Row[]>(`companies?select=id,parent_id,kind,domain,domains,company_name&order=id&offset=${off}&limit=1000`)
    rows.push(...page); if (page.length < 1000) break
  }
  const byId = new Map(rows.map(r => [r.id as string, r]))
  const domainKind = new Map<string, string>()
  // Insurers first so a domain shared with a client record still reads as the insurer.
  for (const kind of ['insurer', 'tpa', 'partner', 'vendor', 'client', 'other']) for (const r of rows) if (r.kind === kind) {
    for (const d of [r.domain, ...(Array.isArray(r.domains) ? r.domains : [])]) if (d && !domainKind.has(String(d).toLowerCase())) domainKind.set(String(d).toLowerCase(), r.kind)
  }
  const group = (id: string) => {
    let cur = id; const seen = new Set<string>()
    for (let k = 0; k < 6; k++) { seen.add(cur); const p = byId.get(cur)?.parent_id; if (!p || seen.has(p) || !byId.has(p)) break; cur = p }
    return cur
  }
  const dir = { byId, domainKind, group }
  dirCache = { at: Date.now(), dir }
  return dir
}

// ── which companies a thread belongs to ───────────────────────────────────────────────────────

export type ThreadInfo = { companies: Set<string>; threadKind: string | null; policyId: string | null; workItemId: string | null }

export async function threadInfo(threadIds: string[], dir: Directory): Promise<Map<string, ThreadInfo>> {
  const ids = Array.from(new Set(threadIds.filter(Boolean)))
  const out = new Map<string, ThreadInfo>()
  if (!ids.length) return out
  const [threads, ins, wit] = await Promise.all([
    inChunks(ids, 100, c => sbTry<Row[]>(`email_threads?id=in.(${c.join(',')})&select=id,company_id`, [])),
    inChunks(ids, 100, c => sbTry<Row[]>(`thread_insurers?thread_id=in.(${c.join(',')})&select=thread_id,insurer_company_id,client_company_id,policy_id,policy_status`, [])),
    inChunks(ids, 100, c => sbTry<Row[]>(`work_item_threads?thread_id=in.(${c.join(',')})&select=thread_id,work_item_id,work_items(company_id,policy_id)`, [])),
  ])
  const get = (id: string) => { if (!out.has(id)) out.set(id, { companies: new Set(), threadKind: null, policyId: null, workItemId: null }); return out.get(id)! }
  for (const t of threads) { const i = get(t.id); if (t.company_id && dir.byId.has(t.company_id)) { i.companies.add(t.company_id); i.threadKind = dir.byId.get(t.company_id)?.kind ?? null } }
  for (const r of ins) {
    const i = get(r.thread_id)
    for (const c of [r.insurer_company_id, r.client_company_id]) if (c && dir.byId.has(c)) i.companies.add(c)
    if (r.policy_id && (r.policy_status === 'confirmed' || r.policy_status === 'suggested') && !i.policyId) i.policyId = r.policy_id
    if (!i.threadKind && r.client_company_id) i.threadKind = 'client'
  }
  for (const r of wit) {
    const i = get(r.thread_id)
    const c = r.work_items?.company_id
    if (c && dir.byId.has(c)) i.companies.add(c)
    i.workItemId = r.work_item_id
    if (!i.policyId && r.work_items?.policy_id) i.policyId = r.work_items.policy_id
  }
  return out
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────

/** Inserts the rows; ones already in the ledger are left as they are. Returns rows sent. */
export async function writeTargets(targets: Target[], dir: Directory): Promise<number> {
  const rows = targets.filter(t => t.draft.occurred_at).map(t => ({ ...t.draft, company_id: t.company_id, group_id: dir.group(t.company_id) }))
  for (let i = 0; i < rows.length; i += 300) {
    await sb('company_ledger?on_conflict=source_table,source_id,company_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 300)),
    })
  }
  return rows.length
}

const MSG_COLS = 'id,thread_id,gmail_message_id,direction,from_address,subject,body_text,sent_at,created_at'

/** Ledger targets for stored emails, plus anything rebuilt from them. Messages on unfiled threads come back in `unfiled`. */
export async function messageTargets(messages: Row[], dir: Directory): Promise<{ targets: Target[]; unfiled: string[] }> {
  const info = await threadInfo(messages.map(m => m.thread_id), dir)
  const ids = messages.map(m => m.id as string)
  const [docs, rebuilt] = await Promise.all([
    inChunks(ids, 100, c => sbTry<Row[]>(`policy_documents?message_id=in.(${c.join(',')})&drive_url=not.is.null&select=message_id,filename,drive_url`, [])),
    inChunks(ids, 100, c => sbTry<Row[]>(`rebuilt_messages?source_message_id=in.(${c.join(',')})&select=*`, [])),
  ])
  const docsBy = new Map<string, Row[]>()
  for (const d of docs) docsBy.set(d.message_id, [...(docsBy.get(d.message_id) ?? []), d])
  const targets: Target[] = []
  const unfiled: string[] = []
  const sentAt = new Map(messages.map(m => [m.id as string, m.sent_at as string | null]))
  for (const m of messages) {
    const i = info.get(m.thread_id)
    if (!i?.companies.size) { unfiled.push(m.id); continue }
    const draft = emailDraft(m, { domainKind: dir.domainKind, threadKind: i.threadKind, docs: docsBy.get(m.id), policyId: i.policyId, workItemId: i.workItemId })
    for (const c of i.companies) targets.push({ draft, company_id: c })
  }
  for (const r of rebuilt) {
    const i = info.get(r.thread_id)
    if (!i?.companies.size) continue
    const draft = rebuiltDraft(r, { domainKind: dir.domainKind, threadKind: i.threadKind, fallbackDate: sentAt.get(r.source_message_id) })
    for (const c of i.companies) targets.push({ draft, company_id: c })
  }
  return { targets, unfiled }
}

export async function depositMessages(messageIds: string[]): Promise<{ written: number; unfiled: string[]; targets: Target[] }> {
  const dir = await directory()
  const messages = await inChunks(messageIds, 50, c => sbTry<Row[]>(`email_messages?id=in.(${c.join(',')})&deleted_at=is.null&select=${MSG_COLS}`, []))
  const { targets, unfiled } = await messageTargets(messages, dir)
  return { written: await writeTargets(targets, dir), unfiled, targets }
}

/**
 * Records every email on a thread in the companies it now belongs to: called when an insurer or
 * partner thread is filed against its client, which usually happens after the emails came in.
 * With `removeFrom`, the thread's emails leave that company's ledger (the client it replaced).
 */
export async function recordThread(threadId: string, removeFrom: string | null = null): Promise<number> {
  if (removeFrom) await sbTry(`company_ledger?thread_id=eq.${enc(threadId)}&company_id=eq.${enc(removeFrom)}&source_table=in.(email_messages,rebuilt_messages)`, null, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  const ids = (await sbTry<{ id: string }[]>(`email_messages?thread_id=eq.${enc(threadId)}&deleted_at=is.null&select=id&limit=500`, [])).map(m => m.id)
  return ids.length ? (await depositMessages(ids)).written : 0
}

/** Ledger targets for non-email sources, already loaded. */
export async function eventTargets(table: Exclude<DepositTable, 'email_messages'>, rows: Row[], dir: Directory, today = new Date().toISOString().slice(0, 10)): Promise<Target[]> {
  const out: Target[] = []
  if (table === 'rebuilt_messages') {
    const info = await threadInfo(rows.map(r => r.thread_id), dir)
    for (const r of rows) { const i = info.get(r.thread_id); if (i) for (const c of i.companies) out.push({ draft: rebuiltDraft(r, { domainKind: dir.domainKind, threadKind: i.threadKind }), company_id: c }) }
  } else if (table === 'policy_documents') {
    const pids = Array.from(new Set(rows.map(r => r.policy_id).filter(Boolean)))
    const pol = new Map((await inChunks(pids, 100, c => sbTry<Row[]>(`policies?id=in.(${c.join(',')})&select=id,drive_folder_url`, []))).map(p => [p.id, p]))
    for (const d of rows) if (d.company_id && dir.byId.has(d.company_id)) out.push({ draft: documentDraft(d, pol.get(d.policy_id)), company_id: d.company_id })
  } else if (table === 'policies') {
    // A policy belongs to its holder and to every insured entity on it.
    const ins = await inChunks(rows.map(r => r.id), 100, c => sbTry<Row[]>(`policy_insureds?policy_id=in.(${c.join(',')})&select=policy_id,company_id`, []))
    const insBy = new Map<string, string[]>()
    for (const i of ins) insBy.set(i.policy_id, [...(insBy.get(i.policy_id) ?? []), i.company_id])
    for (const p of rows) {
      const cos = new Set([p.company_id, ...(insBy.get(p.id) ?? [])].filter(c => c && dir.byId.has(c)))
      for (const d of policyDrafts(p, today)) for (const c of cos) out.push({ draft: d, company_id: c })
    }
  } else if (table === 'debit_notes') {
    for (const n of rows) if (n.company_id && dir.byId.has(n.company_id)) out.push({ draft: debitNoteDraft(n), company_id: n.company_id })
  } else if (table === 'claims') {
    for (const c of rows) if (c.company_id && dir.byId.has(c.company_id)) out.push({ draft: claimDraft(c), company_id: c.company_id })
  } else if (table === 'placements') {
    for (const p of rows) if (p.company_id && dir.byId.has(p.company_id)) out.push({ draft: placementDraft(p), company_id: p.company_id })
  } else if (table === 'gb_quotations') {
    // A quotation carries the company by name: matched to one company record, else left out.
    const { companyKey } = await import('@/lib/format')
    const byKey = new Map<string, string[]>()
    for (const [id, c] of dir.byId) if (c.kind === 'client' && c.company_name) { const k = companyKey(c.company_name); byKey.set(k, [...(byKey.get(k) ?? []), id]) }
    for (const q of rows) { const hit = byKey.get(companyKey(q.company_name)); if (hit?.length === 1) out.push({ draft: quotationDraft(q), company_id: hit[0] }) }
  } else if (table === 'work_item_events') {
    const wids = Array.from(new Set(rows.map(r => r.work_item_id)))
    const items = new Map((await inChunks(wids, 100, c => sbTry<Row[]>(`work_items?id=in.(${c.join(',')})&select=id,company_id,title,policy_id`, []))).map(w => [w.id, w]))
    for (const e of rows) { const w = items.get(e.work_item_id); if (w?.company_id && dir.byId.has(w.company_id)) out.push({ draft: caseEventDraft(e, w), company_id: w.company_id }) }
  }
  return out
}

/** Logs one non-email event into every company it concerns. Safe to call twice. */
export async function depositEvent(table: Exclude<DepositTable, 'email_messages'>, id: string): Promise<number> {
  const dir = await directory()
  const rows = await sbTry<Row[]>(`${table}?id=eq.${enc(id)}&select=*`, [])
  if (!rows.length) return 0
  return writeTargets(await eventTargets(table, rows, dir), dir)
}

// ── agent ─────────────────────────────────────────────────────────────────────────────────────

const RETRY_MINUTES = [30, 360]

/** After client mail lands, the fact distiller reads the group's new entries (one run per group per hour). */
async function wakeDistiller(targets: Target[], dir: Directory) {
  const groups = new Set<string>()
  for (const t of targets) if (factReadable(t.draft, dir.byId.get(t.company_id)?.kind)) groups.add(dir.group(t.company_id))
  if (!groups.size) return
  const hour = new Date().toISOString().slice(0, 13)
  await enqueue(Array.from(groups).map(g => ({
    agent: 'knowledge_keeper' as const, kind: 'read_ledger', idem_key: `facts:ledger:${g}:${hour}`, created_by_agent: 'knowledge_depositor' as const,
    company_id: g, payload: { group_id: g }, run_after: new Date(Date.now() + 3 * 60_000).toISOString(),
  })))
}

export async function depositTask(task: AgentTask): Promise<Record<string, unknown> | 'handled'> {
  const p = task.payload ?? {}
  if (task.kind === 'message') {
    const id = String(p.message_id ?? task.message_id ?? '')
    if (!id) { await skip(task.id, 'no message'); return 'handled' }
    const r = await depositMessages([id])
    const dir = await directory()
    await wakeDistiller(r.targets, dir)
    if (r.unfiled.length) {
      // The resolver may file the thread later: look again in 30 minutes, then in 6 hours.
      const attempt = Number(p.attempt ?? 0)
      if (attempt < RETRY_MINUTES.length) await enqueue({
        agent: 'knowledge_depositor', kind: 'message', idem_key: `deposit:msg:${id}:retry${attempt + 1}`, created_by_agent: 'knowledge_depositor',
        message_id: id, thread_id: task.thread_id, payload: { message_id: id, attempt: attempt + 1 }, run_after: new Date(Date.now() + RETRY_MINUTES[attempt] * 60_000).toISOString(),
      })
      return { written: r.written, unfiled: true, retry: attempt < RETRY_MINUTES.length }
    }
    return { written: r.written }
  }
  if (task.kind === 'event') {
    const table = String(p.table ?? '') as Exclude<DepositTable, 'email_messages'>
    if (!['rebuilt_messages', 'policy_documents', 'policies', 'debit_notes', 'claims', 'work_item_events'].includes(table) || !p.id) { await skip(task.id, 'bad event'); return 'handled' }
    return { written: await depositEvent(table, String(p.id)) }
  }
  await skip(task.id, `unknown kind ${task.kind}`)
  return 'handled'
}
