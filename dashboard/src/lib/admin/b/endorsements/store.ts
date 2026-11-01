/**
 * Rows of the endorsement loop: batches, the movements in them, and the events that put every
 * step on the case and in the company ledger. Server only.
 */
import { sb, sbTry, enc } from '@/lib/crm/db'
import { depositEvent } from '@/lib/admin/k/deposit'
import type { PolicyMovement, PolicyRow } from '@/lib/policies/types'
import type { BatchRow, Cadence } from './types'
import { batchWindow } from './rules'

type Row = Record<string, any>
const REP = { Prefer: 'return=representation' }
const MIN = { Prefer: 'return=minimal' }

export type MovementRow = PolicyMovement & {
  movement_type: string; subject: string | null; batch_id: string | null; work_item_id: string | null; read_by: string | null; quote: string | null
  last_day: string | null; employment_date: string | null; category: string | null; plan_code: string | null
  estimate_amount: number | null; annual_rate: number | null; sent_at: string | null; noted_at: string | null; billed_at: string | null; settled_at: string | null
}

export async function batch(id: string): Promise<BatchRow | null> {
  const [b] = await sbTry<BatchRow[]>(`movement_batches?id=eq.${enc(id)}&limit=1`, [])
  return b ?? null
}

export async function batchMovements(batchId: string): Promise<MovementRow[]> {
  return sbTry<MovementRow[]>(`policy_movements?batch_id=eq.${enc(batchId)}&status=neq.cancelled&order=created_at.asc`, [])
}

export async function patchBatch(id: string, row: Row): Promise<void> {
  await sb(`movement_batches?id=eq.${enc(id)}`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })
}

export async function patchMovements(ids: string[], row: Row): Promise<void> {
  if (!ids.length) return
  await sb(`policy_movements?id=in.(${ids.join(',')})`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })
}

/** The open batch a change reported now joins on this policy, created when the window has none. */
export async function openBatchFor(policy: PolicyRow & { endorsement_cadence?: Cadence | null }, now = new Date()): Promise<BatchRow> {
  const cadence: Cadence = policy.endorsement_cadence ?? 'weekly'
  const w = batchWindow(cadence, now)
  const [have] = await sbTry<BatchRow[]>(`movement_batches?policy_id=eq.${enc(policy.id)}&status=eq.open&window_start=eq.${w.window_start}&limit=1`, [])
  if (have) return have
  const [made] = await sb<BatchRow[]>('movement_batches', { method: 'POST', headers: REP, body: JSON.stringify({ policy_id: policy.id, company_id: policy.company_id, insurer_company_id: policy.chosen_insurer_company_id ?? null, cadence, ...w, status: 'open' }) })
  return made
}

export async function openBatches(): Promise<BatchRow[]> {
  return sbTry<BatchRow[]>('movement_batches?status=eq.open&select=*&limit=500', [])
}

export async function batchesWhere(filter: string): Promise<BatchRow[]> {
  return sbTry<BatchRow[]>(`movement_batches?${filter}&select=*&limit=500`, [])
}

/**
 * One event on the case, and the same line in the company ledger. The ledger is what a person
 * and every agent read, so every step of the loop goes through here.
 */
export async function batchEvent(workItemId: string | null, kind: string, actor: string, detail: Row = {}): Promise<string | null> {
  if (!workItemId) return null
  const [e] = await sb<Row[]>('work_item_events', { method: 'POST', headers: REP, body: JSON.stringify({ work_item_id: workItemId, kind, actor, detail }) })
  if (e?.id) await depositEvent('work_item_events', e.id).catch(() => 0)
  return e?.id ?? null
}

export async function touchItem(workItemId: string, row: Row): Promise<void> {
  await sb(`work_items?id=eq.${enc(workItemId)}`, { method: 'PATCH', headers: MIN, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })
}

/** The policies of a company that can take a mid-term change: bound or live, of any class. */
export async function livePolicies(companyId: string): Promise<(PolicyRow & { endorsement_cadence: Cadence })[]> {
  return sbTry<(PolicyRow & { endorsement_cadence: Cadence })[]>(`policies?company_id=eq.${enc(companyId)}&lifecycle=in.(bound,live,renewal_due)&order=is_eb.desc,end_date.desc.nullslast`, [])
}
