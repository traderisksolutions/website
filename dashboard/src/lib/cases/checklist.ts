/**
 * Document checklists: what a quote needs before it can go to market, and which of those documents
 * are already on a case.
 *
 * The basic list holds the documents every renewal and quote case is checked for; a line's own list
 * adds to it. Both are held in Settings, each document Required or Optional. Code ticks an item when
 * a file on the case's picked threads carries one of the item's document types or words in its name,
 * or (for the client wish list) when the brief holds a client wish. A person confirms, marks an item
 * not needed, or turns a finding down; only those calls are stored. A case is complete when no
 * Required document is missing. `caseFiles` lists every file the case's emails carry, on a list or not.
 * This is not the binding gate (src/lib/admin/b/documents/gate.ts), which holds what must be on
 * file before cover is bound.
 * No model reads anything here.
 *
 * Pure. Tested in __tests__/checklist.test.ts. The reads and writes are in brief-store.ts.
 */
import { classifyByName, docLabel, isDocType, isNoise } from '@/lib/documents/taxonomy'
import { detectLine } from '@/lib/admin/b/relay/intent'
import { isValidProductLine, productLineLabel } from '@/lib/product-lines'
import type { SourceMessage } from './sources'

/** Case types that run on a checklist: the two that go to market. */
export const CHECKLIST_CASE_TYPES: ReadonlySet<string> = new Set(['renewal', 'new_quote'])

/** Lines that share the Employment Benefits list. */
const EMPLOYMENT_BENEFITS = new Set(['employee_benefits', 'group_health', 'group_personal_accident'])
/** The list a line of insurance uses. */
export const checklistLine = (line: string | null | undefined): string | null => (!line ? null : EMPLOYMENT_BENEFITS.has(line) ? 'employee_benefits' : line)
/** The list every renewal and quote case is checked against, whatever its line. */
export const BASIC_LIST = 'basic'
export const lineName = (line: string) => (line === BASIC_LIST ? 'Basic documents' : checklistLine(line) === 'employee_benefits' ? 'Employment Benefits' : productLineLabel(line))

export type LineBy = 'person' | 'policy' | 'title'
/** The case's line of insurance: a person's choice, else the policy's, else what the title says. */
export function caseLine(c: { chosen?: string | null; policyLine?: string | null; policyClass?: string | null; title?: string | null }): { line: string; by: LineBy } | null {
  if (c.chosen && isValidProductLine(c.chosen)) return { line: c.chosen, by: 'person' }
  const policy = c.policyLine && isValidProductLine(c.policyLine) ? c.policyLine : c.policyClass ? detectLine(c.policyClass) : null
  if (policy) return { line: policy, by: 'policy' }
  const title = c.title ? detectLine(c.title) : null
  return title ? { line: title, by: 'title' } : null
}

export const FOUND_BY = ['file', 'wish', 'person'] as const
export type FoundBy = typeof FOUND_BY[number]
export const FOUND_BY_NAME: Record<FoundBy, string> = { file: 'A file on the case', wish: 'Client wish on the brief', person: 'A person only' }

export type ChecklistItem = { id: string; line: string; label: string; found_by: FoundBy; doc_types: string[]; words: string[]; position: number; active: boolean; /** False marks the document optional. */ required: boolean }
export type FileRef = { message_id: string; filename: string }
/** A person's stored calls on one item of one case. */
export type Call = { item_id: string; status: 'confirmed' | 'not_needed' | null; message_id: string | null; filename: string | null; found: boolean; rejected: FileRef[]; actor: string; at: string }
export type Finding = FileRef & { thread_id: string; at: string | null; from: string | null }

export const LABEL_MAX = 80
const WORD_MAX = 40
const WORDS_MAX = 8

/** An item as Settings may store it, or why not. */
export function cleanItem(raw: unknown): { item: Pick<ChecklistItem, 'label' | 'found_by' | 'doc_types' | 'words'> } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const label = String(r.label ?? '').replace(/\s+/g, ' ').trim()
  if (label.length < 2) return { error: 'Name the document.' }
  if (label.length > LABEL_MAX) return { error: `Keep the name under ${LABEL_MAX} characters.` }
  const found_by = (FOUND_BY as readonly string[]).includes(String(r.found_by)) ? r.found_by as FoundBy : 'file'
  const types = Array.isArray(r.doc_types) ? r.doc_types : []
  if (types.some(t => !isDocType(t))) return { error: 'Unknown document type.' }
  const words = Array.from(new Set((Array.isArray(r.words) ? r.words : []).map(w => String(w ?? '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean)))
  if (words.some(w => w.length < 3 || w.length > WORD_MAX)) return { error: `A word is 3 to ${WORD_MAX} characters.` }
  if (words.length > WORDS_MAX) return { error: `At most ${WORDS_MAX} words.` }
  const doc_types = Array.from(new Set(types as string[]))
  if (found_by === 'file' && !doc_types.length && !words.length) return { error: 'Choose a document type or a word a file name carries.' }
  return { item: { label, found_by, doc_types: found_by === 'file' ? doc_types : [], words: found_by === 'file' ? words : [] } }
}

const spaced = (filename: string) => ` ${filename.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(/[^a-z0-9]+/g, ' ').trim()} `
/** Whether a file's name says it is this document. */
export function fileMatches(item: Pick<ChecklistItem, 'doc_types' | 'words'>, filename: string): boolean {
  if (isNoise(filename)) return false
  const type = classifyByName(filename)
  if (type && item.doc_types.includes(type)) return true
  const name = spaced(filename)
  return item.words.some(w => name.includes(` ${w}`))
}

const sameFile = (a: FileRef, b: FileRef) => a.message_id === b.message_id && a.filename === b.filename
/** The newest file on the case that is this document, leaving out the findings a person turned down. */
export function findFile(item: ChecklistItem, messages: readonly SourceMessage[], rejected: readonly FileRef[] = []): Finding | null {
  if (item.found_by !== 'file') return null
  const newest = [...messages].sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')))
  for (const m of newest) for (const filename of m.files ?? []) {
    if (!fileMatches(item, filename) || rejected.some(r => sameFile(r, { message_id: m.id, filename }))) continue
    return { message_id: m.id, filename, thread_id: m.thread_id, at: m.sent_at, from: m.from_address }
  }
  return null
}

export type ItemState = 'missing' | 'found' | 'confirmed' | 'not_needed'
export const ITEM_STATE_NAME: Record<ItemState, string> = { missing: 'Missing', found: 'Found', confirmed: 'Confirmed', not_needed: 'Not needed' }
export type ChecklistRow = {
  item_id: string; label: string; found_by: FoundBy; required: boolean; state: ItemState
  /** The file code found, or the file on record from the person's confirmation. */
  file: Finding | null
  /** Who made the call, and when. */
  actor: string | null; at: string | null
}
export type ChecklistState = {
  rows: ChecklistRow[]
  /** Items found, confirmed or not needed. */
  ticked: number; confirmed: number; total: number
  /** The same count over the Required items only. */
  required: number; required_ticked: number
  /** No Required document is missing. */
  complete: boolean
}

/**
 * The documents one case is checked for: its line's list, then the basic documents the line's list
 * does not already ask for (the same name, or a document type the two share).
 */
export function caseItems(basic: readonly ChecklistItem[], line: readonly ChecklistItem[]): ChecklistItem[] {
  const own = line.filter(i => i.active)
  const labels = new Set(own.map(i => i.label.toLowerCase()))
  const types = new Set(own.flatMap(i => i.doc_types))
  return [...own, ...basic.filter(i => i.active && !labels.has(i.label.toLowerCase()) && !i.doc_types.some(t => types.has(t)))]
}

/**
 * Where each active item of a list stands on one case, the line's own documents before the basic
 * ones. A person's call stands over what code finds; without one, an item is found when a file (or a
 * client wish) is on the case.
 */
export function checklistState(items: readonly ChecklistItem[], calls: readonly Call[], messages: readonly SourceMessage[], hasWish: boolean): ChecklistState {
  const byItem = new Map(calls.map(c => [c.item_id, c]))
  const byMessage = new Map(messages.map(m => [m.id, m]))
  const basicLast = (i: ChecklistItem) => Number(i.line === BASIC_LIST)
  const rows = items.filter(i => i.active).sort((a, b) => basicLast(a) - basicLast(b) || a.position - b.position || a.label.localeCompare(b.label)).map((item): ChecklistRow => {
    const call = byItem.get(item.id)
    const base = { item_id: item.id, label: item.label, found_by: item.found_by, required: item.required }
    if (call?.status) {
      const m = call.message_id ? byMessage.get(call.message_id) : undefined
      const file = call.status === 'confirmed' && call.message_id && call.filename && m ? { message_id: call.message_id, filename: call.filename, thread_id: m.thread_id, at: m.sent_at, from: m.from_address } : null
      return { ...base, state: call.status, file, actor: call.actor, at: call.at }
    }
    const file = findFile(item, messages, call?.rejected ?? [])
    const found = item.found_by === 'wish' ? hasWish : !!file
    return { ...base, state: found ? 'found' : 'missing', file, actor: null, at: null }
  })
  const ticked = rows.filter(r => r.state !== 'missing').length
  const needed = rows.filter(r => r.required)
  const neededTicked = needed.filter(r => r.state !== 'missing').length
  return {
    rows, ticked, confirmed: rows.filter(r => r.state === 'confirmed' || r.state === 'not_needed').length, total: rows.length,
    required: needed.length, required_ticked: neededTicked, complete: rows.length > 0 && neededTicked === needed.length,
  }
}

export type CaseFile = Finding & { /** The document type the file's name says, by its label. */ type: string | null }
/** Every file the case's emails carry, newest first. Signature images and the like are left out. */
export function caseFiles(messages: readonly SourceMessage[]): CaseFile[] {
  const out: CaseFile[] = []
  for (const m of messages) for (const filename of m.files ?? []) {
    if (isNoise(filename)) continue
    const type = classifyByName(filename)
    out.push({ message_id: m.id, filename, thread_id: m.thread_id, at: m.sent_at, from: m.from_address, type: type ? docLabel(type) : null })
  }
  return out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')) || a.filename.localeCompare(b.filename))
}
