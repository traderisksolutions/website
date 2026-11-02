/**
 * The register on disk: work_item_documents (20261103_work_item_documents.sql), one row per
 * required document per case. syncRegister recomputes what the case needs, reads what has
 * arrived, and writes the difference; a person can waive a row from the review page.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { itemEvent, type CaseData } from '../data'
import { requiredDocuments, detectReceived, gateState, DOC_LABEL, type DocKind, type DocStatus, type GateContext, type GateState, type Record_ } from './gate'

type Row = Record<string, any>

export type RegisterRow = { kind: DocKind; label: string; status: DocStatus; owed_by: string; basis: string | null; due_on: string | null; requested_at: string | null; received_at: string | null; filename: string | null; note: string | null }

export async function listRegister(workItemId: string): Promise<RegisterRow[]> {
  const rows = await sbTry<Row[]>(`work_item_documents?work_item_id=eq.${enc(workItemId)}&select=kind,status,owed_by,basis,due_on,requested_at,received_at,filename,note&order=created_at.asc`, [])
  return rows.map(r => ({ kind: r.kind, label: DOC_LABEL[r.kind as DocKind] ?? r.kind, status: r.status, owed_by: r.owed_by, basis: r.basis ?? null, due_on: r.due_on ?? null, requested_at: r.requested_at ?? null, received_at: r.received_at ?? null, filename: r.filename ?? null, note: r.note ?? null }))
}

/**
 * Brings the register up to date for a case and returns the gate. Rows a person waived stay
 * waived; a document that has arrived flips to received; a requirement that no longer applies
 * is removed unless something was recorded against it.
 */
export async function syncRegister(d: CaseData, ctx: Omit<GateContext, 'caseType'> & { caseType?: string | null }, opts: { instructionMessageId?: string | null } = {}): Promise<GateState> {
  const required = requiredDocuments({ caseType: ctx.caseType ?? d.item.case_type ?? null, ...ctx })
  const existing = await sbTry<Row[]>(`work_item_documents?work_item_id=eq.${enc(d.item.id)}&select=id,kind,status,filename,received_at,requested_at,note`, [])
  const by = new Map(existing.map(r => [r.kind as DocKind, r]))
  const arrived = detectReceived(required, { messages: d.messages.map(m => ({ id: m.id, side: m.side, text: m.text, sent_at: m.sent_at, files: m.files })) }, opts.instructionMessageId ?? null)
  const now = new Date().toISOString()
  for (const r of required) {
    const got = arrived.find(a => a.kind === r.kind)
    const row = by.get(r.kind)
    if (!row) {
      await sbTry('work_item_documents', null, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ work_item_id: d.item.id, kind: r.kind, owed_by: r.owedBy, basis: r.basis, status: got ? 'received' : 'needed', received_at: got?.at ?? (got ? now : null), filename: got?.filename ?? null, message_id: got?.message_id ?? null }) })
      if (got) await itemEvent(d.item.id, 'note', 'documents', { received: r.kind, filename: got.filename })
    } else if (got && row.status !== 'received' && row.status !== 'waived') {
      await sbTry(`work_item_documents?id=eq.${enc(row.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'received', received_at: got.at ?? now, filename: got.filename, message_id: got.message_id, updated_at: now }) })
      await itemEvent(d.item.id, 'note', 'documents', { received: r.kind, filename: got.filename })
    } else if (row.basis !== r.basis) {
      await sbTry(`work_item_documents?id=eq.${enc(row.id)}`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ basis: r.basis, updated_at: now }) })
    }
  }
  // Requirements that lapsed (the start date moved to today, so no LOU) go, unless something was recorded.
  for (const row of existing) {
    if (!required.some(r => r.kind === row.kind) && row.status === 'needed' && !row.requested_at) await sbTry(`work_item_documents?id=eq.${enc(row.id)}`, null, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  }
  const records: Record_[] = (await sbTry<Row[]>(`work_item_documents?work_item_id=eq.${enc(d.item.id)}&select=kind,status,filename,received_at,requested_at,note`, [])).map(r => ({ kind: r.kind, status: r.status, filename: r.filename, received_at: r.received_at, requested_at: r.requested_at, note: r.note }))
  return gateState(required, records)
}

/** Marks the needed rows as requested today, when the ask has been drafted. */
export async function markRequested(workItemId: string, kinds: DocKind[]): Promise<void> {
  if (!kinds.length) return
  await sbTry(`work_item_documents?work_item_id=eq.${enc(workItemId)}&kind=in.(${kinds.join(',')})&status=in.(needed,requested)`, null, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'requested', requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }) })
}

/** A person's call on one row: waived (with a note), or back to needed. */
export async function setRegisterStatus(workItemId: string, kind: DocKind, status: 'waived' | 'needed' | 'received', actor: string, note: string | null): Promise<void> {
  const now = new Date().toISOString()
  await sb(`work_item_documents?work_item_id=eq.${enc(workItemId)}&kind=eq.${enc(kind)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status, note, waived_by: status === 'waived' ? actor : null, received_at: status === 'received' ? now : null, updated_at: now }) })
  await itemEvent(workItemId, 'note', actor, { document: kind, status, note })
}

/** Open items whose register still waits on the client, with how long since the ask. */
export async function openRegisters(): Promise<{ work_item_id: string; kinds: DocKind[]; requested: string | null }[]> {
  const rows = await sbTry<Row[]>(`work_item_documents?status=in.(needed,requested)&owed_by=eq.client&select=work_item_id,kind,requested_at,created_at&limit=2000`, [])
  const by = new Map<string, { kinds: DocKind[]; requested: string | null; anyUnasked: boolean }>()
  for (const r of rows) {
    const cur = by.get(r.work_item_id) ?? { kinds: [], requested: null, anyUnasked: false }
    cur.kinds.push(r.kind)
    if (r.requested_at) { if (!cur.requested || r.requested_at > cur.requested) cur.requested = r.requested_at } else cur.anyUnasked = true
    by.set(r.work_item_id, cur)
  }
  // A row never asked for makes the whole ask due now.
  return Array.from(by.entries()).map(([work_item_id, v]) => ({ work_item_id, kinds: v.kinds, requested: v.anyUnasked ? null : v.requested }))
}
