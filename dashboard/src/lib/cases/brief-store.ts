/**
 * The reads and writes behind the case brief (brief.ts) and the document checklists (checklist.ts).
 * No model is called here.
 *
 *   loadBrief(caseId, viewer)                 the brief in five parts, the case's line, its checklist and every file on its emails
 *   setCheck(caseId, itemId, actor, action)   a person confirms an item, marks it not needed, turns a finding down, or undoes the call
 *   setCaseLine(caseId, line, actor)          a person names the case's line of insurance
 *   listChecklists() / addList / addItem / editItem / confirmList   the lists in Settings
 *
 * What code finds on a case is worked out on every read. Only a person's calls are stored, with
 * the file on record and whether code had found it, so "found without a person attaching it" can
 * be counted.
 */
import { sb, sbTry, enc, emailDomain, bareEmail } from '@/lib/crm/db'
import { directory } from '@/lib/admin/k/deposit'
import { displayName } from '@/lib/insurers'
import { visibleThreadIds } from '@/lib/mail/visibility-server'
import { isValidProductLine } from '@/lib/product-lines'
import { CaseError, caseMessages, caseThreadIds } from './sources-store'
import { BRIEF_PARTS, BRIEF_PART_NAME, buildBrief, type Brief, type BriefNote, type BriefPart } from './brief'
import {
  BASIC_LIST, CHECKLIST_CASE_TYPES, caseFiles, caseItems, caseLine, checklistLine, checklistState, cleanItem, lineName,
  type Call, type CaseFile, type ChecklistItem, type ChecklistRow, type ChecklistState, type FileRef, type LineBy,
} from './checklist'
import type { SourceMessage } from './sources'

type Row = Record<string, any>
const quiet = { Prefer: 'return=minimal' }
export const ITEM_COLS = 'id,line,label,found_by,doc_types,words,position,active,required'
const NOTE_COLS = 'id,section,text,quote,message_id,thread_id,source_date,author,author_kind,status,created_at'

export type CheckRow = ChecklistRow & { /** The file is in a colleague's mailbox: its name is withheld. */ private?: boolean }
/** `line` is the line's own list when the case has one, else the basic list. */
type CaseChecklist = Omit<ChecklistState, 'rows'> & { line: string; name: string; rows: CheckRow[] }
export type CaseFileRow = CaseFile & { /** The file is in a colleague's mailbox: its name is withheld. */ private?: boolean }
export type CaseBriefView = {
  item: { id: string; title: string | null; case_type: string; closed_at: string | null }
  brief: Brief
  /** The five parts in the order the brief shows them. */
  parts: { part: BriefPart; name: string }[]
  /** The case's line of insurance and where it came from. */
  line: { line: string; name: string; by: LineBy } | null
  /** Whether this kind of case runs on a document checklist. */
  checklist_applies: boolean
  /** The basic documents and the line's own. Null for a kind of case that runs on no checklist. */
  checklist: CaseChecklist | null
  /** Every file on the case's emails, newest first. */
  files: CaseFileRow[]
}
export type ChecklistList = { line: string; name: string; confirmed_by: string | null; confirmed_at: string | null; updated_by: string | null; updated_at: string | null; items: ChecklistItem[] }

async function workItem(id: string): Promise<Row> {
  const [item] = await sb<Row[]>(`work_items?id=eq.${enc(id)}&select=id,title,case_type,next_action,policy_id,placement_id,product_line,closed_at&limit=1`)
  if (!item) throw new CaseError('This case no longer exists.', 404)
  return item
}

async function lineOf(item: Row) {
  const [policy] = item.policy_id ? await sbTry<Row[]>(`policies?id=eq.${enc(item.policy_id)}&select=product_line,class_of_insurance&limit=1`, []) : []
  return caseLine({ chosen: item.product_line, policyLine: policy?.product_line, policyClass: policy?.class_of_insurance, title: item.title })
}

export const asItem = (r: Row): ChecklistItem => ({ id: r.id, line: r.line, label: r.label, found_by: r.found_by, doc_types: r.doc_types ?? [], words: r.words ?? [], position: r.position ?? 0, active: r.active !== false, required: r.required !== false })
export const asCall = (r: Row): Call => ({ item_id: r.item_id, status: r.status ?? null, message_id: r.message_id ?? null, filename: r.filename ?? null, found: !!r.found, rejected: Array.isArray(r.rejected) ? r.rejected : [], actor: r.actor, at: r.at })

/**
 * The documents a case is checked for, with where each stands: the basic list, and the list of the
 * case's line when it has one. Null for a kind of case that runs on no checklist.
 */
async function caseChecklist(item: Row, line: string | null, messages: readonly SourceMessage[], hasWish: boolean) {
  if (!CHECKLIST_CASE_TYPES.has(item.case_type)) return null
  const own = checklistLine(line)
  const [rows, calls] = await Promise.all([
    sbTry<Row[]>(`line_checklist_items?line=in.(${[BASIC_LIST, own].filter(Boolean).map(l => enc(l!)).join(',')})&select=${ITEM_COLS}&order=position.asc&limit=400`, []),
    sbTry<Row[]>(`work_item_checklist?work_item_id=eq.${enc(item.id)}&select=item_id,status,message_id,filename,found,rejected,actor,at&limit=200`, []),
  ])
  const all = rows.map(asItem)
  const lineItems = all.filter(i => i.line !== BASIC_LIST)
  const items = caseItems(all.filter(i => i.line === BASIC_LIST), lineItems)
  return { list: lineItems.some(i => i.active) ? own! : BASIC_LIST, calls: calls.map(asCall), state: checklistState(items, calls.map(asCall), messages, hasWish) }
}

const FILES_MAX = 300

export async function loadBrief(workItemId: string, viewer: string | null): Promise<CaseBriefView> {
  const item = await workItem(workItemId)
  const { ids, sides } = await caseThreadIds(workItemId)
  const [visible, messages, notes, dir, found] = await Promise.all([
    visibleThreadIds(ids, viewer),
    caseMessages(ids),
    sbTry<BriefNote[]>(`work_item_notes?work_item_id=eq.${enc(workItemId)}&select=${NOTE_COLS}&order=created_at.asc&limit=1000`, []),
    directory(),
    lineOf(item),
  ])
  const insurers = new Map<string, string>()
  for (const c of dir.byId.values()) if (c.kind === 'insurer' || c.kind === 'tpa') {
    for (const d of [c.domain, ...(Array.isArray(c.domains) ? c.domains : [])]) if (d && c.company_name && !insurers.has(String(d).toLowerCase())) insurers.set(String(d).toLowerCase(), displayName(String(c.company_name)))
  }
  const brief = buildBrief({
    messages, sides, visible, domainKind: dir.domainKind, notes, nextAction: item.next_action, caseType: item.case_type, hasPlacement: !!item.placement_id,
    insurerName: a => insurers.get(emailDomain(bareEmail(a))) ?? null,
  })
  const hasWish = notes.some(n => n.section === 'wish' && n.status === 'current')
  const cl = await caseChecklist(item, found?.line ?? null, messages, hasWish)
  return {
    item: { id: item.id, title: item.title ?? null, case_type: item.case_type, closed_at: item.closed_at ?? null },
    brief,
    parts: BRIEF_PARTS.map(part => ({ part, name: BRIEF_PART_NAME[part] })),
    line: found ? { line: found.line, name: lineName(found.line), by: found.by } : null,
    checklist_applies: CHECKLIST_CASE_TYPES.has(item.case_type),
    checklist: cl && {
      ...cl.state, line: cl.list, name: lineName(cl.list),
      rows: cl.state.rows.map(r => (r.file && !visible.has(r.file.thread_id) ? { ...r, file: { ...r.file, filename: '', from: null }, private: true } : r)),
    },
    files: caseFiles(messages).slice(0, FILES_MAX).map(f => (visible.has(f.thread_id) ? f : { ...f, filename: '', from: null, type: null, private: true })),
  }
}

export type CheckAction = 'confirm' | 'not_needed' | 'reject' | 'clear'
const CHECK_NOTE: Record<CheckAction, string> = { confirm: 'Document confirmed', not_needed: 'Document not needed', reject: 'Finding turned down', clear: 'Document call undone' }

/** A person's call on one item of the case's checklist. */
export async function setCheck(workItemId: string, itemId: string, actor: string, action: CheckAction): Promise<void> {
  const item = await workItem(workItemId)
  const { ids } = await caseThreadIds(workItemId)
  const [messages, wish, found] = await Promise.all([
    caseMessages(ids),
    sbTry<Row[]>(`work_item_notes?work_item_id=eq.${enc(workItemId)}&section=eq.wish&status=eq.current&select=id&limit=1`, []),
    lineOf(item),
  ])
  const cl = await caseChecklist(item, found?.line ?? null, messages, wish.length > 0)
  const row = cl?.state.rows.find(r => r.item_id === itemId)
  if (!cl || !row) throw new CaseError('This document is not on the case’s checklist.', 404)
  const call = cl.calls.find(c => c.item_id === itemId)
  const rejected: FileRef[] = call?.rejected ?? []
  const key = `work_item_checklist?work_item_id=eq.${enc(workItemId)}&item_id=eq.${enc(itemId)}`
  const put = (body: Row) => sb('work_item_checklist?on_conflict=work_item_id,item_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ work_item_id: workItemId, item_id: itemId, rejected, actor, at: new Date().toISOString(), ...body }),
  })
  if (action === 'confirm') {
    if (row.state === 'confirmed') return
    // What code had found stands as the file on record; a document that reached TRS another way has none.
    const file = row.state === 'found' ? row.file : null
    await put({ status: 'confirmed', message_id: file?.message_id ?? null, filename: file?.filename ?? null, found: row.state === 'found' })
  } else if (action === 'not_needed') {
    await put({ status: 'not_needed', message_id: null, filename: null, found: false })
  } else if (action === 'reject') {
    if (row.state !== 'found' || !row.file) throw new CaseError('There is no finding to turn down.', 409)
    await put({ status: null, message_id: null, filename: null, found: false, rejected: [...rejected, { message_id: row.file.message_id, filename: row.file.filename }] })
  } else {
    if (!call?.status) return
    if (rejected.length) await put({ status: null, message_id: null, filename: null, found: false })
    else await sb(key, { method: 'DELETE', headers: quiet })
  }
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({
    work_item_id: workItemId, kind: 'checklist', actor, detail: { item_id: itemId, action, found: row.state === 'found', note: `${CHECK_NOTE[action]}: ${row.label}` },
  }) })
}

/** A person names the case's line of insurance, or clears their choice. */
export async function setCaseLine(workItemId: string, line: string | null, actor: string): Promise<void> {
  await workItem(workItemId)
  if (line !== null && !isValidProductLine(line)) throw new CaseError('Choose a line of insurance.', 400)
  await sb(`work_items?id=eq.${enc(workItemId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ product_line: line, product_line_by: line ? actor : null }) })
  await sb('work_item_events', { method: 'POST', headers: quiet, body: JSON.stringify({
    work_item_id: workItemId, kind: 'line', actor, detail: { line, note: line ? `Line set: ${lineName(line)}` : 'Line choice cleared' },
  }) })
}

// ── the lists in Settings ───────────────────────────────────────────────────────────────────────

export async function listChecklists(): Promise<ChecklistList[]> {
  const [lists, items] = await Promise.all([
    sb<Row[]>('line_checklists?select=line,confirmed_by,confirmed_at,updated_by,updated_at&limit=200'),
    sb<Row[]>(`line_checklist_items?select=${ITEM_COLS}&order=position.asc,label.asc&limit=2000`),
  ])
  return lists
    .map(l => ({ line: l.line, name: lineName(l.line), confirmed_by: l.confirmed_by ?? null, confirmed_at: l.confirmed_at ?? null, updated_by: l.updated_by ?? null, updated_at: l.updated_at ?? null, items: items.filter(i => i.line === l.line).map(asItem) }))
    .sort((a, b) => Number(b.line === BASIC_LIST) - Number(a.line === BASIC_LIST) || a.name.localeCompare(b.name))
}

/** An edit returns a list to draft: it is confirmed again as it now stands. */
const edited = (line: string, actor: string) => sb(`line_checklists?line=eq.${enc(line)}`, {
  method: 'PATCH', headers: quiet, body: JSON.stringify({ confirmed_by: null, confirmed_at: null, updated_by: actor, updated_at: new Date().toISOString() }),
})

async function listRow(line: string): Promise<Row> {
  const [l] = await sbTry<Row[]>(`line_checklists?line=eq.${enc(line)}&select=line&limit=1`, [])
  if (!l) throw new CaseError('This line has no checklist.', 404)
  return l
}

export async function addList(line: string, actor: string): Promise<void> {
  const list = checklistLine(line)
  if (!list || !isValidProductLine(list)) throw new CaseError('Choose a line of insurance.', 400)
  await sb('line_checklists?on_conflict=line', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ line: list, updated_by: actor }) })
}

const sameLabel = async (line: string, label: string, notId?: string) =>
  (await sbTry<Row[]>(`line_checklist_items?line=eq.${enc(line)}&select=id,label&limit=500`, [])).some(i => i.id !== notId && String(i.label).toLowerCase() === label.toLowerCase())

export async function addItem(line: string, raw: unknown, actor: string): Promise<void> {
  await listRow(line)
  const clean = cleanItem(raw)
  if ('error' in clean) throw new CaseError(clean.error, 400)
  if (await sameLabel(line, clean.item.label)) throw new CaseError('This document is already on the list.', 409)
  const [last] = await sbTry<Row[]>(`line_checklist_items?line=eq.${enc(line)}&select=position&order=position.desc&limit=1`, [])
  await sb('line_checklist_items', { method: 'POST', headers: quiet, body: JSON.stringify({ line, ...clean.item, required: (raw as Row | null)?.required !== false, position: (last?.position ?? 0) + 1, updated_by: actor }) })
  await edited(line, actor)
}

/** Changes an item's name, how it is found, whether it is required, or whether the list uses it. */
export async function editItem(itemId: string, patch: Record<string, unknown>, actor: string): Promise<void> {
  const [row] = await sbTry<Row[]>(`line_checklist_items?id=eq.${enc(itemId)}&select=${ITEM_COLS}&limit=1`, [])
  if (!row) throw new CaseError('This document is not on a list.', 404)
  const item = asItem(row)
  const body: Row = { updated_by: actor, updated_at: new Date().toISOString() }
  if (['label', 'found_by', 'doc_types', 'words'].some(k => k in patch)) {
    const clean = cleanItem({ ...item, ...patch })
    if ('error' in clean) throw new CaseError(clean.error, 400)
    if (await sameLabel(item.line, clean.item.label, item.id)) throw new CaseError('This document is already on the list.', 409)
    Object.assign(body, clean.item)
  }
  if (typeof patch.active === 'boolean') body.active = patch.active
  if (typeof patch.required === 'boolean') body.required = patch.required
  await sb(`line_checklist_items?id=eq.${enc(itemId)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify(body) })
  await edited(item.line, actor)
}

/** A person confirms a list as it stands. */
export async function confirmList(line: string, actor: string): Promise<void> {
  await listRow(line)
  const active = await sbTry<Row[]>(`line_checklist_items?line=eq.${enc(line)}&active=eq.true&select=id&limit=1`, [])
  if (!active.length) throw new CaseError('Add a document before confirming the list.', 409)
  const now = new Date().toISOString()
  await sb(`line_checklists?line=eq.${enc(line)}`, { method: 'PATCH', headers: quiet, body: JSON.stringify({ confirmed_by: actor, confirmed_at: now, updated_by: actor, updated_at: now }) })
}
