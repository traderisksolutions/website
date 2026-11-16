/**
 * The reads and the one write behind a case's comparison (compare.ts). No model is called here.
 *
 *   loadComparison(caseId, viewer)        the comparison on record, or the one the case opens with, beside its wish list and files
 *   saveComparison(caseId, actor, raw)    a person saves what they typed; bounded by cleanComparison before it is stored
 *   loadSummary(caseId)                   the saved comparison as the client summary reads it
 *
 * One comparison per case (work_item_comparisons). A document in a colleague's mailbox keeps its
 * place on the option; its name is withheld from a viewer who cannot open the thread.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { fmtDate } from '@/lib/format'
import { caseFiles, caseLine, type CaseFile } from './checklist'
import { CaseError, caseMessages, caseThreadIds } from './sources-store'
import { lineGroupOf, type LineGroup } from './season'
import { cleanComparison, isNeed, keepFiles, newComparison, offered, summaryModel, type Comparison, type SummaryModel, type WishLine } from './compare'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
const FILES_MAX = 300

export type CompareView = {
  item: { id: string; title: string | null; case_type: string; closed_at: string | null }
  group: LineGroup
  comparison: Comparison
  /** Null until a person saves the comparison. */
  saved: { by: string | null; at: string } | null
  /** The client's wishes on the case, in the order they were written. */
  wishes: WishLine[]
  /** The files on the case's emails the viewer can open, newest first. */
  files: CaseFile[]
  /** Options whose document is in a colleague's mailbox: its name is withheld. */
  withheld: string[]
}

async function caseOf(id: string): Promise<{ item: Row; policy: Row | null }> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=id,title,case_type,company_id,client_name,policy_id,policy_number,insurer_name,product_line,closed_at&limit=1`)
  if (!item) throw new CaseError('This case no longer exists.', 404)
  const [policy] = item.policy_id ? await sbTry<Row[]>(`policies?id=eq.${enc(item.policy_id)}&select=id,policy_number,insurer,class_of_insurance,label,product_line,start_date,end_date,is_eb&limit=1`, []) : []
  return { item, policy: policy ?? null }
}

const groupOf = (item: Row, policy: Row | null): LineGroup => {
  const line = caseLine({ chosen: item.product_line, policyLine: policy?.product_line, policyClass: policy?.class_of_insurance, title: item.title })?.line ?? null
  return lineGroupOf({ is_eb: policy?.is_eb, line, text: `${policy?.class_of_insurance ?? ''} ${policy?.label ?? ''} ${item.title ?? ''}` })
}

const wishesOf = async (id: string): Promise<WishLine[]> =>
  (await sbTry<Row[]>(`work_item_notes?work_item_id=eq.${enc(id)}&section=eq.wish&status=eq.current&select=id,text,need&order=created_at.asc&limit=200`, []))
    .map(w => ({ id: w.id, text: w.text, need: isNeed(w.need) ? w.need : null }))

const storedOf = async (id: string): Promise<Row | null> =>
  (await sbTry<Row[]>(`work_item_comparisons?work_item_id=eq.${enc(id)}&select=options,rows,wishes,recommended,note,updated_by,updated_at&limit=1`, []))[0] ?? null

export async function loadComparison(workItemId: string, viewer: string | null): Promise<CompareView> {
  const { item, policy } = await caseOf(workItemId)
  const { ids } = await caseThreadIds(workItemId)
  const [visible, messages, wishes, stored] = await Promise.all([visibleThreadIds(ids, viewer), caseMessages(ids), wishesOf(workItemId), storedOf(workItemId)])
  const all = caseFiles(messages)
  const group = groupOf(item, policy)
  const kept = stored ? cleanComparison(stored, new Set(wishes.map(w => w.id))) : newComparison(group, policy?.insurer ?? item.insurer_name ?? null)
  // A document on a thread the viewer cannot open keeps its place and loses its name.
  const hidden = (o: Comparison['options'][number]) => !!o.file && all.some(f => f.message_id === o.file!.message_id && !visible.has(f.thread_id))
  return {
    item: { id: item.id, title: item.title ?? null, case_type: item.case_type, closed_at: item.closed_at ?? null },
    group,
    comparison: { ...kept, options: kept.options.map(o => (hidden(o) ? { ...o, file: { message_id: o.file!.message_id, filename: '' } } : o)) },
    saved: stored ? { by: stored.updated_by ?? null, at: stored.updated_at } : null,
    wishes,
    files: all.filter(f => visible.has(f.thread_id)).slice(0, FILES_MAX),
    withheld: kept.options.filter(hidden).map(o => o.id),
  }
}

export async function saveComparison(workItemId: string, actor: string, raw: unknown): Promise<void> {
  await caseOf(workItemId)
  const { ids } = await caseThreadIds(workItemId)
  const [visible, messages, wishes, stored] = await Promise.all([visibleThreadIds(ids, actor), caseMessages(ids), wishesOf(workItemId), storedOf(workItemId)])
  const files = caseFiles(messages).filter(f => visible.has(f.thread_id))
  const next = keepFiles(cleanComparison(raw, new Set(wishes.map(w => w.id))), raw, stored ? cleanComparison(stored) : null, files)
  await sb('work_item_comparisons?on_conflict=work_item_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ work_item_id: workItemId, options: next.options, rows: next.rows, wishes: next.wishes, recommended: next.recommended, note: next.note, updated_by: actor, updated_at: new Date().toISOString() }),
  })
  const n = offered(next)
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({ work_item_id: workItemId, kind: 'comparison', actor, detail: { options: n, recommended: next.recommended, note: `${n} ${n === 1 ? 'option' : 'options'} on offer` } }) })
}

/** The saved comparison as the client reads it. Null until a person has saved one. */
export async function loadSummary(workItemId: string, today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)): Promise<SummaryModel | null> {
  const { item, policy } = await caseOf(workItemId)
  const [wishes, stored, company] = await Promise.all([
    wishesOf(workItemId), storedOf(workItemId),
    item.company_id ? sbTry<Row[]>(`companies?id=eq.${enc(item.company_id)}&select=company_name&limit=1`, []) : Promise.resolve([] as Row[]),
  ])
  if (!stored) return null
  const period = policy?.start_date && policy?.end_date ? `${fmtDate(policy.start_date)} to ${fmtDate(policy.end_date)}` : policy?.end_date ? `Ends ${fmtDate(policy.end_date)}` : null
  return summaryModel({
    client: company[0]?.company_name ?? item.client_name ?? 'Client',
    title: policy?.label ?? policy?.class_of_insurance ?? item.title ?? 'Renewal',
    policy: policy || item.policy_number ? { number: policy?.policy_number ?? item.policy_number ?? null, insurer: policy?.insurer ?? item.insurer_name ?? null, period } : null,
    as_of: fmtDate(today),
    comparison: cleanComparison(stored, new Set(wishes.map(w => w.id))),
    wishes,
  })
}
