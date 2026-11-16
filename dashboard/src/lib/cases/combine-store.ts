/**
 * The reads and writes behind Combine (combine.ts). No model is called here.
 *
 *   combinePreview(threadIds, viewer, companyId?)   what the form opens with
 *   combineThreads(input, actor)                    starts a case, or adds to one, and puts every thread on it
 *
 * Everything is checked before anything is written, so a refusal leaves no case behind. A thread
 * another case holds moves only when the person named it in `move`.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { visibleThreadIds, PRIVATE_THREAD } from '@/lib/mail/visibility-server'
import { isLabel, labelOf } from './labels'
import { caseTypeAmong, clientAmong, fromOfThread, titleAmong, type CombineInput, type CombinePreview, type CombineSource, type Held } from './combine'
import { CaseError, PERSON, caseRow, insurersOnFile, pickThread, setSide } from './sources-store'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
const INSURER = new Set(['insurer', 'tpa'])

/** The case that holds each thread, open or closed: a thread sits on one case. */
async function heldBy(ids: readonly string[]): Promise<Map<string, Held>> {
  const rows = await sb<Row[]>(`work_item_threads?thread_id=in.(${ids.join(',')})&select=thread_id,work_item_id,joined_by,joined_evidence,created_at,work_items(title)`)
  return new Map(rows.map(r => [r.thread_id as string, {
    id: r.work_item_id as string, title: r.work_items?.title ?? null,
    picked_by: r.joined_by === PERSON ? r.joined_evidence ?? null : 'case_worker', picked_at: r.created_at ?? null,
  }]))
}

/** The ticked threads as they stand. A thread that is gone, or in a colleague's mailbox, refuses the lot. */
async function ticked(ids: readonly string[], viewer: string): Promise<{ sources: CombineSource[]; held: Map<string, Held>; dir: Awaited<ReturnType<typeof directory>> }> {
  if (!ids.length) throw new CaseError('Tick at least one thread.', 400)
  const [rows, visible, dir, links, held] = await Promise.all([
    sb<Row[]>(`email_threads?id=in.(${ids.join(',')})&deleted_at=is.null&select=id,subject,display_subject,company_id,last_message_at,label`),
    visibleThreadIds(ids, viewer),
    directory(),
    sbTry<Row[]>(`thread_insurers?thread_id=in.(${ids.join(',')})&select=thread_id,insurer_company_id,client_company_id`, []),
    heldBy(ids),
  ])
  const byId = new Map(rows.map(r => [r.id as string, r]))
  if (ids.some(id => !byId.has(id))) throw new CaseError('A ticked thread no longer exists.', 404)
  if (ids.some(id => !visible.has(id))) throw new CaseError(PRIVATE_THREAD.error, 403)
  const clientOf = new Map<string, string>(), insurersOf = new Map<string, Set<string>>()
  for (const l of links) {
    if (l.client_company_id && !clientOf.has(l.thread_id)) clientOf.set(l.thread_id, l.client_company_id)
    if (INSURER.has(dir.byId.get(l.insurer_company_id)?.kind)) insurersOf.set(l.thread_id, (insurersOf.get(l.thread_id) ?? new Set()).add(l.insurer_company_id))
  }
  const sources = ids.map(id => {
    const t = byId.get(id)!
    const co = t.company_id ? dir.byId.get(t.company_id) : null
    return {
      id, subject: t.display_subject ?? t.subject ?? null, last_message_at: t.last_message_at ?? null,
      label: isLabel(t.label) ? t.label : labelOf({ subject: t.subject }).label,
      company: co ? { id: String(co.id), name: co.company_name ?? null, kind: co.kind ?? null } : null,
      client_of: clientOf.get(id) ?? null,
      insurer_of: insurersOf.get(id)?.size === 1 ? [...insurersOf.get(id)!][0] : null,
    }
  })
  return { sources, held, dir }
}

/** A company as the case names it; the directory is asked first, the table when the company was added a moment ago. */
async function company(id: string | null, dir: { byId: Map<string, Row> }): Promise<Row | null> {
  if (!id) return null
  return dir.byId.get(id) ?? (await sb<Row[]>(`companies?id=eq.${enc(id)}&select=id,kind,company_name&limit=1`))[0] ?? null
}

export async function combinePreview(threadIds: readonly string[], viewer: string, companyId: string | null = null): Promise<CombinePreview> {
  const { sources, held, dir } = await ticked(threadIds, viewer)
  const co = await company(companyId ?? clientAmong(sources), dir)
  const client = co && !INSURER.has(co.kind) ? { id: String(co.id), name: String(co.company_name ?? 'Company') } : null
  const cases = client ? await sbTry<Row[]>(`work_items?company_id=eq.${enc(client.id)}&closed_at=is.null&select=id,title,case_type&order=last_activity_at.desc.nullslast&limit=50`, []) : []
  return {
    threads: sources.map(s => ({
      id: s.id, subject: s.subject, last_message_at: s.last_message_at, label: s.label, company: s.company,
      ...fromOfThread(s, client?.id ?? null), held: held.get(s.id) ?? null,
    })),
    insurers: insurersOnFile(dir),
    client,
    cases: cases.map(c => ({ id: c.id as string, title: c.title ?? null, case_type: String(c.case_type ?? 'other') })),
    case_type: caseTypeAmong(sources.map(s => s.label)),
    title: titleAmong(sources),
  }
}

export async function combineThreads(input: CombineInput, actor: string): Promise<{ id: string; created: boolean }> {
  const ids = input.threads.map(t => t.id)
  const { sources, held, dir } = await ticked(ids, actor)
  for (const t of input.threads) if (t.insurer_id && !INSURER.has(dir.byId.get(t.insurer_id)?.kind)) throw new CaseError('Choose an insurer on file.', 400)

  let client: Row | null = null
  if (input.work_item_id) {
    if ((await caseRow(input.work_item_id)).closed_at) throw new CaseError('This case is closed.', 400)
  } else {
    client = await company(input.company_id, dir)
    if (!client) throw new CaseError('This company is not on file.', 400)
    if (INSURER.has(client.kind)) throw new CaseError('Choose the client, not an insurer.', 400)
  }

  const agreed = new Set(input.move)
  const conflicts = sources.filter(t => held.has(t.id) && held.get(t.id)!.id !== input.work_item_id && !agreed.has(t.id)).map(t => ({ thread_id: t.id, subject: t.subject, held: held.get(t.id)! }))
  if (conflicts.length) throw new CaseError(conflicts.length === 1 ? 'A thread is on another case.' : `${conflicts.length} threads are on other cases.`, 409, { conflicts })

  let id = input.work_item_id
  if (!id) {
    const latest = sources.map(t => t.last_message_at).filter(Boolean).sort().pop() ?? new Date().toISOString()
    const [made] = await sb<Row[]>('work_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      company_id: client!.id, client_name: client!.company_name ?? null, case_type: input.case_type, title: input.title,
      status: 'trs_to_act', owner_email: actor, source: PERSON, confidence: 'high', last_activity_at: latest,
    }) })
    id = made.id as string
    await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: id, kind: 'started', actor, detail: { threads: ids.length, note: `Case started from ${ids.length} ${ids.length === 1 ? 'thread' : 'threads'}` } }) })
  }
  let on = 0
  try {
    for (const t of input.threads) {
      await pickThread(id, t.id, actor, { move: agreed.has(t.id) })
      await setSide(id, t.id, t.side, actor, t.insurer_id)
      on++
    }
  } catch (e) {
    // A case started here that took no thread is not left behind.
    if (!input.work_item_id && on === 0) await sbTry(`work_items?id=eq.${enc(id)}`, null, { method: 'DELETE', headers: quiet })
    throw e
  }
  return { id, created: !input.work_item_id }
}
